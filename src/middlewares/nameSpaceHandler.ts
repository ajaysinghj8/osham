import * as Debug from 'debug';
import { IContext, INameSpaceOptions } from '../types';
import { generateKey } from '../services/genkey.service';
import { Cache } from '../services/cache.service';
import { RequestPool } from '../services/pool.service';
import { ConfigContext } from '../services/Config.Context';
import { respondWithCtx, errorToData } from '../utils';
import { createProxy } from '../proxy';

import * as Koa from 'koa';
import { OshamHeaders } from '../osham.headers';
import { minimatch } from 'minimatch';
import { Metrics } from '../services/metrics.service';
// eslint-disable-next-line
const pathToRegExp = require('path-to-regexp');

export function createNameSpaceHandler(
  namespace: string,
  options: INameSpaceOptions,
): (ctx: IContext, next: Koa.Next) => Promise<void> {
  const logger = Debug(`acp:handler(${namespace})`);
  logger(`Register ${namespace}`);
  const namespacePath = pathToRegExp(options.expose, [], {
    sensitive: false,
    strict: false,
    end: false,
  });

  const configContext = new ConfigContext(options.cache, options.rules);
  const proxyRequest = createProxy(options);

  return async function handler(ctx: IContext, next: Koa.Next) {
    if (!namespacePath.test(ctx.path)) return next();
    Metrics.recordRequest(namespace);
    const startedAt = Date.now();
    const finish = (statusCode: number) => {
      Metrics.recordRequestDuration(namespace, ctx.method, statusCode, (Date.now() - startedAt) / 1000);
    };

    const pathToCall = ctx.path.match(namespacePath)[1];
    logger(`→ %s %s`, ctx.method, pathToCall);

    // Allow/deny pattern enforcement: deny wins over allow.
    // Normalize to an absolute path. We try matching both /path and /path/ so that
    // patterns like '/employees/**' match whether the request ends with '/' or not,
    // and patterns like '/employee/*' correctly reject deeper paths like '/employee/5/sub'.
    const raw = pathToCall.startsWith('/') ? pathToCall : `/${pathToCall}`;
    const matchPath = raw;
    const matchPathAlt = raw.endsWith('/') && raw.length > 1 ? raw.slice(0, -1) : `${raw}/`;
    const matchesAny = (pattern: string) => minimatch(matchPath, pattern) || minimatch(matchPathAlt, pattern);
    if (options.deny && options.deny.some(matchesAny)) {
      ctx.statusCode = 403;
      ctx.set('x-osham-cache', 'denied');
      ctx.body = 'Forbidden';
      finish(ctx.statusCode);
      return ctx.respond();
    }
    if (options.allow && !options.allow.some(matchesAny)) {
      ctx.statusCode = 403;
      ctx.set('x-osham-cache', 'denied');
      ctx.body = 'Forbidden';
      finish(ctx.statusCode);
      return ctx.respond();
    }

    const cacheConfig = configContext.getCacheConfig(pathToCall);
    const proxyPath = pathToCall + (ctx.search || '');
    if (ctx.method !== 'GET' || !cacheConfig) {
      logger(`bypass %s %s — %s`, ctx.method, pathToCall, !cacheConfig ? 'no cache config' : 'non-GET');
      const proxyCtxN = await proxyRequest(proxyPath, ctx.method, ctx.headers);
      const response = await proxyCtxN.toPromise().catch(err => err);
      finish(response.statusCode);
      return respondWithCtx(ctx, OshamHeaders.notConfigured(ctx.method))(response as never);
    }

    const cacheKey = generateKey(namespace, ctx, cacheConfig);
    const oshamHeaders = new OshamHeaders(cacheKey);
    logger(`cache check %s (key: %s)`, pathToCall, cacheKey);
    try {
      const cached = await Cache.getWithMetrics(cacheKey, namespace);
      finish(200);
      return respondWithCtx(ctx, oshamHeaders.setHit(true).toRecords())(cached as never);
    } catch (e) {
      oshamHeaders.setHit(false);
    }
    logger(`cache miss %s`, pathToCall);
    if (!cacheConfig.pool) {
      logger(`[pool] no pool configured for %s, forwarding directly`, pathToCall);
      const proxyCtxM = await proxyRequest(proxyPath, ctx.method, ctx.headers);
      const responsePromise = proxyCtxM.toPromise();
      responsePromise.then(res => Cache.put(cacheKey, res.toJSON(), +cacheConfig.expires)).catch(() => ({}));
      const response = await responsePromise.catch(err => err);
      finish(response.statusCode);
      return respondWithCtx(ctx, oshamHeaders.toRecords())(response as never);
    }

    if (RequestPool.has(cacheKey) && Cache.isConnected()) {
      logger(`[pool] follower — waiting on in-flight request for %s`, cacheKey);
      oshamHeaders.setPooled(true);
      const response = await RequestPool.wait(cacheKey);
      const pooledResponse = response as { statusCode: number };
      finish(pooledResponse.statusCode || 200);
      return respondWithCtx(ctx, oshamHeaders.toRecords())(response as never);
    }
    if (Cache.isConnected()) {
      logger(`[pool] leader — acquiring pool slot for %s`, cacheKey);
      RequestPool.add(cacheKey);
      oshamHeaders.setPooledMain(true);
    }
    const proxyCtx = await proxyRequest(proxyPath, ctx.method, ctx.headers);
    const responsePromise = proxyCtx.toPromise();
    responsePromise
      .then(
        res => RequestPool.putAndPublish(cacheKey, res.toJSON(), +cacheConfig.expires),
        error => {
          const response = errorToData(error);
          RequestPool.errorAndPublish(cacheKey, response);
        },
      )
      .catch(error => {
        const response = errorToData(error);
        RequestPool.errorAndPublish(cacheKey, response);
      });
    const response = await responsePromise.catch(err => err);
    finish(response.statusCode);
    return respondWithCtx(ctx, oshamHeaders.toRecords())(response as never);
  };
}
