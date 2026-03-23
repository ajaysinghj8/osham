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

export interface AuditEvent {
  time: string;
  action: string;
  actor: string;
  result: string;
  details?: Record<string, unknown>;
}
