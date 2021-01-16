import * as Koa from 'koa';
import { IContext } from '../types';

export async function HealthCheck(ctx: IContext, next: Koa.Next): Promise<void> {
  if (ctx.path === '/health') {
    ctx.body = 'ok';
    ctx.statusCode = 200;
    return;
  }
  await next();
}
