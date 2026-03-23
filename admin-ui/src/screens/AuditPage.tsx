import React from 'react';
import { Page } from '../ui/Page';

export function AuditPage() {
  return (
    <Page title="Audit" subtitle="Recent admin actions.">
      <div className="code-block">Next step: table view over <code>/__osham/admin/audit</code>.</div>
    </Page>
  );
}
