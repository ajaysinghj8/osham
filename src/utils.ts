import { Context } from "koa";

export function respondWithCtx(ctx: Context) {
    return ({ status, headers, data }: any) => {
        ctx.status = status;
        for (const key in headers) {
            ctx.set(key, headers[key]);
        }
        ctx.type = 'json';
        ctx.res.end(data);
        return {
            status, headers, data
        };
    };
}