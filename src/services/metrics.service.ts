import * as prometheus from 'prom-client';

interface NamespaceSummary {
  namespace: string;
  requests: number;
  cacheHits: number;
  cacheMisses: number;
  hitRatio: number;
  cacheSizeBytes: number;
  pooledRequests: number;
  latency: {
    p50: number;
    p95: number;
  };
}

interface MetricsSummary {
  requests: number;
  cacheHits: number;
  cacheMisses: number;
  hitRatio: number;
  pooledRequests: number;
  cacheSizeBytes: number;
}

export class Metrics {
  private static requestCounts = new Map<string, number>();
  private static hitCounts = new Map<string, number>();
  private static missCounts = new Map<string, number>();
  private static pooledCounts = new Map<string, number>();
  private static cacheSizes = new Map<string, number>();
  private static durations = new Map<string, number[]>();

  // Cache hit counter (by namespace)
  static cacheHits = new prometheus.Counter({
    name: 'osham_cache_hits_total',
    help: 'Total number of cache hits',
    labelNames: ['namespace'],
  });

  // Cache miss counter (by namespace)
  static cacheMisses = new prometheus.Counter({
    name: 'osham_cache_misses_total',
    help: 'Total number of cache misses',
    labelNames: ['namespace'],
  });

  // Request duration histogram (by namespace and status)
  static requestDuration = new prometheus.Histogram({
    name: 'osham_request_duration_seconds',
    help: 'Request duration in seconds',
    labelNames: ['namespace', 'method', 'status'],
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  });

  // Pooled requests gauge (by namespace)
  static pooledRequests = new prometheus.Gauge({
    name: 'osham_pooled_requests',
    help: 'Number of currently pooled requests',
    labelNames: ['namespace'],
  });

  // Cache size gauge (by namespace) in bytes
  static cacheSizeBytes = new prometheus.Gauge({
    name: 'osham_cache_size_bytes',
    help: 'Current cache size in bytes',
    labelNames: ['namespace'],
  });

  // Get all metrics in Prometheus text format
  static async getMetrics(): Promise<string> {
    return prometheus.register.metrics();
  }

  static recordRequest(namespace: string): void {
    this.requestCounts.set(namespace, (this.requestCounts.get(namespace) || 0) + 1);
  }

  // Record cache hit
  static recordCacheHit(namespace: string): void {
    this.hitCounts.set(namespace, (this.hitCounts.get(namespace) || 0) + 1);
    this.cacheHits.labels(namespace).inc();
  }

  // Record cache miss
  static recordCacheMiss(namespace: string): void {
    this.missCounts.set(namespace, (this.missCounts.get(namespace) || 0) + 1);
    this.cacheMisses.labels(namespace).inc();
  }

  // Record request duration
  static recordRequestDuration(namespace: string, method: string, status: number, durationSeconds: number): void {
    const samples = this.durations.get(namespace) || [];
    samples.push(durationSeconds);
    this.durations.set(namespace, samples.slice(-500));
    this.requestDuration.labels(namespace, method, String(status)).observe(durationSeconds);
  }

  // Set pooled requests count
  static setPooledRequests(namespace: string, count: number): void {
    this.pooledCounts.set(namespace, count);
    this.pooledRequests.labels(namespace).set(count);
  }

  // Set cache size
  static setCacheSize(namespace: string, sizeBytes: number): void {
    this.cacheSizes.set(namespace, sizeBytes);
    this.cacheSizeBytes.labels(namespace).set(sizeBytes);
  }

  static getSummary(namespaces: string[]): MetricsSummary {
    const rows = this.getNamespaceSummaries(namespaces);
    const cacheHits = rows.reduce((sum, row) => sum + row.cacheHits, 0);
    const cacheMisses = rows.reduce((sum, row) => sum + row.cacheMisses, 0);
    const requests = rows.reduce((sum, row) => sum + row.requests, 0);
    const pooledRequests = rows.reduce((sum, row) => sum + row.pooledRequests, 0);
    const cacheSizeBytes = rows.reduce((sum, row) => sum + row.cacheSizeBytes, 0);

    return {
      requests,
      cacheHits,
      cacheMisses,
      hitRatio: requests > 0 ? cacheHits / requests : 0,
      pooledRequests,
      cacheSizeBytes,
    };
  }

  static getNamespaceSummaries(namespaces: string[]): NamespaceSummary[] {
    return namespaces.sort().map(namespace => {
      const requests = this.requestCounts.get(namespace) || 0;
      const cacheHits = this.hitCounts.get(namespace) || 0;
      const cacheMisses = this.missCounts.get(namespace) || 0;
      return {
        namespace,
        requests,
        cacheHits,
        cacheMisses,
        hitRatio: requests > 0 ? cacheHits / requests : 0,
        cacheSizeBytes: this.cacheSizes.get(namespace) || 0,
        pooledRequests: this.pooledCounts.get(namespace) || 0,
        latency: this.getLatencySummary(namespace),
      };
    });
  }

  private static getLatencySummary(namespace: string): { p50: number; p95: number } {
    const values = [...(this.durations.get(namespace) || [])].sort((a, b) => a - b);
    if (!values.length) {
      return { p50: 0, p95: 0 };
    }

    return {
      p50: this.percentile(values, 0.5),
      p95: this.percentile(values, 0.95),
    };
  }

  private static percentile(values: number[], ratio: number): number {
    const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * ratio) - 1));
    return values[index];
  }
}
