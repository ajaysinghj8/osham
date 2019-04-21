import { Context } from "koa";
import * as Debug from 'debug';
import { INameSpaceOptions } from "../types";
import { generateKey } from "../services/genkey.service";
import { Cache } from "../services/cache.service";
import { RequestPool } from "../services/pool.service";
import { ConfigContext } from "../services/Config.Context";
import { makeRequest, errorToData } from "../services/request.service";
import { respondWithCtx } from "../utils";
import { createProxy } from "../proxy";

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

    return function handler(ctx: Context, next: any) {
        if (!namespacePath.test(ctx.path)) return next();
        logger(`${ctx.path} matched!!`);
        const pathToCall = ctx.path.match(namespacePath)[1];
        logger(`${pathToCall} will be processed!`);
        ctx.respond = false;
        const cacheConfig = configContext.getCacheConfig(pathToCall);
        const proxyPath = pathToCall + (ctx.search || '');

        if (ctx.method !== 'GET') {
            return proxyRequest(proxyPath, ctx.method, ctx.headers).pipes(ctx.res);
        }
        if (!cacheConfig || !Cache.isConnected()) {
            logger(`No cache config found for ${pathToCall}`);
            return proxyRequest(proxyPath, ctx.method, ctx.headers).pipes(ctx.res);
        }

        const cacheKey = generateKey(namespace, ctx, cacheConfig);
        logger(`Cache Check ${pathToCall}`);
        return Cache.get(cacheKey).then(
            respondWithCtx(ctx),
            () => {
                logger(`Cache miss ${pathToCall}`);
                if (!cacheConfig.pool) {
                    logger(`No request pool`);
                    return proxyRequest(proxyPath, ctx.method, ctx.headers).pipes(ctx.res)
                        .toPromise().then((res: any) => Cache.put(cacheKey, res.toJSON(), +cacheConfig.expires));
                }

                if (RequestPool.has(cacheKey)) {
                    return RequestPool.wait(cacheKey).then(respondWithCtx(ctx));
                }

                RequestPool.add(cacheKey);
                return proxyRequest(proxyPath, ctx.method, ctx.headers).pipes(ctx.res).toPromise()
                    .then((res: any) => RequestPool.putAndPublish(cacheKey, res.toJSON(), +cacheConfig.expires))
                    .catch((error: any) => {
                        const response = errorToData(error);
                        respondWithCtx(ctx)(response);
                        RequestPool.errorAndPublish(cacheKey, response)
                    });
            }
        );
    };
}


