import React from 'react';
import { Page } from '../ui/Page';
import { apiPost } from '../api';

interface PurgeResponse {
  purged: boolean;
  dryRun: boolean;
  deleted: number;
  warnings: string[];
}

export function PurgePage() {
  const [pattern, setPattern] = React.useState('**');
  const [dryRun, setDryRun] = React.useState(true);
  const [result, setResult] = React.useState<PurgeResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function submit() {
    try {
      const data = await apiPost<PurgeResponse>('/__osham/admin/purge', { pattern, dryRun });
      setResult(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    }
  }

  return (
    <Page title="Purge" subtitle="Safe cache invalidation tools.">
      <div className="toolbar">
        <input className="input" value={pattern} onChange={e => setPattern(e.target.value)} />
        <label>
          <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} /> dry run
        </label>
        <button className="button" onClick={submit}>
          Run Purge
        </button>
      </div>
      {error ? <div className="code-block">{error}</div> : null}
      {result ? <pre className="code-block">{JSON.stringify(result, null, 2)}</pre> : null}
    </Page>
  );
}
