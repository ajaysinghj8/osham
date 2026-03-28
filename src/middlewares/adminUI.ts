import { createReadStream, existsSync, statSync } from 'fs';
import { extname, join, resolve } from 'path';
import { IContext } from '../types';
import * as Koa from 'koa';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

function getAdminUIDir(): string {
  return process.env.OSHAM_ADMIN_UI_DIR || join(process.cwd(), 'admin-ui', 'dist');
}

function isSPARoute(urlPath: string): boolean {
  return urlPath === '/' || urlPath.startsWith('/admin/');
}

export async function AdminUI(ctx: IContext, next: Koa.Next): Promise<void> {
  if (ctx.path.startsWith('/__osham/')) {
    await next();
    return;
  }

  const uiDir = getAdminUIDir();
  if (!existsSync(uiDir)) {
    await next();
    return;
  }

  // Resolve and guard against directory traversal
  const candidate = resolve(uiDir, '.' + ctx.path);
  if (!candidate.startsWith(uiDir)) {
    await next();
    return;
  }

  let serveFile: string | null = null;

  if (existsSync(candidate) && !statSync(candidate).isDirectory()) {
    serveFile = candidate;
  } else if (isSPARoute(ctx.path)) {
    serveFile = join(uiDir, 'index.html');
  }

  if (!serveFile || !existsSync(serveFile)) {
    await next();
    return;
  }

  const contentType = MIME_TYPES[extname(serveFile)] || 'application/octet-stream';
  ctx.statusCode = 200;
  ctx.set('content-type', contentType);
  ctx.body = createReadStream(serveFile);
}
