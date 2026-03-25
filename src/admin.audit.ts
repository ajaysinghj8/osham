import { appendFileSync, existsSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';

export type AdminAuditAction = 'config.save' | 'config.reload' | 'config.rollback' | 'admin.purge';
export type AdminAuditResult = 'success' | 'failure';

export interface AdminAuditEvent {
  time: string;
  action: AdminAuditAction;
  actor: string;
  result: AdminAuditResult;
  details?: Record<string, unknown>;
}

const MAX_EVENTS = 100;
const DEFAULT_AUDIT_PATH = '.osham-admin-audit.jsonl';
let auditFilePath = resolveAuditFilePath();
const events: AdminAuditEvent[] = [];

function resolveAuditFilePath(): string {
  return process.env.OSHAM_ADMIN_AUDIT_FILE || join(process.cwd(), DEFAULT_AUDIT_PATH);
}

function isAdminAuditEvent(value: unknown): value is AdminAuditEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<AdminAuditEvent>;
  return (
    typeof event.time === 'string' &&
    typeof event.action === 'string' &&
    typeof event.actor === 'string' &&
    typeof event.result === 'string'
  );
}

function setEvents(nextEvents: AdminAuditEvent[]): void {
  events.length = 0;
  events.push(...nextEvents.slice(0, MAX_EVENTS));
}

function loadEventsFromDisk(filePath: string): AdminAuditEvent[] {
  if (!existsSync(filePath)) return [];

  try {
    const lines = readFileSync(filePath, 'utf-8')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);

    const parsed = lines
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(isAdminAuditEvent);

    return parsed.reverse().slice(0, MAX_EVENTS);
  } catch {
    return [];
  }
}

function persistEvent(event: AdminAuditEvent): void {
  appendFileSync(auditFilePath, `${JSON.stringify(event)}\n`, 'utf-8');
}

function ensureLoaded(): void {
  if (events.length) return;
  setEvents(loadEventsFromDisk(auditFilePath));
}

export function appendAdminAuditEvent(event: AdminAuditEvent): void {
  ensureLoaded();
  events.unshift(event);
  if (events.length > MAX_EVENTS) {
    events.length = MAX_EVENTS;
  }

  try {
    persistEvent(event);
  } catch {
    // Best-effort persistence. Keep in-memory audit visibility even if disk writes fail.
  }
}

export function getAdminAuditEvents(): AdminAuditEvent[] {
  ensureLoaded();
  return [...events];
}

export function reloadAdminAuditEvents(): AdminAuditEvent[] {
  setEvents(loadEventsFromDisk(auditFilePath));
  return getAdminAuditEvents();
}

export function configureAdminAuditForTests(filePath?: string): void {
  auditFilePath = filePath || resolveAuditFilePath();
  setEvents([]);
}

export function clearAdminAuditForTests(): void {
  setEvents([]);
  try {
    if (existsSync(auditFilePath)) {
      unlinkSync(auditFilePath);
    }
  } catch {
    // ignore cleanup failures in tests
  }
}
