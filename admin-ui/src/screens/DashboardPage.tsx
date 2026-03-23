import React from 'react';
import { Page } from '../ui/Page';
import { Card } from '../ui/Card';
import { apiGet } from '../api';
import { HealthResponse, MetricsSummary, StartupSummaryResponse } from '../types';

export function DashboardPage() {
  const [health, setHealth] = React.useState<HealthResponse | null>(null);
  const [metrics, setMetrics] = React.useState<MetricsSummary | null>(null);
  const [startup, setStartup] = React.useState<StartupSummaryResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    Promise.all([
      apiGet<HealthResponse>('/__osham/admin/health'),
      apiGet<MetricsSummary>('/__osham/admin/metrics/summary'),
      apiGet<StartupSummaryResponse>('/__osham/admin/startup-summary'),
    ])
      .then(([healthData, metricsData, startupData]) => {
        setHealth(healthData);
        setMetrics(metricsData);
        setStartup(startupData);
        setError(null);
      })
      .catch(err => setError(err.message));
  }, []);

  return (
    <Page title="Dashboard" subtitle="High-level operational overview for Osham.">
      {error ? <div className="code-block">{error}</div> : null}
      <div className="card-grid">
        <Card title="Service Health">
          <p>Status: {health?.status || 'loading...'}</p>
          <p>Cache: {health?.cache.backend || '-'}</p>
        </Card>
        <Card title="Revision">
          <p>Revision: {health?.config.revision || 'loading...'}</p>
          <p>Applied: {health?.config.lastAppliedAt || '-'}</p>
        </Card>
        <Card title="Metrics Summary">
          <p>Requests: {metrics?.requests ?? '-'}</p>
          <p>Hit ratio: {metrics ? `${(metrics.hitRatio * 100).toFixed(1)}%` : '-'}</p>
        </Card>
        <Card title="Namespaces">
          <p>Count: {startup?.namespaceCount ?? '-'}</p>
          <p>Metrics enabled: {String(startup?.features?.metrics ?? false)}</p>
        </Card>
      </div>
    </Page>
  );
}
