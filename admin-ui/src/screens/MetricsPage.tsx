import React from 'react';
import { apiGet } from '../api';
import { MetricsSummary, NamespaceMetricsSummary } from '../types';
import { Page } from '../ui/Page';
import { Card } from '../ui/Card';

const AUTO_REFRESH_SECONDS = 30;

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function formatSeconds(value: number): string {
  if (value < 1) return `${Math.round(value * 1000)} ms`;
  return `${value.toFixed(2)} s`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString();
}

function hitRatioColor(ratio: number): 'green' | 'yellow' | 'red' {
  if (ratio >= 0.8) return 'green';
  if (ratio >= 0.5) return 'yellow';
  return 'red';
}

function HitRatioBadge({ ratio }: { ratio: number }) {
  const color = hitRatioColor(ratio);
  return (
    <span className={`hit-ratio-badge hit-ratio-badge--${color}`}>{formatPercent(ratio)}</span>
  );
}

function HitRatioBar({ ratio }: { ratio: number }) {
  const color = hitRatioColor(ratio);
  return (
    <div className="hit-ratio-bar">
      <div
        className={`hit-ratio-bar__fill hit-ratio-bar__fill--${color}`}
        style={{ width: `${Math.round(ratio * 100)}%` }}
      />
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="stat-row">
      <span className="stat-label">{label}</span>
      <span className="stat-val">{value}</span>
    </div>
  );
}

