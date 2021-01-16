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
    logger(`${ctx.path} matched!!`);
    const pathToCall = ctx.path.match(namespacePath)[1];
    logger(`${pathToCall} will be processed!`);

    const cacheConfig = configContext.getCacheConfig(pathToCall);
    const proxyPath = pathToCall + (ctx.search || '');
    if (ctx.method !== 'GET' || !cacheConfig) {
      logger(`${ctx.method} ${pathToCall} ${cacheConfig ? '(No cache config)' : ''}`);
      const proxyCtxN = await proxyRequest(proxyPath, ctx.method, ctx.headers);
      return proxyCtxN.pipes(ctx, OshamHeaders.notConfigured(ctx.method));
    }

    const cacheKey = generateKey(namespace, ctx, cacheConfig);
    const oshamHeaders = new OshamHeaders(cacheKey);
    logger(`Cache Check ${pathToCall}`);
    try {
      return await Cache.get(cacheKey).then(respondWithCtx(ctx, oshamHeaders.setHit(true).toRecords()));
    } catch (e) {
      oshamHeaders.setHit(false);
    }
    logger(`Cache miss ${pathToCall}`);
    if (!cacheConfig.pool) {
      logger(`No request pool`);
      const proxyCtxM = await proxyRequest(proxyPath, ctx.method, ctx.headers);
      // async
      proxyCtxM
        .toPromise()
        .then(res => Cache.put(cacheKey, res.toJSON(), +cacheConfig.expires))
        .catch(() => ({}));
      return proxyCtxM.pipes(ctx, oshamHeaders.toRecords());
    }

    if (RequestPool.has(cacheKey) && Cache.isConnected()) {
      oshamHeaders.setPooled(true);
      return RequestPool.wait(cacheKey).then(respondWithCtx(ctx, oshamHeaders.toRecords()));
    }
    if (Cache.isConnected()) {
      RequestPool.add(cacheKey);
    }
    const proxyCtx = await proxyRequest(proxyPath, ctx.method, ctx.headers);
    proxyCtx
      .toPromise()
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
    return proxyCtx.pipes(ctx, oshamHeaders.setPooledMain(true).toRecords());
  };
}
