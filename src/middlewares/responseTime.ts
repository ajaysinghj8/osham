import { Context } from 'koa';

export async function RouteTimeReqRes(ctx: Context, next: any) {
    const start = +new Date();
    await next();
    const ms = +new Date() - start;
    ctx.set('X-Response-Time', `${ms}ms`);
}
