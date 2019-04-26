import { Context } from '../ctx.provider';
import * as Debug from 'debug';
import { INameSpaceOptions } from '../types';
import { generateKey } from '../services/genkey.service';
import { Cache } from '../services/cache.service';
import { RequestPool } from '../services/pool.service';
import { ConfigContext } from '../services/Config.Context';
import { errorToData } from '../services/request.service';
import { respondWithCtx } from '../utils';
import { createProxy } from '../proxy';
// tslint:disable-next-line: no-var-requires
const pathToRegExp = require('path-to-regexp');

export function createNameSpaceHandler(namespace: string, options: INameSpaceOptions) {
    const logger = Debug(`acp:handler(${namespace})`);
    logger(`Register ${namespace}`);
    const namespacePath = pathToRegExp(options.expose, [], {
        sensitive: false,
        strict: false,
        end: false
    });

    const configContext = new ConfigContext(options.cache, options.rules);
    const proxyRequest = createProxy(options);

    return async function handler(ctx: Context, next: any) {
        if (!namespacePath.test(ctx.path)) return next();
        logger(`${ctx.path} matched!!`);
        const pathToCall = ctx.path.match(namespacePath)[1];
        logger(`${pathToCall} will be processed!`);

        const cacheConfig = configContext.getCacheConfig(pathToCall);
        const proxyPath = pathToCall + (ctx.search || '');

        if ((ctx.method !== 'GET') || !cacheConfig) {
            logger(`${ctx.method} ${pathToCall} ${cacheConfig ? '(No cache config)' : ''}`);
            const proxyCtxN: any = await proxyRequest(proxyPath, ctx.method, ctx.headers);
            return proxyCtxN.pipes(ctx);
        }

        const cacheKey = generateKey(namespace, ctx, cacheConfig);
        logger(`Cache Check ${pathToCall}`);
        try {
            return await Cache.get(cacheKey).then(respondWithCtx(ctx));
        } catch (e) { }
        logger(`Cache miss ${pathToCall}`);
        if (!cacheConfig.pool) {
            logger(`No request pool`);
            const proxyCtxM: any = await proxyRequest(proxyPath, ctx.method, ctx.headers);
            // async
            proxyCtxM.toPromise(ctx).then((res: any) => Cache.put(cacheKey, res.toJSON(), +cacheConfig.expires))
                .catch(() => ({}));
            return proxyCtxM.pipes(ctx);
        }

        if (RequestPool.has(cacheKey)) {
            return RequestPool.wait(cacheKey).then(respondWithCtx(ctx));
        }

        RequestPool.add(cacheKey);
        const proxyCtx: any = await proxyRequest(proxyPath, ctx.method, ctx.headers);
        proxyCtx.toPromise(ctx)
            .then(
                (res: any) => RequestPool.putAndPublish(cacheKey, res.toJSON(), +cacheConfig.expires),
                (error: any) => {
                    const response = errorToData(error);
                    RequestPool.errorAndPublish(cacheKey, response);
                }
            )
            .catch((error: any) => {
                const response = errorToData(error);
                RequestPool.errorAndPublish(cacheKey, response);
            });
        return proxyCtx.pipes(ctx);
    };
}
