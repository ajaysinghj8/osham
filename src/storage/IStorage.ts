export interface IStorage {
  connected: boolean;
  set(key: string, value: string, ttl?: number): Promise<void>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
  purgeByPattern?(pattern: string): Promise<number>;
}
