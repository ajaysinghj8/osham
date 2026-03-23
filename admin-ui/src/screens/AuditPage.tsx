import React from 'react';
import { Page } from '../ui/Page';
import { apiGet } from '../api';
import { AuditEvent } from '../types';

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function renderDetails(event: AuditEvent): string {
  if (!event.details) return '—';
  const d = event.details;
  if (event.action === 'admin.purge') {
    const parts: string[] = [];
    if (d['pattern'] != null) parts.push(`pattern: ${String(d['pattern'])}`);
    if (typeof d['deleted'] === 'number') parts.push(`deleted: ${d['deleted']}`);
    if (d['dryRun']) parts.push('dry-run');
    return parts.join(', ') || '—';
  }
  if (event.action === 'config.save' || event.action === 'config.reload') {
    if (d['revision'] != null) return `revision: ${String(d['revision'])}`;
  }
  const keys = Object.keys(d);
  if (keys.length === 0) return '—';
  return keys
    .slice(0, 2)
    .map(k => `${k}: ${String(d[k])}`)
    .join(', ');
}

export function AuditPage() {
  const [events, setEvents] = React.useState<AuditEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  function load() {
    setLoading(true);
    setError(null);
    apiGet<AuditEvent[]>('/__osham/admin/audit')
      .then(data => {
        setEvents(data);
        setLoading(false);
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Request failed');
        setLoading(false);
      });
  }

  React.useEffect(load, []);

  return (
    <Page title="Audit" subtitle="Recent admin actions (last 100).">
      <div className="toolbar">
        <button className="button" onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error ? <div className="code-block">{error}</div> : null}

      {!loading && !error && events.length === 0 ? (
        <p style={{ color: '#a8b4c7' }}>No audit events yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Action</th>
              <th>Result</th>
              <th>Actor</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {events.map((event, index) => (
              <tr key={`${event.time}-${index}`}>
                <td style={{ whiteSpace: 'nowrap' }}>{formatTime(event.time)}</td>
                <td>
                  <code>{event.action}</code>
                </td>
                <td>
                  <span
                    className={`status-pill${event.result === 'success' ? ' enabled' : ' disabled'}`}
                  >
                    {event.result}
                  </span>
                </td>
                <td>{event.actor}</td>
                <td style={{ color: '#a8b4c7', fontSize: '0.9em' }}>{renderDetails(event)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Page>
  );
}
