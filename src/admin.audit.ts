export type AdminAuditAction = 'config.save' | 'config.reload' | 'admin.purge';
export type AdminAuditResult = 'success' | 'failure';

export interface AdminAuditEvent {
  time: string;
  action: AdminAuditAction;
  actor: string;
  result: AdminAuditResult;
  details?: Record<string, unknown>;
}

const MAX_EVENTS = 100;
const events: AdminAuditEvent[] = [];

export function appendAdminAuditEvent(event: AdminAuditEvent): void {
  events.unshift(event);
  if (events.length > MAX_EVENTS) {
    events.length = MAX_EVENTS;
  }
}

export function getAdminAuditEvents(): AdminAuditEvent[] {
  return [...events];
}
