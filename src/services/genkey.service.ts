import { ICacheOptions, IContext } from '../types';
import { createHash } from 'crypto';

const hasher = createHash('sha1');
function createHashKey(namespace: string, path: string, token?: string) {
  if (!token) {
    return `O:${namespace}:${path}`;
  }
  return `O:${namespace}:${path}:${hasher.update(token).digest('base64')}`;
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
