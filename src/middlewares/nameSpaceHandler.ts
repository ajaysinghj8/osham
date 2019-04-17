import { Context } from "koa";
import * as Debug from 'debug';
import { ICacheOptions, IRulesOptions, INameSpaceOptions } from "../types";
import { generateKey } from "../services/genkey.service";
import Axios, { AxiosError, AxiosResponse } from 'axios';
import { Cache } from "../services/cache.service";
import { RequestPool } from "../services/pool.service";

const pathToRegExp = require('path-to-regexp');

class ConfigContext {
    private regexRules: any = {};
    constructor(private cacheOption: ICacheOptions, private rules: IRulesOptions) {
        //@todo : memo
        // this.getConfig = memo(this.getConfig)
        for (const key in this.rules) {
            const regex = pathToRegExp(key);
            this.regexRules[key] = regex;
        }
    }
    getConfig(path: string) {
        return { ...this.cacheOption, ...this.getConfigFromRule(path) };
    }

    private getConfigFromRule(path: string) {
        for (const key in this.rules) {
            const regex = this.regexRules[key];
            if (path.match(regex)) {
                return this.rules[key];
            }
        }
        return null;
    }
}

export function createNameSpaceHandler(namespace: string, options: INameSpaceOptions) {
    const logger = Debug(`api-cache-proxy:handler(${namespace})`);
    logger(`Register ${namespace}`);
    const namespacePath = pathToRegExp(options.expose, [], {
        sensitive: false,
        strict: false,
        end: false
    });

    const configContext = new ConfigContext(options.cache, options.rules);

    return async function handler(ctx: Context, next: any) {
        if (!namespacePath.test(ctx.path)) return next();
        logger(`${ctx.path} matched!!`);
        const pathToCall = ctx.path.match(namespacePath)[1];
        logger(`${pathToCall} will be processed!`);
        const cacheConfig = configContext.getConfig(pathToCall);
        const proxyPath = options.proxy + '/' + pathToCall + (ctx.search || '');
        if (!cacheConfig || !Cache.isConnected()) {
            logger(`No cache config found for ${pathToCall}`);
            // cache option not set
            //@todo : hit the proxy and send the response
            return await Axios.get(proxyPath, ctx.headers).then((response: AxiosResponse) => {
                ctx.status = response.status;
                for (const key in response.headers) {
                    ctx.set(key, response.headers[key]);
                }
                // ctx.body = response.data;
                ctx.type = 'json';
                ctx.res.end(response.data);
            }, (error: AxiosError) => {
                ctx.status = error.response.status;
                // ctx.body = error.response.data;
                ctx.res.end(error.response.data);
            });
        }
        const cacheKey = generateKey(namespace, ctx, cacheConfig);
        return Cache.get(cacheKey).then((data: any) => {
            console.log('from cache');
            ctx.status = data.status;
            for (const key in data.headers) {
                ctx.set(key, data.headers[key]);
            }
            // ctx.body = data.body;
            ctx.type = 'json';
            ctx.res.end(JSON.stringify(data.body));
        }, () => {
            if (!cacheConfig.pool) {
                return Axios.get(proxyPath, ctx.headers).then((response: AxiosResponse) => {
                    ctx.status = response.status;
                    for (const key in response.headers) {
                        ctx.set(key, response.headers[key]);
                    }
                    // ctx.body = response.data;
                    ctx.type = 'json';
                    ctx.res.end(JSON.stringify(response.data));
                    // async put
                    Cache.put(cacheKey, { body: response.data, headers: response.headers, status: response.status }, +cacheConfig.expires);
                }, (error: AxiosError) => {
                    ctx.status = error.response.status;
                    //ctx.body = error.response.data;
                    ctx.res.end(error.response.data);
                });
            }

            if (RequestPool.has(cacheKey)) {
                return RequestPool.wait(cacheKey).then((data: any) => {
                    ctx.status = data.status;
                    for (const key in data.headers) {
                        ctx.set(key, data.headers[key]);
                    }
                    // ctx.body = data.body;
                    ctx.type = 'json';
                    ctx.res.end(JSON.stringify(data.body));
                });
            }
            RequestPool.add(cacheKey);
            return Axios.get(proxyPath, ctx.headers).then((response: AxiosResponse) => {
                ctx.status = response.status;
                for (const key in response.headers) {
                    ctx.set(key, response.headers[key]);
                }
                ctx.type = 'json';
                // ctx.body = ;
                ctx.res.end(JSON.stringify(response.data));
                // async put
                const keyValues = { body: response.data, headers: response.headers, status: response.status };
                // RedisPub.emit(cacheKey, JSON.stringify(keyValues));
                // Cache.put(cacheKey, keyValues, +cacheConfig.expires).then(() => RequestPool.delete(cacheKey));
                RequestPool.putAndPublish(cacheKey, keyValues, +cacheConfig.expires);
            }, (error: AxiosError) => {
                ctx.status = error.response.status;
                ctx.res.end(error.response.data);
                // ctx.body = error.response.data;
            });

        }).catch(() => {

        });

        // cache in cache -> success -> response
        // failed
        // if pool
        // ->check if added in pool -> wait till event
        // ->add in pool
        // ->get data from api
        // ->response back
        // ->put data into cache
        // otherwise
        // get data from api
        // response back
        // put data into cache

    };
}


