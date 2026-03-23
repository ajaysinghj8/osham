import React from 'react';
import { apiGet } from '../api';
import { MetricsSummary, NamespaceMetricsSummary } from '../types';
import { Page } from '../ui/Page';
import { Card } from '../ui/Card';

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

export function MetricsPage() {
  const [summary, setSummary] = React.useState<MetricsSummary | null>(null);
  const [rows, setRows] = React.useState<NamespaceMetricsSummary[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    Promise.all([
      apiGet<MetricsSummary>('/__osham/admin/metrics/summary'),
      apiGet<NamespaceMetricsSummary[]>('/__osham/admin/metrics/namespaces'),
    ])
      .then(([summaryData, namespaceData]) => {
        setSummary(summaryData);
        setRows(namespaceData);
        setError(null);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load metrics'));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <Page title="Metrics" subtitle="Aggregate and per-namespace cache performance for the running Osham instance.">
      <div className="toolbar">
        <button className="button" onClick={load}>
          Refresh Metrics
        </button>
      </div>

      {error ? <div className="code-block">{error}</div> : null}

      <div className="card-grid">
        <Card title="Total Requests">
          <p>{summary?.requests ?? '—'}</p>
        </Card>
        <Card title="Cache Hit Ratio">
          <p>{summary ? formatPercent(summary.hitRatio) : '—'}</p>
          <p>Hits: {summary?.cacheHits ?? '—'}</p>
          <p>Misses: {summary?.cacheMisses ?? '—'}</p>
        </Card>
        <Card title="Pooled Requests">
          <p>{summary?.pooledRequests ?? '—'}</p>
        </Card>
        <Card title="Estimated Cache Size">
          <p>{summary ? formatBytes(summary.cacheSizeBytes) : '—'}</p>
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
          {rows.map(row => (
            <tr key={row.namespace}>
              <td>{row.namespace}</td>
              <td>{row.requests}</td>
              <td>{formatPercent(row.hitRatio)}</td>
              <td>
                {row.cacheHits} / {row.cacheMisses}
              </td>
              <td>{row.pooledRequests}</td>
              <td>{formatBytes(row.cacheSizeBytes)}</td>
              <td>{formatSeconds(row.latency.p50)}</td>
              <td>{formatSeconds(row.latency.p95)}</td>
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td colSpan={8}>No namespace metrics yet. Generate some traffic and refresh.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </Page>
  );
}
