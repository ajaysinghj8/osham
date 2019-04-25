import { Context } from './ctx.provider';

export function respondWithCtx(ctx: Context) {
    return ({ statusCode, headers, data }: any) => {
        ctx.statusCode = statusCode;
        for (const key in headers) {
            if (!Object.prototype.hasOwnProperty.call(headers, key)) continue;
            ctx.set(key, headers[key]);
        }
        ctx.body = data;
        return {
            statusCode, headers, data
        };
    };
}

export function nextTick() {
    return new Promise((resolve) => {
        process.nextTick(resolve);
    });
}