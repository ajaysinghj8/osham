import * as Debug from 'debug';
import { IStorage } from '../storage/IStorage';
import { MemStore } from '../storage/mem.store';
import { RedisClientProvider } from '../storage/redis.store';

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

  static purge(key: string): Promise<number> {
    logger('Invalidating cache ->', key);
    return new Promise(resolve => {
      this.store.del(key, (_, reply) => {
        resolve(reply);
      });
    });
  }
}

function getCacheStore(): IStorage {
  if (process.env.REDIS_HOST && process.env.REDIS_PORT) {
    return RedisClientProvider();
  }
  logger('Redis properties not defined, using in memory cache. Not advised for production.');
  return new MemStore(5);
}
