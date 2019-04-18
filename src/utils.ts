import { Context } from './ctx.provider';

export function respondWithCtx(ctx: Context) {
    return ({ statusCode, headers, data }: any) => {
        ctx.status = statusCode;
        for (const key in headers) {
            ctx.set(key, headers[key]);
        }
        ctx.body = data;
        return {
            statusCode, headers, data
        };
    };
}