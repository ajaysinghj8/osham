import { config } from 'dotenv';
config();
import * as Debug from 'debug';
import { Server } from './server';
import { IncomingMessage, ServerResponse } from 'http';
import { getCacheConfig } from './config.reader';
import { RouteTimeReqRes } from './middlewares/responseTime';
import { HealthCheck } from './middlewares/healthCheck';
import { PurgeCache } from './middlewares/purgeCache';
import { MetricsEndpoint } from './middlewares/metricsEndpoint';
import { AdminConfig } from './middlewares/adminConfig';
import { createNameSpaceHandler } from './middlewares/nameSpaceHandler';
import { CtxProvider } from './ctx.provider';
import * as compose from 'koa-compose';
import { IContext } from './types';
import { ComposedMiddleware } from 'koa-compose';
import { setAdminState, computeRevision } from './admin.state';
import { readFileSync } from 'fs';
import { join } from 'path';
// import { timeoutMiddlewareProvider } from './middlewares/timeoutMiddleware';

const logger = Debug('acp:index');

const middlewares: Array<ComposedMiddleware<IContext>> = [];
const { globalConfig, namespaces } = getCacheConfig();

// Initialise admin state so GET /__osham/admin/config has data immediately.
{
  const configFilePath = join(process.cwd(), 'cache-config.yml');
  let revision = 'unknown';
  try {
    revision = computeRevision(readFileSync(configFilePath, 'utf-8'));
  } catch {
    // config was already loaded successfully above; revision stays 'unknown'
  }
  const now = new Date().toISOString();
  setAdminState(
    { globalConfig, namespaces },
    { source: 'cache-config.yml', lastLoadedAt: now, lastAppliedAt: now, revision },
  );
}

// Startup summary — always visible so operators know exactly what loaded.
const enabledFeatures =
  (['xResponseTime', 'health', 'purge', 'metrics', 'changeOrigin'] as const).filter(f => globalConfig[f]).join(', ') ||
  'none';
// eslint-disable-next-line no-console
console.log(`[osham] Config v${globalConfig.version} loaded. Features: ${enabledFeatures}`);
for (const [ns, opts] of Object.entries(namespaces)) {
  const cacheInfo =
    opts.cache === false
      ? 'cache=disabled'
      : opts.cache
      ? `cache expires=${opts.cache.expires ?? 'default'}${opts.cache.pool ? ' pool=on' : ''}`
      : 'cache=unconfigured';
  // eslint-disable-next-line no-console
  console.log(`[osham] Namespace "${ns}": ${opts.expose} → ${opts.target} (${cacheInfo})`);
  if (opts.allow?.length) {
    // eslint-disable-next-line no-console
    console.log(`[osham]   allow: ${opts.allow.join(', ')}`);
  }
  if (opts.deny?.length) {
    // eslint-disable-next-line no-console
    console.log(`[osham]   deny:  ${opts.deny.join(', ')}`);
  }
}

if (process.env.TIMEOUT) {
  // middlewares.push(timeoutMiddlewareProvider(+process.env.TIMEOUT));
}

// Admin API is always mounted; auth is controlled via OSHAM_ADMIN_SECRET env var.
middlewares.push(AdminConfig);
if (globalConfig.xResponseTime) middlewares.push(RouteTimeReqRes);
if (globalConfig.health) middlewares.push(HealthCheck);
if (globalConfig.purge) middlewares.push(PurgeCache);
if (globalConfig.metrics) middlewares.push(MetricsEndpoint);

for (const [key, options] of Object.entries(namespaces)) {
  middlewares.push(createNameSpaceHandler(key, options));
}

Server.on('request', async (req: IncomingMessage, res: ServerResponse) => {
  const ctx = CtxProvider(req, res);
  const chain = compose(middlewares);
  res.statusCode = 404;

  const handleError = (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    logger(`Unhandled request error for ${req.method} ${req.url}: ${message}`);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.end('Internal Server Error');
      return;
    }
    res.end();
  };

  const handleResponse = () => ctx.respond();
  return chain(ctx).then(handleResponse).catch(handleError);
});
