import { ICacheOptions } from "../types";
import { Context } from "koa";
import { createHash } from 'crypto';

function createHashKey(namespace: string, token: string) {
    return `ACP:${namespace}-${createHash('sha256').update(token).digest('hex')}`;
};

export function generateKey(ns: string, ctx: Context, options: ICacheOptions) {
    if (!options.query && !options.headers) {
        return createHashKey(ns, ctx.path);
    }
    const headers: Array<string> = [];
    if (options.headers) {
        for (const header of options.headers) {
            headers.push(`${header}:${ctx.get(header)}`);
        }
    }
    return createHashKey(ns, ctx.path + headers.join('|'));
}