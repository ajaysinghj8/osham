import * as Koa from 'koa';
import { IContext, IFullConfig } from '../types';
import { getCacheConfig, validateConfigCollecting } from '../config.reader';
import { getAdminState, setAdminState, computeRevision, AdminMeta } from '../admin.state';
import { readFileSync, writeFileSync, renameSync } from 'fs';
import { join } from 'path';
import { dump } from 'js-yaml';

const ADMIN_BASE = '/__osham/admin';

/**
 * Checks the x-osham-admin-secret header against OSHAM_ADMIN_SECRET env var.
 * Returns true if authorized. On failure, sets a 401 response and returns false.
 *
 * Auth is bypassed only if OSHAM_ADMIN_ALLOW_INSECURE_LOCAL=true is set explicitly.
 * If OSHAM_ADMIN_SECRET is set, the correct header value is always required.
 */
function checkAdminAuth(ctx: IContext): boolean {
  const adminSecret = process.env.OSHAM_ADMIN_SECRET;

  if (!adminSecret) {
    const allowInsecure = process.env.OSHAM_ADMIN_ALLOW_INSECURE_LOCAL === 'true';
    if (!allowInsecure) {
      jsonResponse(ctx, 401, {
        ok: false,
        error: {
          code: 'UNAUTHORIZED',
          message:
            'Admin access requires OSHAM_ADMIN_SECRET to be set, or OSHAM_ADMIN_ALLOW_INSECURE_LOCAL=true for unsecured local access.',
        },
      });
      return false;
    }
    return true;
  }

  const provided = ctx.get('x-osham-admin-secret');
  if (provided !== adminSecret) {
    jsonResponse(ctx, 401, {
      ok: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'x-osham-admin-secret header is missing or invalid.',
      },
    });
    return false;
  }

  return true;
}

function jsonResponse(ctx: IContext, statusCode: number, body: unknown): void {
  ctx.statusCode = statusCode;
  ctx.set('content-type', 'application/json');
  ctx.body = JSON.stringify(body);
}

/**
 * Converts an admin-format config payload (with globalConfig + namespaces keys)
 * back to the flat raw object that validateConfig / js-yaml expects.
 */
function adminToRaw(adminConfig: {
  globalConfig?: Record<string, unknown>;
  namespaces?: Record<string, unknown>;
}): Record<string, unknown> {
  const raw: Record<string, unknown> = { ...(adminConfig.globalConfig || {}) };
  if (adminConfig.namespaces) {
    for (const [ns, opts] of Object.entries(adminConfig.namespaces)) {
      raw[ns] = opts;
    }
  }
  return raw;
}

/**
 * Converts an IFullConfig back to a YAML-serializable flat object, preserving
 * only fields that were set (falsy global flags are omitted to keep YAML minimal).
 */
function fullConfigToRaw(config: IFullConfig): Record<string, unknown> {
  const raw: Record<string, unknown> = { version: config.globalConfig.version };
  if (config.globalConfig.xResponseTime) raw.xResponseTime = true;
  if (config.globalConfig.health) raw.health = true;
  if (config.globalConfig.purge) raw.purge = true;
  if (config.globalConfig.metrics) raw.metrics = true;
  if (config.globalConfig.changeOrigin) raw.changeOrigin = true;
  for (const [ns, opts] of Object.entries(config.namespaces)) {
    raw[ns] = opts;
  }
  return raw;
}

/** Reads the full request body and parses it as JSON. */
async function readBody(ctx: IContext): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    ctx.req.on('data', (chunk: Buffer) => chunks.push(chunk));
    ctx.req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf-8');
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    ctx.req.on('error', reject);
  });
}

/**
 * Admin config middleware. Handles all /__osham/admin/* routes.
 *
 * Endpoints (Task Bundles 1 + 2):
 *   GET  /__osham/admin/config           – return current structured config
 *   POST /__osham/admin/config/validate  – validate proposed config, return errors/warnings
 *   PUT  /__osham/admin/config           – validate + atomically save config to cache-config.yml
 *   POST /__osham/admin/config/reload    – re-read cache-config.yml and update admin state
 *
 * Auth: requires x-osham-admin-secret header matching OSHAM_ADMIN_SECRET, or
 *       OSHAM_ADMIN_ALLOW_INSECURE_LOCAL=true (for dev/test without a secret).
 *
 * Save/apply semantics:
 *   PUT /config   persists the new config to disk (atomic write via temp file + rename).
 *   POST /reload  reads the saved file and updates the in-memory admin state.
 *   A process restart is required for routing changes to take effect at the proxy layer,
 *   because the middleware chain is composed once at startup.
 */
