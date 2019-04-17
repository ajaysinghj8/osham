import { Context } from "koa";
import * as Debug from 'debug';
import { ICacheOptions, IRulesOptions, INameSpaceOptions } from "../types";
import { generateKey } from "../services/genkey.service";
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
        const options = configContext.getConfig(pathToCall);
        if (!options) {
            logger(`No cache config found for ${pathToCall}`);
            // cache option not set
            //@todo : hit the proxy and send the response
        }
        const key = generateKey(namespace, ctx, options);
        // console.log(key);
        ctx.body = 'hi';
    };
}