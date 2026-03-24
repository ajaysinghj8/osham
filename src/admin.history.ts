import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { basename, join } from 'path';

export interface AdminConfigSnapshot {
  revision: string;
  createdAt: string;
  reason: 'save' | 'rollback';
  sourceRevision?: string;
  path: string;
}

const DEFAULT_HISTORY_DIR = '.osham-admin-history';
const MAX_SNAPSHOTS = 25;

function historyDir(): string {
  return process.env.OSHAM_ADMIN_HISTORY_DIR || join(process.cwd(), DEFAULT_HISTORY_DIR);
}

function ensureHistoryDir(): string {
  const dir = historyDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function fileName(snapshot: Pick<AdminConfigSnapshot, 'createdAt' | 'revision' | 'reason'>): string {
  const safeTime = encodeURIComponent(snapshot.createdAt);
  return `${safeTime}--${snapshot.reason}--${snapshot.revision}.yml`;
}

function parseSnapshotFile(filePath: string): AdminConfigSnapshot | null {
  const name = basename(filePath);
  const match = name.match(/^(.*?)--(save|rollback)--([a-f0-9]+)\.yml$/);
  if (!match) return null;

  return {
    createdAt: decodeURIComponent(match[1]),
    reason: match[2] as 'save' | 'rollback',
    revision: match[3],
    path: filePath,
  };
}

function sortSnapshotsDesc(items: AdminConfigSnapshot[]): AdminConfigSnapshot[] {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function listAdminConfigSnapshots(): AdminConfigSnapshot[] {
  const dir = historyDir();
  if (!existsSync(dir)) return [];

  const snapshots = readdirSync(dir)
    .filter(file => file.endsWith('.yml'))
    .map(file => parseSnapshotFile(join(dir, file)))
    .filter((value): value is AdminConfigSnapshot => !!value);

  return sortSnapshotsDesc(snapshots);
}

function trimSnapshotHistory(): void {
  const snapshots = listAdminConfigSnapshots();
  snapshots.slice(MAX_SNAPSHOTS).forEach(snapshot => {
    try {
      unlinkSync(snapshot.path);
    } catch {
      // best effort
    }
  });
}

export function persistAdminConfigSnapshot(input: {
  revision: string;
  content: string;
  createdAt?: string;
  reason?: 'save' | 'rollback';
}): AdminConfigSnapshot {
  const createdAt = input.createdAt || new Date().toISOString();
  const reason = input.reason || 'save';
  const dir = ensureHistoryDir();
  const snapshot: AdminConfigSnapshot = {
    revision: input.revision,
    createdAt,
    reason,
    path: join(dir, fileName({ createdAt, revision: input.revision, reason })),
  };

  const tempPath = `${snapshot.path}.tmp`;
  writeFileSync(tempPath, input.content, 'utf-8');
  renameSync(tempPath, snapshot.path);
  trimSnapshotHistory();
  return snapshot;
}

export function readAdminConfigSnapshot(revision: string): AdminConfigSnapshot & { content: string } {
  const snapshot = listAdminConfigSnapshots().find(item => item.revision === revision);
  if (!snapshot) {
    throw new Error(`Snapshot not found for revision ${revision}`);
  }

  return {
    ...snapshot,
    content: readFileSync(snapshot.path, 'utf-8'),
  };
}
