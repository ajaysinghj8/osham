import { load } from 'js-yaml';
import { readFileSync } from 'fs';
import { join } from 'path';
import { IFullConfig, INameSpaceOptions, ICacheOptions, IRulesOptions } from './types';

function supplant(o = {}) {
  return this.replace(/\${([^{}]*)}/g, (a: string, b: string) => {
    const r: unknown = Reflect.get(o, b);
    if (r === undefined) {
      throw new Error(`Please set environment value of ${b}`);
    }
    return typeof r === 'string' || typeof r === 'number' ? r : a;
  });
}

const RESERVED_KEYS = new Set(['version', 'xResponseTime', 'health', 'purge', 'metrics', 'changeOrigin']);

const KNOWN_TOP_LEVEL_KEYS = new Set(['version', 'xResponseTime', 'health', 'purge', 'metrics', 'changeOrigin']);

const KNOWN_NAMESPACE_KEYS = new Set([
  'expose',
  'target',
  'port',
  'timeout',
  'followRedirects',
  'changeOrigin',
  'cache',
  'rules',
  'allow',
  'deny',
]);

function validateCacheOptions(value: unknown, context: string): ICacheOptions {
  if (value === false || value === undefined || value === null) {
    return value === false ? false : undefined;
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`cache-config.yml: ${context}: "cache" must be an object, false, or omitted`);
  }
  const c = value as Record<string, unknown>;
  if ('expires' in c && c.expires !== undefined && typeof c.expires !== 'string' && typeof c.expires !== 'number') {
    throw new Error(`cache-config.yml: ${context}: "cache.expires" must be a string or number (e.g. "10s", 60)`);
  }
  if ('pool' in c && c.pool !== undefined && typeof c.pool !== 'boolean') {
    throw new Error(`cache-config.yml: ${context}: "cache.pool" must be a boolean`);
  }
  if ('query' in c && c.query !== undefined && c.query !== false) {
    if (!Array.isArray(c.query) || !(c.query as unknown[]).every(q => typeof q === 'string')) {
      throw new Error(`cache-config.yml: ${context}: "cache.query" must be false or an array of strings`);
    }
  }
  if ('headers' in c && c.headers !== undefined && c.headers !== false) {
    if (!Array.isArray(c.headers) || !(c.headers as unknown[]).every(h => typeof h === 'string')) {
      throw new Error(`cache-config.yml: ${context}: "cache.headers" must be false or an array of strings`);
    }
  }
  return value as ICacheOptions;
}

function validateRules(value: unknown, ns: string): IRulesOptions {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`cache-config.yml: namespace "${ns}": "rules" must be an object`);
  }
  const rules = value as Record<string, unknown>;
  for (const rulePath of Object.keys(rules)) {
    const rule = rules[rulePath];
    if (typeof rule !== 'object' || Array.isArray(rule) || rule === null) {
      throw new Error(`cache-config.yml: namespace "${ns}": rule "${rulePath}" must be an object with a "cache" field`);
    }
    validateCacheOptions((rule as Record<string, unknown>).cache, `namespace "${ns}", rule "${rulePath}"`);
  }
  return value as IRulesOptions;
}

