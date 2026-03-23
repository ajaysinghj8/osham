import React from 'react';
import { Page } from '../ui/Page';

export function HealthPage() {
  return (
    <Page title="Health" subtitle="Operational health and startup visibility.">
      <div className="code-block">Surface cache backend, uptime, revision, and feature flags here.</div>
    </Page>
  );
}
