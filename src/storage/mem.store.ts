import { IStorage } from './IStorage';

export class MemStore implements IStorage {
  public connected = true;
  private expired = new Map();
  private cache = new Map();

  constructor(private ttl_sec: number) {}
  public get(key: string, cb: (error: unknown, buffer: string) => void): void {
    if (!this.expired.has(key)) {
      return cb(new Error('Not found'), null);
    }
    if (this.expired.get(key) < Date.now()) {
      return cb(new Error('Expired'), null);
    }
    if (this.cache.has(key)) {
      return cb(null, this.cache.get(key));
    }
    return cb(new Error('Not found'), null);
  }

  public set(key: string, value: string, cb: () => void): void {
    this.cache.set(key, value);
    this.expired.set(key, Date.now() + this.ttl_sec * 1000);
    cb();
  }

  public del(key: string, cb: (error: unknown, reply: number) => void): void {
    this.cache.delete(key);
    this.expired.delete(key);
    cb(null, 1);
  }

  public expire(key: string, ttl_sec: number): void {
    this.expired.set(key, Date.now() + ttl_sec * 1000);
  }
}
