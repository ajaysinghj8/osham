import * as Koa from 'koa';
import { IContext } from '../types';

export async function RouteTimeReqRes(ctx: IContext, next: Koa.Next): Promise<void> {
  const start = +new Date();
  await next();
  const ms = +new Date() - start;
  ctx.set('X-Response-Time', `${ms}ms`);
}
