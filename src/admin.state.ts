import { createHash } from 'crypto';
import { IFullConfig } from './types';

export interface AdminMeta {
  source: string;
  lastLoadedAt: string;
  lastAppliedAt: string | null;
  revision: string;
}

export interface AdminState {
  config: IFullConfig;
  meta: AdminMeta;
}

let state: AdminState | null = null;

export function getAdminState(): AdminState | null {
  return state;
}

export function setAdminState(config: IFullConfig, meta: AdminMeta): void {
  state = { config, meta };
}

export function computeRevision(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 8);
}