export function validateConfig(config: unknown): IFullConfig {
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    throw new Error('cache-config.yml: config must be a YAML mapping object');
  }
  const cfg = config as Record<string, unknown>;

  if (!cfg.version) {
    throw new Error('cache-config.yml: missing required field "version" (e.g. version: \'1\')');
  }

  const BOOL_GLOBAL_FLAGS = ['xResponseTime', 'health', 'purge', 'metrics', 'changeOrigin'] as const;
  for (const field of BOOL_GLOBAL_FLAGS) {
    if (field in cfg && cfg[field] !== undefined && typeof cfg[field] !== 'boolean') {
      throw new Error(`cache-config.yml: "${field}" must be a boolean (true or false)`);
    }
  }

  // Warn about unknown top-level scalar keys — these are almost always typos of reserved flags
  // (e.g. `purges: true` instead of `purge: true`). Object-valued keys are namespace candidates
  // and will be validated below.
  for (const key of Object.keys(cfg)) {
    if (
      !KNOWN_TOP_LEVEL_KEYS.has(key) &&
      (typeof cfg[key] !== 'object' || cfg[key] === null || Array.isArray(cfg[key]))
    ) {
      // eslint-disable-next-line no-console
      console.warn(
        `cache-config.yml: unknown top-level key "${key}" with a non-object value will be ignored` +
          ` — known top-level keys: ${[...KNOWN_TOP_LEVEL_KEYS].join(', ')}` +
          ` (if this is a namespace, its value must be an object with "expose" and "target" fields)`,
      );
    }
  }

  // Only object-valued non-reserved keys are treated as namespace candidates.
  // Scalar non-reserved keys have already been warned about above and are skipped here.
  const namespaceKeys = Object.keys(cfg).filter(
    k => !RESERVED_KEYS.has(k) && typeof cfg[k] === 'object' && cfg[k] !== null && !Array.isArray(cfg[k]),
  );
  if (namespaceKeys.length === 0) {
    throw new Error('cache-config.yml: at least one proxy namespace must be defined with "expose" and "target" fields');
  }

  const namespaces: Record<string, INameSpaceOptions> = {};

  for (const ns of namespaceKeys) {
    const nsConfig = cfg[ns];
    if (typeof nsConfig !== 'object' || nsConfig === null || Array.isArray(nsConfig)) {
      throw new Error(`cache-config.yml: namespace "${ns}" must be an object`);
    }
    const nsCfg = nsConfig as Record<string, unknown>;

    if (typeof nsCfg.expose !== 'string' || !nsCfg.expose) {
      throw new Error(
        `cache-config.yml: namespace "${ns}" is missing required string field "expose" (e.g. expose: '/api/v1/*')`,
      );
    }
    if (typeof nsCfg.target !== 'string' || !nsCfg.target) {
      throw new Error(
        `cache-config.yml: namespace "${ns}" is missing required string field "target" (e.g. target: 'http://localhost:3000')`,
      );
    }
    if ('port' in nsCfg && nsCfg.port !== undefined && typeof nsCfg.port !== 'number') {
      throw new Error(`cache-config.yml: namespace "${ns}": "port" must be a number`);
    }
    if ('timeout' in nsCfg && nsCfg.timeout !== undefined && typeof nsCfg.timeout !== 'number') {
      throw new Error(`cache-config.yml: namespace "${ns}": "timeout" must be a number`);
    }
    if (
      'followRedirects' in nsCfg &&
      nsCfg.followRedirects !== undefined &&
      typeof nsCfg.followRedirects !== 'boolean'
    ) {
      throw new Error(`cache-config.yml: namespace "${ns}": "followRedirects" must be a boolean`);
    }
    if ('changeOrigin' in nsCfg && nsCfg.changeOrigin !== undefined && typeof nsCfg.changeOrigin !== 'boolean') {
      throw new Error(`cache-config.yml: namespace "${ns}": "changeOrigin" must be a boolean`);
    }

    for (const listField of ['allow', 'deny'] as const) {
      if (listField in nsCfg && nsCfg[listField] !== undefined) {
        if (!Array.isArray(nsCfg[listField]) || !(nsCfg[listField] as unknown[]).every(p => typeof p === 'string')) {
          throw new Error(
            `cache-config.yml: namespace "${ns}": "${listField}" must be an array of glob pattern strings`,
          );
        }
      }
    }

    for (const key of Object.keys(nsCfg)) {
      if (!KNOWN_NAMESPACE_KEYS.has(key)) {
        // eslint-disable-next-line no-console
        console.warn(
          `cache-config.yml: namespace "${ns}": unknown key "${key}" will be ignored` +
            ` — known keys: ${[...KNOWN_NAMESPACE_KEYS].join(', ')}`,
        );
      }
    }

    const cache = validateCacheOptions(nsCfg.cache, `namespace "${ns}"`);
    const rules = validateRules(nsCfg.rules, ns);

    const nsOptions: INameSpaceOptions = {
      expose: nsCfg.expose,
      target: nsCfg.target,
      cache,
      rules,
    };
    if (nsCfg.port !== undefined) nsOptions.port = nsCfg.port as number;
    if (nsCfg.timeout !== undefined) nsOptions.timeout = nsCfg.timeout as number;
    if (nsCfg.followRedirects !== undefined) nsOptions.followRedirects = nsCfg.followRedirects as boolean;
    if (nsCfg.changeOrigin !== undefined) nsOptions.changeOrigin = nsCfg.changeOrigin as boolean;
    if (nsCfg.allow !== undefined) nsOptions.allow = nsCfg.allow as string[];
    if (nsCfg.deny !== undefined) nsOptions.deny = nsCfg.deny as string[];

    namespaces[ns] = nsOptions;
  }

  return {
    globalConfig: {
      version: String(cfg.version),
      xResponseTime: cfg.xResponseTime === true,
      health: cfg.health === true,
      purge: cfg.purge === true,
      metrics: cfg.metrics === true,
      changeOrigin: cfg.changeOrigin === true,
    },
    namespaces,
  };
}

export interface ValidationIssue {
  field: string;
  message: string;
  severity: 'error' | 'warning';
  code: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

/**
 * Validates a config object and returns structured errors/warnings instead of throwing.
 * Captures console.warn calls from validateConfig to collect unknown-key warnings.
 */
export function validateConfigCollecting(config: unknown): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // Temporarily intercept console.warn to capture unknown-key warnings from validateConfig
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const origWarn = (console as any).warn;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (console as any).warn = (...args: unknown[]) => {
    warnings.push({
      field: 'config',
      message: String(args[0] || ''),
      severity: 'warning',
      code: 'UNKNOWN_KEY',
    });
  };

  try {
    validateConfig(config);
    return { valid: true, errors, warnings };
  } catch (err) {
    errors.push({
      field: 'config',
      message: err instanceof Error ? err.message : String(err),
      severity: 'error',
      code: 'VALIDATION_FAILED',
    });
    return { valid: false, errors, warnings };
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (console as any).warn = origWarn;
  }
}

export function getCacheConfig(): IFullConfig {
  const configFilePath = join(process.cwd(), 'cache-config.yml');
  let raw: string;
  try {
    raw = readFileSync(configFilePath, 'utf-8');
  } catch {
    throw new Error(`cache-config.yml not found at "${configFilePath}". Create it to configure Osham.`);
  }
  const config = load(supplant.call(raw, process.env));
  return validateConfig(config);
}
