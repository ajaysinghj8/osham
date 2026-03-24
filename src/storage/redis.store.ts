import { createClient } from 'redis';
import * as Debug from 'debug';
import { IStorage } from './IStorage';

const logger = Debug('acp:redis');

type RedisV4Client = ReturnType<typeof createClient>;

export class RedisStore implements IStorage {
  private client: RedisV4Client;

  get connected(): boolean {
    return this.client.isReady;
  }

  constructor(host: string, port: number) {
    this.client = createClient({ socket: { host, port } });
    this.client.on('error', e => logger(e));
    // connect in the background — isReady will be false until connected
    this.client.connect().catch(e => logger('Redis connect error:', e));
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl) {
      await this.client.set(key, value, { EX: ttl });
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<number> {
    return this.client.del(key);
  }

  async purgeByPattern(pattern: string): Promise<number> {
    let deleted = 0;
    for await (const key of this.client.scanIterator({ MATCH: pattern, COUNT: 100 })) {
      deleted += await this.client.del(key);
    }
    return deleted;
  }
}

export const RedisClientProvider = (host: string, port: number): RedisStore =>
  new RedisStore(host, port);
