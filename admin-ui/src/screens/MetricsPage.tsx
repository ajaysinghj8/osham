import React from 'react';
import { Page } from '../ui/Page';

export function MetricsPage() {
  return (
    <Page title="Metrics" subtitle="Namespace and aggregate cache metrics.">
      <div className="code-block">Hook into <code>/__osham/admin/metrics/summary</code> and <code>/__osham/admin/metrics/namespaces</code>.</div>
    </Page>
  );
}
