import React from 'react';
import { Page } from '../ui/Page';
import { apiGet } from '../api';
import { HealthResponse } from '../types';

export function HealthPage() {
  const [data, setData] = React.useState<HealthResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    apiGet<HealthResponse>('/__osham/admin/health')
      .then(setData)
      .catch(err => setError(err.message));
  }, []);

  return (
    <Page title="Health" subtitle="Operational health and startup visibility.">
      {error ? <div className="code-block">{error}</div> : null}
      <div className="code-block">
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </div>
    </Page>
  );
}
