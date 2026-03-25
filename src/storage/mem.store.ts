import * as Debug from 'debug';
import { minimatch } from 'minimatch';
import { IStorage } from './IStorage';

const logger = Debug('acp:store:mem');

export class MemStore implements IStorage {
  public connected = true;
  private expired = new Map<string, number>();
  private cache = new Map<string, string>();

  constructor(private ttl_sec: number) {}

  async get(key: string): Promise<string | null> {
    if (!this.expired.has(key)) return null;
    if (this.expired.get(key) < Date.now()) return null;
    return this.cache.get(key) ?? null;
  }

  async set(key: string, value: string, ttl_sec?: number): Promise<void> {
    this.cache.set(key, value);
    const ttl = ttl_sec ?? this.ttl_sec;
    this.expired.set(key, Date.now() + ttl * 1000);
  }

  async del(key: string): Promise<number> {
    const existed = this.cache.has(key);
    this.cache.delete(key);
    this.expired.delete(key);
    return existed ? 1 : 0;
  }

  async purgeByPattern(pattern: string): Promise<number> {
    let deleted = 0;
    for (const key of this.cache.keys()) {
      if (!minimatch(String(key), pattern)) continue;
      this.cache.delete(key);
      this.expired.delete(key);
      deleted += 1;
    }
    logger(`[purgeByPattern] deleted ${deleted} keys for pattern ${pattern}`);
    return deleted;
  }
}
