import React from 'react';
import { Page } from '../ui/Page';
import { apiGet } from '../api';
import { AuditEvent } from '../types';

export function AuditPage() {
  const [events, setEvents] = React.useState<AuditEvent[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    apiGet<AuditEvent[]>('/__osham/admin/audit')
      .then(setEvents)
      .catch(err => setError(err.message));
  }, []);

  return (
    <Page title="Audit" subtitle="Recent admin actions.">
      {error ? <div className="code-block">{error}</div> : null}
      <table className="table">
        <thead>
          <tr>
            <th>Time</th>
            <th>Action</th>
            <th>Result</th>
            <th>Actor</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event, index) => (
            <tr key={`${event.time}-${index}`}>
              <td>{event.time}</td>
              <td>{event.action}</td>
              <td>{event.result}</td>
              <td>{event.actor}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Page>
  );
}
