import { Context } from '../ctx.provider';

export async function HealthCheck(ctx: Context, next: any) {
    if (ctx.path === '/health') {
        ctx.body = 'ok';
        ctx.statusCode = 200;
        return;
    }
    await next();
}
