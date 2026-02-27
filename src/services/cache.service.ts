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

  static put<T>(key: string, value: T, exptime?: number): Promise<T> {
    logger('Caching ->', key);
    return new Promise(resolve => {
      this.store.set(key, JSON.stringify(value), () => {
        if (exptime) this.store.expire(key, exptime);
        logger('Cached ->', key);
        return resolve(value);
      });
    });
  }

  static get<T>(key: string): Promise<T> {
    if (!Cache.isConnected()) throw new Error('Unable to connect Cache storage.');
    return new Promise((resolve, reject) => {
      this.store.get(key, (error, buffer) => {
        if (error || !buffer) {
          logger('failed cache ->', key);
          return reject(new Error(`Cache not found for key ${key}`));
        }
        logger('From cache ->', key);
        return resolve(JSON.parse(buffer.toString()) as T);
      });
    });
  }

  static getWithMetrics<T>(key: string, namespace: string): Promise<T> {
    if (!Cache.isConnected()) throw new Error('Unable to connect Cache storage.');
    return new Promise((resolve, reject) => {
      this.store.get(key, (error, buffer) => {
        if (error || !buffer) {
          logger('failed cache ->', key);
          Metrics.recordCacheMiss(namespace);
          return reject(new Error(`Cache not found for key ${key}`));
        }
        logger('From cache ->', key);
        Metrics.recordCacheHit(namespace);
        return resolve(JSON.parse(buffer.toString()) as T);
      });
    });
  }

  static purge(key: string): Promise<number> {
    logger('Invalidating cache ->', key);
    return new Promise(resolve => {
      this.store.del(key, (_, reply) => {
        resolve(reply);
      });
    });
  }

  static async purgeByPattern(pattern: string): Promise<number> {
    logger('Invalidating cache by pattern ->', pattern);
    if (!this.store.connected) {
      throw new Error('Unable to connect Cache storage.');
    }

    const anyStore = (this.store as unknown) as {
      purgeByPattern?: (p: string, cb: (error: unknown, reply: number) => void) => void;
      scan?: (...args: unknown[]) => void;
      del?: (...args: unknown[]) => void;
    };

    if (typeof anyStore.purgeByPattern === 'function') {
      return await new Promise(resolve => anyStore.purgeByPattern(pattern, (_, reply) => resolve(reply)));
    }

    // Redis client fallback (SCAN + DEL) when available.
    if (typeof anyStore.scan === 'function') {
      const scanAsync = (cursor: string) =>
        new Promise<{ cursor: string; keys: string[] }>(resolve => {
          anyStore.scan(cursor, 'MATCH', pattern, 'COUNT', '100', (err: unknown, reply: [string, string[]]) => {
            if (err || !reply) return resolve({ cursor: '0', keys: [] });
            resolve({ cursor: reply[0], keys: reply[1] || [] });
          });
        });

      const delAsync = (keys: string[]) =>
        new Promise<number>(resolve => {
          if (!keys.length) return resolve(0);
          // node_redis supports `del(string[])` and variadic keys.
          anyStore.del(keys, (_err: unknown, reply: number) => resolve(reply || 0));
        });

      let cursor = '0';
      let deleted = 0;
      do {
        const res = await scanAsync(cursor);
        cursor = res.cursor;
        deleted += await delAsync(res.keys);
      } while (cursor !== '0');
      return deleted;
    }

    // Fallback: no pattern support.
    return 0;
  }
}

function getCacheStore(): IStorage {
  if (process.env.REDIS_HOST && process.env.REDIS_PORT) {
    return RedisClientProvider();
  }
  logger('Redis properties not defined, using in memory cache. Not advised for production.');
  return new MemStore(5);
}
