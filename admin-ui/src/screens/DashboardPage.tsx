import React from 'react';
import { Page } from '../ui/Page';
import { Card } from '../ui/Card';
import { apiGet } from '../api';
import { HealthResponse, MetricsSummary, NamespaceMetricsSummary, StartupSummaryResponse } from '../types';

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTimestamp(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function DashboardPage() {
  const [health, setHealth] = React.useState<HealthResponse | null>(null);
  const [metrics, setMetrics] = React.useState<MetricsSummary | null>(null);
  const [startup, setStartup] = React.useState<StartupSummaryResponse | null>(null);
  const [namespaceMetrics, setNamespaceMetrics] = React.useState<NamespaceMetricsSummary[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(() => {
    setBusy(true);
    Promise.all([
      apiGet<HealthResponse>('/__osham/admin/health'),
      apiGet<MetricsSummary>('/__osham/admin/metrics/summary'),
      apiGet<StartupSummaryResponse>('/__osham/admin/startup-summary'),
      apiGet<NamespaceMetricsSummary[]>('/__osham/admin/metrics/namespaces'),
    ])
      .then(([healthData, metricsData, startupData, namespaceMetricsData]) => {
        setHealth(healthData);
        setMetrics(metricsData);
        setStartup(startupData);
        setNamespaceMetrics(namespaceMetricsData);
        setError(null);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load dashboard data'))
      .finally(() => setBusy(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const topNamespace = React.useMemo(() => {
    return [...namespaceMetrics].sort((left, right) => right.requests - left.requests)[0] || null;
  }, [namespaceMetrics]);

  const lowestHitRatioNamespace = React.useMemo(() => {
    const activeNamespaces = namespaceMetrics.filter(item => item.requests > 0);
    return [...activeNamespaces].sort((left, right) => left.hitRatio - right.hitRatio)[0] || null;
  }, [namespaceMetrics]);

  const enabledFeatures = Object.entries(startup?.features || {}).filter(([, enabled]) => enabled);

  return (
    <Page title="Dashboard" subtitle="High-level operational overview for Osham.">
      <div className="toolbar">
        <button className="button" onClick={load} disabled={busy}>
          {busy ? 'Refreshing…' : 'Refresh Dashboard'}
        </button>
      </div>

      {error ? <div className="code-block">{error}</div> : null}

      <div className="card-grid">
        <Card title="Service Health">
          <p>Status: {health?.status || 'loading...'}</p>
          <p>Cache: {health?.cache.backend || '—'}</p>
          <p>Backend state: {health?.cache.status || '—'}</p>
        </Card>
        <Card title="Config Revision">
          <p>Revision: {health?.config.revision || 'loading...'}</p>
          <p>Source: {health?.config.source || '—'}</p>
          <p>Applied: {formatTimestamp(health?.config.lastAppliedAt)}</p>
        </Card>
        <Card title="Traffic Snapshot">
          <p>Requests: {metrics?.requests ?? '—'}</p>
          <p>Hit ratio: {metrics ? formatPercent(metrics.hitRatio) : '—'}</p>
          <p>Cache size: {metrics ? formatBytes(metrics.cacheSizeBytes) : '—'}</p>
        </Card>
        <Card title="Namespaces">
          <p>Configured: {startup?.namespaceCount ?? '—'}</p>
          <p>Observed: {namespaceMetrics.length}</p>
          <p>Warnings: {startup?.warnings?.length ?? 0}</p>
        </Card>
      </div>

      <div className="card-grid">
        <Card title="Operational Focus">
          <p>
            Busiest namespace:{' '}
            {topNamespace ? `${topNamespace.namespace} (${topNamespace.requests} requests)` : 'No traffic yet'}
          </p>
          <p>
            Weakest cache hit ratio:{' '}
            {lowestHitRatioNamespace
              ? `${lowestHitRatioNamespace.namespace} (${formatPercent(lowestHitRatioNamespace.hitRatio)})`
              : 'No active namespaces yet'}
          </p>
        </Card>
        <Card title="Feature Flags">
          <div className="pill-list compact-pill-list">
            {enabledFeatures.length ? (
              enabledFeatures.map(([name]) => (
                <span key={name} className="status-pill enabled">
                  {name}
                </span>
              ))
            ) : (
              <span className="status-pill disabled">No optional features enabled</span>
            )}
          </div>
        </Card>
      </div>

      {startup?.warnings?.length ? (
        <Card title="Startup Warnings">
          <ul>
            {startup.warnings.map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
          </ul>
        </Card>
      ) : null}
    </Page>
  );
}
