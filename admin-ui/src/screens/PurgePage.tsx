import React from 'react';
import { Page } from '../ui/Page';

export function PurgePage() {
  return (
    <Page title="Purge" subtitle="Safe cache invalidation tools.">
      <div className="code-block">Next step: connect form to <code>POST /__osham/admin/purge</code> with warning display and dry-run support.</div>
    </Page>
  );
}