export function MetricsPage() {
  const [summary, setSummary] = React.useState<MetricsSummary | null>(null);
  const [rows, setRows] = React.useState<NamespaceMetricsSummary[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [metricsDisabled, setMetricsDisabled] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [lastRefreshed, setLastRefreshed] = React.useState<Date | null>(null);
  const [countdown, setCountdown] = React.useState(AUTO_REFRESH_SECONDS);

  const load = React.useCallback(() => {
    setBusy(true);
    Promise.all([
      apiGet<MetricsSummary>('/__osham/admin/metrics/summary'),
      apiGet<NamespaceMetricsSummary[]>('/__osham/admin/metrics/namespaces'),
    ])
      .then(([summaryData, namespaceData]) => {
        setSummary(summaryData);
        setRows(namespaceData);
        setError(null);
        setMetricsDisabled(false);
        setLastRefreshed(new Date());
        setCountdown(AUTO_REFRESH_SECONDS);
      })
      .catch(err => {
        const message = err instanceof Error ? err.message : 'Failed to load metrics';
        setError(message);
        setMetricsDisabled(/disabled|not enabled|metrics.*off/i.test(message));
      })
      .finally(() => setBusy(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh interval
  React.useEffect(() => {
    const interval = setInterval(load, AUTO_REFRESH_SECONDS * 1000);
    return () => clearInterval(interval);
  }, [load]);

  // Countdown ticker
  React.useEffect(() => {
    const ticker = setInterval(() => {
      setCountdown(prev => (prev <= 1 ? AUTO_REFRESH_SECONDS : prev - 1));
    }, 1000);
    return () => clearInterval(ticker);
  }, []);

  const sortedRows = React.useMemo(
    () => [...rows].sort((a, b) => b.requests - a.requests),
    [rows],
  );

  const activeRows = sortedRows.filter(row => row.requests > 0);
  const hottestNamespace = activeRows[0] || null;
  const coldestCacheNamespace =
    [...activeRows].sort((left, right) => left.hitRatio - right.hitRatio)[0] || null;
  const largestCacheNamespace =
    [...rows].sort((left, right) => right.cacheSizeBytes - left.cacheSizeBytes)[0] || null;

  return (
    <Page subtitle="Aggregate and per-namespace cache performance for the running Osham instance.">
      <div className="refresh-bar">
        <button className="button" onClick={load} disabled={busy}>
          {busy ? 'Refreshing…' : 'Refresh'}
        </button>
        {lastRefreshed && (
          <span className="refresh-bar__meta">
            Last refreshed {formatTime(lastRefreshed)} — next in {countdown}s
          </span>
        )}
      </div>

      {metricsDisabled ? (
        <div className="empty-state">
          <p className="empty-state__title">Metrics are not enabled</p>
          <p className="empty-state__body">
            Add <code>metrics: true</code> to your <code>cache-config.yml</code> and reload the
            config to enable Prometheus metrics collection.
          </p>
        </div>
      ) : error ? (
        <div className="cfg-banner cfg-banner--error">{error}</div>
      ) : null}

      <div className="card-grid">
        <Card title="Total Requests">
          <div className="big-stat">{summary?.requests ?? '—'}</div>
        </Card>
        <Card title="Cache Hit Ratio">
          {summary ? (
            <div className="summary-card">
              <div className="big-stat">{formatPercent(summary.hitRatio)}</div>
              <HitRatioBar ratio={summary.hitRatio} />
              <StatRow label="Hits" value={summary.cacheHits} />
              <StatRow label="Misses" value={summary.cacheMisses} />
            </div>
          ) : (
            <div className="big-stat">—</div>
          )}
        </Card>
        <Card title="Pooled Requests">
          <div className="big-stat">{summary?.pooledRequests ?? '—'}</div>
        </Card>
        <Card title="Estimated Cache Size">
          <div className="big-stat">{summary ? formatBytes(summary.cacheSizeBytes) : '—'}</div>
        </Card>
      </div>

      <div className="card-grid">
        <Card title="Hottest Namespace">
          <div className="summary-card">
            <span className="section-title">{hottestNamespace?.namespace ?? 'No traffic yet'}</span>
            <StatRow label="Requests" value={hottestNamespace?.requests ?? '—'} />
            <StatRow label="Latency p95" value={hottestNamespace ? formatSeconds(hottestNamespace.latency.p95) : '—'} />
          </div>
        </Card>
        <Card title="Weakest Cache Performance">
          <div className="summary-card">
            <span className="section-title">{coldestCacheNamespace?.namespace ?? 'No traffic yet'}</span>
            <StatRow label="Hit ratio" value={coldestCacheNamespace ? <HitRatioBadge ratio={coldestCacheNamespace.hitRatio} /> : '—'} />
            <StatRow
              label="Hits / Misses"
              value={coldestCacheNamespace ? `${coldestCacheNamespace.cacheHits} / ${coldestCacheNamespace.cacheMisses}` : '—'}
            />
          </div>
        </Card>
        <Card title="Largest Namespace Cache">
          <div className="summary-card">
            <span className="section-title">{largestCacheNamespace?.namespace ?? 'No cached responses yet'}</span>
            <StatRow label="Cache size" value={largestCacheNamespace ? formatBytes(largestCacheNamespace.cacheSizeBytes) : '—'} />
            <StatRow label="Pooled requests" value={largestCacheNamespace?.pooledRequests ?? '—'} />
          </div>
        </Card>
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>Namespace</th>
            <th>Requests</th>
            <th>Hit Ratio</th>
            <th>Hits / Misses</th>
            <th>Pooled</th>
            <th>Cache Size</th>
            <th>Latency p50</th>
            <th>Latency p95</th>
          </tr>
        </thead>
        <tbody>
          {sortedRows.map(row => (
            <tr key={row.namespace}>
              <td>{row.namespace}</td>
              <td>{row.requests}</td>
              <td>
                <HitRatioBadge ratio={row.hitRatio} />
                <HitRatioBar ratio={row.hitRatio} />
              </td>
              <td>
                {row.cacheHits} / {row.cacheMisses}
              </td>
              <td>{row.pooledRequests}</td>
              <td>{formatBytes(row.cacheSizeBytes)}</td>
              <td>{formatSeconds(row.latency.p50)}</td>
              <td>{formatSeconds(row.latency.p95)}</td>
            </tr>
          ))}
          {!sortedRows.length ? (
            <tr>
              <td colSpan={8}>
                <p className="table-empty-state__title">No namespace metrics yet</p>
                <p className="table-empty-state__body">
                  Send requests through the proxy to start seeing per-namespace data here.
                </p>
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </Page>
  );
}
