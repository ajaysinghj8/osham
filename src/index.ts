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
import { createNameSpaceHandler } from './middlewares/nameSpaceHandler';
import { CtxProvider } from './ctx.provider';
import * as compose from 'koa-compose';
import { IContext } from './types';
import { ComposedMiddleware } from 'koa-compose';
// import { timeoutMiddlewareProvider } from './middlewares/timeoutMiddleware';

const logger = Debug('acp:index');

const middlewares: Array<ComposedMiddleware<IContext>> = [];
const { globalConfig, namespaces } = getCacheConfig();

if (process.env.TIMEOUT) {
  // middlewares.push(timeoutMiddlewareProvider(+process.env.TIMEOUT));
}

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
