import * as Koa from 'koa';
import { IContext } from '../types';
import { Metrics } from '../services/metrics.service';

const DEFAULT_METRICS_PATH = '/__osham/metrics';

export async function MetricsEndpoint(ctx: IContext, next: Koa.Next): Promise<void> {
  const metricsPath = process.env.OSHAM_METRICS_PATH || DEFAULT_METRICS_PATH;
  if (ctx.path !== metricsPath) {
    await next();
    return;
  }

  if (ctx.method !== 'GET') {
    ctx.statusCode = 405;
    ctx.body = 'Method Not Allowed';
    return;
  }

  try {
    const metrics = await Metrics.getMetrics();
    ctx.statusCode = 200;
    ctx.set('content-type', 'text/plain; version=0.0.4');
    ctx.body = metrics;
  } catch (e) {
    ctx.statusCode = 500;
    ctx.set('content-type', 'application/json');
    ctx.body = JSON.stringify({ error: e?.message || 'metrics_failed' });
  }
}
