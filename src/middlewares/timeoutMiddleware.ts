import { Context } from '../ctx.provider';

export function timeoutMiddlewareProvider(timeout: number) {
    async function timeoutMiddleware(ctx: Context, next: Function) {
        ctx.req.socket.setTimeout(timeout, () => {
            // @todo close current socket
            // ctx.req.socket.destroy(new Error('timeout'));
        });
        await next();
    }
    return timeoutMiddleware;
}