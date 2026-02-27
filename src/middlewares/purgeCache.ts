import * as Koa from 'koa';
import { IContext } from '../types';
import { Cache } from '../services/cache.service';

const DEFAULT_PURGE_PATH = '/__osham/purge';

export async function PurgeCache(ctx: IContext, next: Koa.Next): Promise<void> {
  const purgePath = process.env.OSHAM_PURGE_PATH || DEFAULT_PURGE_PATH;
  if (ctx.path !== purgePath) {
    await next();
    return;
  }

  if (ctx.method !== 'POST' && ctx.method !== 'DELETE') {
    ctx.statusCode = 405;
    ctx.body = 'Method Not Allowed';
    return;
  }

  const query = ctx.query || {};
  const key = query.key;
  const pattern = query.pattern;

  if (!key && !pattern) {
    ctx.statusCode = 400;
    ctx.body = 'Provide ?key=... or ?pattern=...';
    return;
  }

  try {
    const deleted = key ? await Cache.purge(String(key)) : await Cache.purgeByPattern(String(pattern));
    ctx.statusCode = 200;
    ctx.set('content-type', 'application/json');
    ctx.body = JSON.stringify({ deleted });
  } catch (e) {
    ctx.statusCode = 500;
    ctx.set('content-type', 'application/json');
    ctx.body = JSON.stringify({ error: e?.message || 'purge_failed' });
  }
}
