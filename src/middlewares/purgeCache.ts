import * as Koa from 'koa';
import { IContext } from '../types';
import { Cache } from '../services/cache.service';

const DEFAULT_PURGE_PATH = '/__osham/purge';

/**
 * Returns a warning string if `pattern` is unusually broad (e.g. no namespace prefix),
 * otherwise undefined. Broad purges can accidentally clear keys across all namespaces.
 * Use the "O:<namespace>:<path>" prefix to scope purges safely.
 */
function broadPatternWarning(pattern: string): string | undefined {
  if (pattern === '*' || pattern === '**' || !pattern.startsWith('O:')) {
    return (
      'Pattern may match keys across all namespaces. ' +
      'Use the "O:<namespace>:<path>" prefix (e.g. "O:myNs:/api/v1/users*") for a safer, scoped purge.'
    );
  }
  return undefined;
}

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

  // Optional shared-secret auth. Set OSHAM_PURGE_SECRET to require callers to supply
  // the matching value in the x-osham-purge-secret request header.
  const purgeSecret = process.env.OSHAM_PURGE_SECRET;
  if (purgeSecret) {
    const provided = ctx.get('x-osham-purge-secret');
    if (provided !== purgeSecret) {
      ctx.statusCode = 401;
      ctx.set('content-type', 'application/json');
      ctx.body = JSON.stringify({ error: 'Unauthorized: x-osham-purge-secret header required' });
      return;
    }
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
    const warning = pattern ? broadPatternWarning(String(pattern)) : undefined;
    const deleted = key ? await Cache.purge(String(key)) : await Cache.purgeByPattern(String(pattern));
    ctx.statusCode = 200;
    ctx.set('content-type', 'application/json');
    ctx.body = JSON.stringify(warning ? { deleted, warning } : { deleted });
  } catch (e) {
    ctx.statusCode = 500;
    ctx.set('content-type', 'application/json');
    ctx.body = JSON.stringify({ error: e?.message || 'purge_failed' });
  }
}
