# Metrics (Prometheus APM)

Osham exposes Prometheus-compatible metrics to monitor cache performance and aid application observability.

## Enabling Metrics

To enable metrics, add `metrics: true` to your `cache-config.yml`:

```yaml
version: '1'
metrics: true
health: true
purge: true
# ... namespace config
```

## Metrics Endpoint

Once enabled, metrics are exposed at:

```
GET /__osham/metrics
```

Returns metrics in Prometheus text format (`text/plain`). You can scrape this endpoint from your Prometheus configuration:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'osham'
    static_configs:
      - targets: ['localhost:26192']
    metrics_path: '/__osham/metrics'
```

## Available Metrics

### Cache Hit Counter
- **Name:** `osham_cache_hits_total`
- **Type:** Counter
- **Labels:** `namespace`
- **Description:** Total number of successful cache hits

### Cache Miss Counter
- **Name:** `osham_cache_misses_total`
- **Type:** Counter
- **Labels:** `namespace`
- **Description:** Total number of cache misses

### Request Duration Histogram
- **Name:** `osham_request_duration_seconds`
- **Type:** Histogram
- **Labels:** `namespace`, `method`, `status`
- **Description:** Request latency in seconds with buckets: 0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5

### Pooled Requests Gauge
- **Name:** `osham_pooled_requests`
- **Type:** Gauge
- **Labels:** `namespace`
- **Description:** Current number of requests waiting for a pooled backend response

### Cache Size Gauge
- **Name:** `osham_cache_size_bytes`
- **Type:** Gauge
- **Labels:** `namespace`
- **Description:** Current cache size in bytes (updated periodically)

## Example Prometheus Queries

Calculate cache hit ratio:

```promql
osham_cache_hits_total / (osham_cache_hits_total + osham_cache_misses_total)
```

Percentile latency (p95):

```promql
histogram_quantile(0.95, osham_request_duration_seconds)
```

Rate of cache misses (per second):

```promql
rate(osham_cache_misses_total[5m])
```

## Customizing Metrics Path

By default, metrics are exposed at `/__osham/metrics`. To use a custom path, set the environment variable:

```bash
export OSHAM_METRICS_PATH=/prometheus
```

Then metrics will be available at `GET /prometheus`.

## Performance Impact

Metrics collection is lightweight and uses the industry-standard [prom-client](https://github.com/siimon/prom-client) library. The overhead is minimal:
- Counters and gauges are O(1) operations
- Histogram observations have negligible impact
- No background tasks or polling required
