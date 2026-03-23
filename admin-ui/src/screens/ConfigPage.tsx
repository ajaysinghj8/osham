import React from 'react';
import { Page } from '../ui/Page';

export function ConfigPage() {
  return (
    <Page title="Config" subtitle="Landing page for global settings and namespace editors.">
      <div className="code-block">
        <strong>Planned next:</strong>
        <ul>
          <li>load current config from <code>/__osham/admin/config</code></li>
          <li>draft editing for global config + namespaces</li>
          <li>validate, save, and reload actions</li>
        </ul>
      </div>
    </Page>
  );
}
