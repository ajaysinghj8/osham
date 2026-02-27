import { ICacheOptions, IContext } from '../types';
import { createHash } from 'crypto';

function createHashKey(namespace: string, path: string, token?: string) {
  if (!token) {
    return `O:${namespace}:${path}`;
  }
  // `crypto.Hash` instances cannot be reused after `digest()`.
  const digest = createHash('sha1').update(token).digest('base64');
  return `O:${namespace}:${path}:${digest}`;
}

export function generateKey(ns: string, ctx: IContext, options: ICacheOptions): string {
  if (!options || (!options.query && !options.headers)) {
    return createHashKey(ns, ctx.path);
  }

  const headers: Array<string> = [];
  if (options.headers) {
    for (const header of options.headers) {
      const value = ctx.get(header);
      if (!value) continue;
      headers.push(`${header}:${value}`);
    }
  }

  const queryString: Array<string> = [];
  if (options.query) {
    for (const q of options.query) {
      const value = ctx.query[q];
      if (!value) continue;
      queryString.push(`${q}=${value}`);
    }
  }

  const varient =
    (headers.length ? '-' + headers.join('|') : '') + (queryString.length ? '?' + queryString.join('&') : '');
  return createHashKey(ns, ctx.path, varient);
}
