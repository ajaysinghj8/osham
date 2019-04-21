import { Context } from "koa";

export function respondWithCtx(ctx: Context) {
    return ({ statusCode, headers, data }: any) => {
        ctx.status = statusCode;
        for (const key in headers) {
            ctx.set(key, headers[key]);
        }
        ctx.type = 'json';
        ctx.res.end(data);
        return {
            statusCode, headers, data
        };
    };
}