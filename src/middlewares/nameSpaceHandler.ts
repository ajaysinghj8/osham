import { Context } from "koa";
import * as Debug from 'debug';
import { INameSpaceOptions } from "../types";
import { generateKey } from "../services/genkey.service";
import { Cache } from "../services/cache.service";
import { RequestPool } from "../services/pool.service";
import { ConfigContext } from "../services/Config.Context";
import { makeRequest } from "../services/request.service";
import { respondWithCtx } from "../utils";

const pathToRegExp = require('path-to-regexp');


export function createNameSpaceHandler(namespace: string, options: INameSpaceOptions) {
    const logger = Debug(`api-cache-proxy:handler(${namespace})`);
    logger(`Register ${namespace}`);
    const namespacePath = pathToRegExp(options.expose, [], {
        sensitive: false,
        strict: false,
        end: false
    });

    const configContext = new ConfigContext(options.cache, options.rules);

    return function handler(ctx: Context, next: any) {
        if (!namespacePath.test(ctx.path)) return next();
        logger(`${ctx.path} matched!!`);
        const pathToCall = ctx.path.match(namespacePath)[1];
        logger(`${pathToCall} will be processed!`);
        const cacheConfig = configContext.getCacheConfig(pathToCall);
        const proxyPath = options.proxy + '/' + pathToCall + (ctx.search || '');
        if (!cacheConfig || !Cache.isConnected()) {
            logger(`No cache config found for ${pathToCall}`);
            return makeRequest(ctx, proxyPath, ctx.headers);
        }

        const cacheKey = generateKey(namespace, ctx, cacheConfig);
        logger(`Cache Check ${pathToCall}`);
        return Cache.get(cacheKey).then(
            respondWithCtx(ctx),
            () => {
                logger(`Cache miss ${pathToCall}`);
                if (!cacheConfig.pool) {
                    logger(`No request pool`);
                    return makeRequest(ctx, proxyPath, ctx.headers)
                        .then((res) => Cache.put(cacheKey, res, +cacheConfig.expires))
                }

                if (RequestPool.has(cacheKey)) {
                    return RequestPool.wait(cacheKey).then(respondWithCtx(ctx));
                }

                RequestPool.add(cacheKey);
                return makeRequest(ctx, proxyPath, ctx.headers)
                    .then((res) => RequestPool.putAndPublish(cacheKey, res, +cacheConfig.expires));
            }
        );
    };
}


