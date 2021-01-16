import { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'http';
import { Stream } from 'stream';
import * as Debug from 'debug';
import * as statuses from 'statuses';
import * as parse from 'parseurl';
import qs = require('querystring');
import { IContext } from './types';

const logger = Debug('acp:server');

export class Context implements IContext {
  private urlParsedCache;
  private _querycache: Record<string, string> = {};
  public state = {};
  public body: unknown = null;
  constructor(public req: IncomingMessage, public res: ServerResponse) {
    this.urlParsedCache = parse(req);
  }

  get path(): string {
    return this.urlParsedCache.pathname;
  }

  get headers(): IncomingHttpHeaders {
    return this.req.headers;
  }

  get method(): string {
    return this.req.method;
  }

  get querystring(): string {
    if (!this.req) return '';
    return (this.urlParsedCache.query || '') as string;
  }

  get search(): string {
    if (!this.querystring) return '';
    return `?${this.querystring}`;
  }

  public get(field: string): string {
    const req = this.req;
    switch ((field = field.toLowerCase())) {
      case 'referer':
      case 'referrer':
        return (req.headers.referrer || req.headers.referer || '') as string;
      default:
        return (req.headers[field] || '') as string;
    }
  }

  get query(): Record<string, string> {
    const str = this.querystring;
    if (Reflect.has(this._querycache, str)) {
      return Reflect.get(this._querycache, str);
    }
    const val: Record<string, string> = (qs.parse(str) as unknown) as Record<string, string>;
    Reflect.set(this._querycache, str, { value: val });
    return val;
  }

  get statusCode(): number {
    return this.res.statusCode;
  }
  set statusCode(code: number) {
    this.res.statusCode = code;
  }
  get statusMessage(): string {
    return this.res.statusMessage;
  }
  set statusMessage(msg: string) {
    this.res.statusMessage = msg;
  }
  get writable(): boolean {
    if (this.res.writableEnded) return false;
    const socket = this.res.socket;
    if (!socket) return true;
    return socket.writable;
  }
  set(field: string, val: string): Context {
    // @todo if header not send
    try {
      this.res.setHeader(field, val);
    } catch (e) {
      logger('Error set headers', field, val);
    }
    return this;
  }

  respond(): void {
    logger('respond called');
    if (!this.writable) return;

    const res = this.res;
    const body = this.body;
    const code = this.statusCode;
    // ignore body
    if (statuses.empty[code]) {
      // strip headers
      this.body = null;
      return res.end();
    }

    if ('HEAD' === this.method) {
      if (!res.headersSent) {
        // ctx.length = Buffer.byteLength(JSON.stringify(body));
      }
      return res.end();
    }

    // status body
    // if (null == body) {
    //   if (ctx.req.httpVersionMajor >= 2) {
    //     body = String(code);
    //   } else {
    //     body = ctx.message || String(code);
    //   }
    //   if (!res.headersSent) {
    //     ctx.type = 'text';
    //     ctx.length = Buffer.byteLength(body);
    //   }
    //   return res.end(body);
    // }
    if (body instanceof Stream) {
      body.pipe(res);
      return;
    }
    res.end(body);
  }
}

export function CtxProvider(request: IncomingMessage, response: ServerResponse): IContext {
  return new Context(request, response);
}
