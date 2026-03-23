import React from 'react';
import { Page } from '../ui/Page';
import { apiPost } from '../api';

interface PurgeResponse {
  purged: boolean;
  dryRun: boolean;
  deleted: number;
  warnings: string[];
}

function isBroadPattern(p: string): boolean {
  const t = p.trim();
  return t === '*' || t === '**';
}

export function PurgePage() {
  const [pattern, setPattern] = React.useState('**');
  const [dryRun, setDryRun] = React.useState(true);
  const [confirmed, setConfirmed] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<PurgeResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const broad = isBroadPattern(pattern);
  const needsConfirm = !dryRun;
  const canSubmit = !loading && (!needsConfirm || confirmed);

  function handlePatternChange(e: React.ChangeEvent<HTMLInputElement>) {
    setPattern(e.target.value);
    setConfirmed(false);
    setResult(null);
    setError(null);
  }

  function handleDryRunChange(e: React.ChangeEvent<HTMLInputElement>) {
    setDryRun(e.target.checked);
    setConfirmed(false);
  }

  async function submit() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const data = await apiPost<PurgeResponse>('/__osham/admin/purge', { pattern, dryRun });
      setResult(data);
      setConfirmed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Page title="Purge" subtitle="Invalidate cached entries by key pattern.">
      <div className="toolbar">
        <input
          className="input"
          value={pattern}
          onChange={handlePatternChange}
          placeholder="e.g. api/** or **"
        />
        <label className="checkbox-row">
          <input type="checkbox" checked={dryRun} onChange={handleDryRunChange} />
          Dry run
        </label>
        <button className="button" onClick={submit} disabled={!canSubmit}>
          {loading ? 'Running…' : dryRun ? 'Preview' : 'Purge'}
        </button>
      </div>

      {broad && (
        <div className="purge-warning">
          <strong>Broad pattern:</strong> <code>{pattern}</code> will match all cached keys.
        </div>
      )}

      {needsConfirm && (
        <div className={`purge-warning${broad ? ' purge-warning--danger' : ''}`}>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
            />
            I understand this will permanently delete {broad ? 'all' : 'matching'} cache
            entries. Proceed with live purge.
          </label>
        </div>
      )}

      {error ? <div className="code-block">{error}</div> : null}

      {result && (
        <div className="purge-result card">
          <div className="purge-result-row">
            <span>Status</span>
            <span className={`status-pill${result.purged ? ' enabled' : ''}`}>
              {result.purged ? 'Purged' : result.dryRun ? 'Dry run preview' : 'No-op'}
            </span>
          </div>
          <div className="purge-result-row">
            <span>{result.dryRun ? 'Would delete' : 'Deleted'}</span>
            <strong>
              {result.deleted} {result.deleted === 1 ? 'key' : 'keys'}
            </strong>
          </div>
          {result.warnings.map((w, i) => (
            <div key={i} className="purge-warning" style={{ marginTop: 8 }}>
              {w}
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}