export async function AdminConfig(ctx: IContext, next: Koa.Next): Promise<void> {
  if (!ctx.path.startsWith(ADMIN_BASE)) {
    await next();
    return;
  }

  if (!checkAdminAuth(ctx)) return;

  const subPath = ctx.path.slice(ADMIN_BASE.length); // e.g. '' | '/config' | '/config/validate'

  // -------------------------------------------------------------------------
  // GET /__osham/admin/config
  // -------------------------------------------------------------------------
  if (ctx.method === 'GET' && subPath === '/config') {
    const state = getAdminState();
    if (!state) {
      jsonResponse(ctx, 500, { ok: false, error: { code: 'INTERNAL_ERROR', message: 'Config not loaded' } });
      return;
    }

    jsonResponse(ctx, 200, {
      ok: true,
      data: {
        globalConfig: {
          ...state.config.globalConfig,
          metricsPath: process.env.OSHAM_METRICS_PATH || '/__osham/metrics',
          secure: {
            enabled: process.env.SECURE === 'true',
            sslKeyConfigured: !!process.env.SSL_KEY,
            sslCertConfigured: !!process.env.SSL_CERT,
          },
        },
        namespaces: state.config.namespaces,
        meta: state.meta,
      },
    });
    return;
  }

  // -------------------------------------------------------------------------
  // POST /__osham/admin/config/validate
  // -------------------------------------------------------------------------
  if (ctx.method === 'POST' && subPath === '/config/validate') {
    let body: unknown;
    try {
      body = await readBody(ctx);
    } catch {
      jsonResponse(ctx, 400, { ok: false, error: { code: 'VALIDATION_FAILED', message: 'Invalid JSON body' } });
      return;
    }

    const b = body as { config?: { globalConfig?: Record<string, unknown>; namespaces?: Record<string, unknown> } };
    const rawConfig = b.config ? adminToRaw(b.config) : body;
    const result = validateConfigCollecting(rawConfig);

    jsonResponse(ctx, 200, { ok: true, data: result });
    return;
  }

  // -------------------------------------------------------------------------
  // PUT /__osham/admin/config
  // Validates then atomically saves the config to cache-config.yml.
  // -------------------------------------------------------------------------
  if (ctx.method === 'PUT' && subPath === '/config') {
    let body: unknown;
    try {
      body = await readBody(ctx);
    } catch {
      jsonResponse(ctx, 400, { ok: false, error: { code: 'SAVE_FAILED', message: 'Invalid JSON body' } });
      return;
    }

    const b = body as {
      config?: { globalConfig?: Record<string, unknown>; namespaces?: Record<string, unknown> };
      expectedRevision?: string;
    };

    // Optimistic concurrency: reject if caller provided a stale revision
    const state = getAdminState();
    if (b.expectedRevision !== undefined && state && b.expectedRevision !== state.meta.revision) {
      jsonResponse(ctx, 409, {
        ok: false,
        error: { code: 'REVISION_CONFLICT', message: 'expectedRevision does not match current revision' },
      });
      return;
    }

    const rawConfig = b.config ? adminToRaw(b.config) : body;
    const validation = validateConfigCollecting(rawConfig);
    if (!validation.valid) {
      jsonResponse(ctx, 400, {
        ok: false,
        error: { code: 'VALIDATION_FAILED', message: 'Config validation failed' },
        details: { errors: validation.errors, warnings: validation.warnings },
      });
      return;
    }

    try {
      const configPath = join(process.cwd(), 'cache-config.yml');
      const tempPath = configPath + '.tmp';
      const yamlContent = dump(rawConfig as Record<string, unknown>);
      writeFileSync(tempPath, yamlContent, 'utf-8');
      renameSync(tempPath, configPath);
      const revision = computeRevision(yamlContent);

      jsonResponse(ctx, 200, {
        ok: true,
        data: { saved: true, revision, warnings: validation.warnings },
      });
    } catch (err) {
      jsonResponse(ctx, 500, {
        ok: false,
        error: {
          code: 'SAVE_FAILED',
          message: err instanceof Error ? err.message : 'Failed to save config',
        },
      });
    }
    return;
  }

  // -------------------------------------------------------------------------
  // POST /__osham/admin/config/reload
  // Re-reads cache-config.yml and updates the in-memory admin state.
  // NOTE: routing changes require a process restart — the middleware chain is
  // composed once at startup and is not rebuilt here.
  // -------------------------------------------------------------------------
  if (ctx.method === 'POST' && subPath === '/config/reload') {
    try {
      const configPath = join(process.cwd(), 'cache-config.yml');
      const rawContent = readFileSync(configPath, 'utf-8');
      const revision = computeRevision(rawContent);
      const newConfig = getCacheConfig();

      const now = new Date().toISOString();
      const meta: AdminMeta = {
        source: 'cache-config.yml',
        lastLoadedAt: now,
        lastAppliedAt: now,
        revision,
      };
      setAdminState(newConfig, meta);

      jsonResponse(ctx, 200, {
        ok: true,
        data: {
          applied: true,
          revision,
          warnings: [],
          summary: {
            namespaceCount: Object.keys(newConfig.namespaces).length,
            features: {
              health: newConfig.globalConfig.health,
              metrics: newConfig.globalConfig.metrics,
              purge: newConfig.globalConfig.purge,
              xResponseTime: newConfig.globalConfig.xResponseTime,
            },
          },
          // Routing changes require a process restart; admin state has been updated.
          note: 'Config metadata reloaded. Restart the server to apply routing changes.',
        },
      });
    } catch (err) {
      jsonResponse(ctx, 500, {
        ok: false,
        error: {
          code: 'APPLY_FAILED',
          message: err instanceof Error ? err.message : 'Failed to reload config',
        },
      });
    }
    return;
  }

  // 404 for any other /__osham/admin/* path
  jsonResponse(ctx, 404, {
    ok: false,
    error: { code: 'NOT_FOUND', message: `Admin endpoint not found: ${ctx.method} ${ctx.path}` },
  });
}

// Re-export for convenience so callers can build the initial admin state
export { fullConfigToRaw };
