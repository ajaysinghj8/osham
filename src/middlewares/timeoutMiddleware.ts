import * as Koa from 'koa';
import { ComposedMiddleware } from 'koa-compose';
import { IContext } from '../types';

export function timeoutMiddlewareProvider(timeout: number): ComposedMiddleware<IContext> {
  async function timeoutMiddleware(ctx: IContext, next: Koa.Next): Promise<void> {
    ctx.req.socket.setTimeout(timeout, () => {
      // @todo close current socket
      // ctx.req.socket.destroy(new Error('timeout'));
    });
    await next();
  }
  return timeoutMiddleware;
}
