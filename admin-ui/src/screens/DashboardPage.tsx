import React from 'react';
import { Page } from '../ui/Page';
import { Card } from '../ui/Card';

export function DashboardPage() {
  return (
    <Page title="Dashboard" subtitle="High-level operational overview for Osham.">
      <div className="card-grid">
        <Card title="Service Health">
          <p>Wire to <code>/__osham/admin/health</code>.</p>
        </Card>
        <Card title="Startup Summary">
          <p>Wire to <code>/__osham/admin/startup-summary</code>.</p>
        </Card>
        <Card title="Metrics Summary">
          <p>Wire to <code>/__osham/admin/metrics/summary</code>.</p>
        </Card>
        <Card title="Revision">
          <p>Show current config revision and apply state.</p>
        </Card>
      </div>
    </Page>
  );
}
