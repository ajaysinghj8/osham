import * as Debug from 'debug';
import { IStorage } from '../storage/IStorage';
import { MemStore } from '../storage/mem.store';
import { RedisClientProvider } from '../storage/redis.store';
import { Metrics } from './metrics.service';

const logger = Debug('acp:service:cache');

export class Cache {
  static store = getCacheStore();

  static isConnected(): boolean {
    return this.store.connected;
  }

  static async put<T>(key: string, value: T, exptime?: number): Promise<T> {
    logger('Caching ->', key);
    await this.store.set(key, JSON.stringify(value), exptime);
    logger('Cached ->', key);
    return value;
  }

  static async get<T>(key: string): Promise<T> {
    if (!Cache.isConnected()) throw new Error('Unable to connect Cache storage.');
    const buffer = await this.store.get(key);
    if (!buffer) {
      logger('failed cache ->', key);
      throw new Error(`Cache not found for key ${key}`);
    }
    logger('From cache ->', key);
    return JSON.parse(buffer) as T;
  }

  static async getWithMetrics<T>(key: string, namespace: string): Promise<T> {
    if (!Cache.isConnected()) throw new Error('Unable to connect Cache storage.');
    const buffer = await this.store.get(key);
    if (!buffer) {
      logger('failed cache ->', key);
      Metrics.recordCacheMiss(namespace);
      throw new Error(`Cache not found for key ${key}`);
    }
    logger('From cache ->', key);
    Metrics.recordCacheHit(namespace);
    return JSON.parse(buffer) as T;
  }

  static async purge(key: string): Promise<number> {
    logger('Invalidating cache ->', key);
    return this.store.del(key);
  }

  static async purgeByPattern(pattern: string): Promise<number> {
    logger('Invalidating cache by pattern ->', pattern);
    if (!this.store.connected) {
      throw new Error('Unable to connect Cache storage.');
    }
    if (typeof this.store.purgeByPattern === 'function') {
      return this.store.purgeByPattern(pattern);
    }
    return 0;
  }
}

function getCacheStore(): IStorage {
  if (process.env.REDIS_HOST && process.env.REDIS_PORT) {
    return RedisClientProvider(process.env.REDIS_HOST, +process.env.REDIS_PORT);
  }
  logger('Redis properties not defined, using in memory cache. Not advised for production.');
  return new MemStore(5);
}
