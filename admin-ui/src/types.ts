export interface HealthResponse {
  status: string;
  uptimeSeconds: number;
  cache: {
    status: string;
    backend: string;
  };
  config: {
    loaded: boolean;
    revision: string | null;
    source?: string;
    lastAppliedAt?: string | null;
  };
}

export interface MetricsSummary {
  requests: number;
  cacheHits: number;
  cacheMisses: number;
  hitRatio: number;
  pooledRequests: number;
  cacheSizeBytes: number;
}

export interface NamespaceMetricsSummary {
  namespace: string;
  requests: number;
  cacheHits: number;
  cacheMisses: number;
  hitRatio: number;
  pooledRequests: number;
  cacheSizeBytes: number;
  latency: {
    p50: number;
    p95: number;
  };
}

export interface StartupSummaryResponse {
  version: string;
  namespaceCount: number;
  namespaces: Array<{
    name: string;
    expose: string;
    target: string;
    cache: {
      enabled: boolean;
      expires?: string | null;
      pool?: boolean;
    };
    allow: string[];
    deny: string[];
  }>;
  features: Record<string, boolean>;
  warnings: string[];
}

export interface AuditEvent {
  time: string;
  action: string;
  actor: string;
  result: string;
  details?: Record<string, unknown>;
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

export interface CacheConfigView {
  enabled: boolean;
  expires: string;
  pool: boolean;
  query: string[];
  headers: string[];
}

export interface RuleView {
  pattern?: string;
  cache: CacheConfigView;
}

export interface NamespaceView {
  expose: string;
  target: string;
  port: string;
  timeout: string;
  followRedirects: boolean;
  changeOrigin: boolean;
  allow: string[];
  deny: string[];
  cache: CacheConfigView;
  rules: RuleView[];
}

export interface AdminConfigView {
  globalConfig: {
    version: string;
    xResponseTime: boolean;
    health: boolean;
    purge: boolean;
    metrics: boolean;
    changeOrigin: boolean;
    metricsPath?: string;
    secure?: {
      enabled: boolean;
      sslKeyConfigured: boolean;
      sslCertConfigured: boolean;
    };
  };
  namespaces: Record<string, NamespaceView>;
  meta: {
    source: string;
    lastLoadedAt: string;
    lastAppliedAt: string | null;
    revision: string;
  };
}
