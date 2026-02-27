import * as prometheus from 'prom-client';

export class Metrics {
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

  // Record cache hit
  static recordCacheHit(namespace: string): void {
    this.cacheHits.labels(namespace).inc();
  }

  // Record cache miss
  static recordCacheMiss(namespace: string): void {
    this.cacheMisses.labels(namespace).inc();
  }

  // Record request duration
  static recordRequestDuration(namespace: string, method: string, status: number, durationSeconds: number): void {
    this.requestDuration.labels(namespace, method, String(status)).observe(durationSeconds);
  }

  // Set pooled requests count
  static setPooledRequests(namespace: string, count: number): void {
    this.pooledRequests.labels(namespace).set(count);
  }

  // Set cache size
  static setCacheSize(namespace: string, sizeBytes: number): void {
    this.cacheSizeBytes.labels(namespace).set(sizeBytes);
  }
}
