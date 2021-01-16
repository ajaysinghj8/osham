export interface IStorage {
  connected: boolean;
  set: (key: string, value: string, cb: () => void) => void;
  get: (key: string, cb: (error: unknown, buffer: string) => void) => void;
  del: (key: string, cb: (error: unknown, reply: number) => void) => void;
  expire: (key: string, ttl: number) => void;
}
