export class OshamHeaders {
  private hit = false;
  private pooled = false;
  private pooled_start_time: number;
  private pooled_main = false;
  constructor(private key: string) {}

  setHit(value: boolean): OshamHeaders {
    this.hit = value;
    return this;
  }

  setPooledMain(value: boolean): OshamHeaders {
    this.pooled_main = value;
    return this;
  }

  setPooled(value: boolean): OshamHeaders {
    this.pooled = value;
    this.pooled_start_time = Date.now();
    return this;
  }

  toRecords(): Record<string, string> {
    const headers = { 'x-osham-key': this.key, 'x-osham-hit': String(this.hit) };
    if (this.pooled) {
      Reflect.set(headers, 'x-osham-pooled', String(true));
      Reflect.set(headers, 'x-osham-pooled-wait', `${Date.now() - this.pooled_start_time}ms`);
    }
    if (this.pooled_main) {
      Reflect.set(headers, 'x-osham-pooled-main', String(true));
    }
    return headers;
  }

  static notConfigured(http_method: string): Record<string, string> {
    return { 'x-osham-cache': http_method === 'GET' ? 'no-config' : 'not-allowed' };
  }
}
