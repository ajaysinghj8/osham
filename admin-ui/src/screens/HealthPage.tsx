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

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function StatRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="stat-row">
      <span className="stat-label">{label}</span>
      <span className="stat-val">{value}</span>
    </div>
  );
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

  const healthOk = health ? (health.status === 'ok' || health.status === 'healthy') : null;
  const cacheOk = health ? (health.cache?.status === 'connected' || health.cache?.status === 'ok') : null;

  return (
    <Page subtitle="Operational health, startup features, and namespace visibility for the running server.">
      <div className="refresh-bar">
        <button className="button" onClick={load} disabled={busy}>
          {busy ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <div className="cfg-banner cfg-banner--error">{error}</div>}

      <div className="card-grid">
        <Card title="Service Status">
          <StatRow
            label="Status"
            value={
              healthOk === null ? '—' : (
                <span className={`service-status service-status--${healthOk ? 'ok' : 'warn'}`}>
                  {healthOk ? 'Online' : 'Degraded'}
                </span>
              )
            }
          />
          <StatRow label="Uptime" value={health ? formatUptime(health.uptimeSeconds) : '—'} />
        </Card>
        <Card title="Cache Backend">
          <StatRow
            label="State"
            value={
              cacheOk === null ? '—' : (
                <span className={`service-status service-status--${cacheOk ? 'ok' : 'err'}`}>
                  {health?.cache.status}
                </span>
              )
            }
          />
          <StatRow label="Backend" value={health?.cache.backend ?? '—'} />
        </Card>
        <Card title="Config State">
          <StatRow label="Loaded" value={String(health?.config.loaded ?? false)} />
          <StatRow label="Revision" value={health?.config.revision ?? '—'} />
          <StatRow label="Source" value={health?.config.source ?? '—'} />
          <StatRow label="Applied" value={formatTimestamp(health?.config.lastAppliedAt)} />
        </Card>
        <Card title="Startup Summary">
          <StatRow label="Version" value={startup?.version ?? '—'} />
          <StatRow label="Namespaces" value={startup?.namespaceCount ?? '—'} />
          <StatRow label="Warnings" value={startup?.warnings.length ?? 0} />
        </Card>
      </div>

      <Card title="Enabled Features">
        <div className="pill-list">
          {Object.entries(startup?.features || {}).map(([name, enabled]) => (
            <span key={name} className={`status-pill ${enabled ? 'enabled' : 'disabled'}`}>
              {name}: {enabled ? 'on' : 'off'}
            </span>
          ))}
          {!startup && <span className="status-pill disabled">loading…</span>}
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
