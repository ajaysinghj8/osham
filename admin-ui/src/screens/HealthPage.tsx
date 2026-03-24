import React from 'react';
import { Page } from '../ui/Page';
import { Card } from '../ui/Card';
import { apiGet } from '../api';
import { HealthResponse, StartupSummaryResponse } from '../types';

function formatTimestamp(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function HealthPage() {
  const [health, setHealth] = React.useState<HealthResponse | null>(null);
  const [startup, setStartup] = React.useState<StartupSummaryResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(() => {
    setBusy(true);
    Promise.all([
      apiGet<HealthResponse>('/__osham/admin/health'),
      apiGet<StartupSummaryResponse>('/__osham/admin/startup-summary'),
    ])
      .then(([healthData, startupData]) => {
        setHealth(healthData);
        setStartup(startupData);
        setError(null);
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load health data'))
      .finally(() => setBusy(false));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  return (
    <Page title="Health" subtitle="Operational health, startup features, and namespace visibility for the running server.">
      <div className="toolbar">
        <button className="button" onClick={load} disabled={busy}>
          {busy ? 'Refreshing…' : 'Refresh Health'}
        </button>
      </div>

      {error ? <div className="code-block">{error}</div> : null}

      <div className="card-grid">
        <Card title="Service Status">
          <p>Status: {health?.status || 'loading...'}</p>
          <p>Uptime: {health ? `${health.uptimeSeconds}s` : '—'}</p>
        </Card>
        <Card title="Cache Backend">
          <p>State: {health?.cache.status || '—'}</p>
          <p>Backend: {health?.cache.backend || '—'}</p>
        </Card>
        <Card title="Config State">
          <p>Loaded: {String(health?.config.loaded ?? false)}</p>
          <p>Revision: {health?.config.revision || '—'}</p>
          <p>Source: {health?.config.source || '—'}</p>
          <p>Applied: {formatTimestamp(health?.config.lastAppliedAt)}</p>
        </Card>
        <Card title="Startup Summary">
          <p>Version: {startup?.version || '—'}</p>
          <p>Namespaces: {startup?.namespaceCount ?? '—'}</p>
          <p>Warnings: {startup?.warnings.length ?? 0}</p>
        </Card>
      </div>

      <Card title="Enabled Features">
        <div className="pill-list">
          {Object.entries(startup?.features || {}).map(([name, enabled]) => (
            <span key={name} className={`status-pill ${enabled ? 'enabled' : 'disabled'}`}>
              {name}: {enabled ? 'on' : 'off'}
            </span>
          ))}
          {!startup ? <span className="status-pill disabled">loading…</span> : null}
        </div>
      </Card>

      <Card title="Configured Namespaces">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Expose</th>
              <th>Target</th>
              <th>Cache</th>
              <th>Allow</th>
              <th>Deny</th>
            </tr>
          </thead>
          <tbody>
            {(startup?.namespaces || []).map(ns => (
              <tr key={ns.name}>
                <td>{ns.name}</td>
                <td>{ns.expose}</td>
                <td>{ns.target}</td>
                <td>
                  {ns.cache.enabled ? 'enabled' : 'disabled'}
                  {ns.cache.expires ? ` · expires ${ns.cache.expires}` : ''}
                  {ns.cache.pool ? ' · pool on' : ''}
                </td>
                <td>{ns.allow.length ? ns.allow.join(', ') : '—'}</td>
                <td>{ns.deny.length ? ns.deny.join(', ') : '—'}</td>
              </tr>
            ))}
            {!startup?.namespaces?.length ? (
              <tr>
                <td colSpan={6}>No namespaces loaded.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      {startup?.warnings?.length ? (
        <Card title="Warnings">
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
