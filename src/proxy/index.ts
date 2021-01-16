import { IncomingMessage, ClientRequest } from 'http';
import * as FollowRedirects from 'follow-redirects';
import * as Http from 'http';
import * as Https from 'https';
import { parse, UrlWithStringQuery } from 'url';
import { join } from 'path';
import * as Debug from 'debug';
import { writeHeaders } from './utils';
import { createGunzip } from 'zlib';
import { IContext } from '../types';
import { Stream } from 'stream';

const NativeAgents = { http: Http, https: Https };

const logger = Debug('acp:service:proxy');
export interface IProxyOptions {
  target: string;
  port?: number;
  followRedirects?: boolean;
  changeOrigin?: boolean;
  timeout?: number;
}

export interface IProxyResponse<T = unknown> {
  [x: string]: unknown;
  data: T;
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string>;
  request?: ExtendedClientRequest;
  response?: IncomingMessage;
  toJSON?: () => IProxyResponse<T>;
  message?: string;
}

export type ProxyResponsePromise<T = unknown> = Promise<IProxyResponse<T>>;

interface ExtendedClientRequest extends ClientRequest {
  pipes?(ctx: IContext): ExtendedClientRequest;
  toPromise?(): ProxyResponsePromise<unknown>;
}

interface IErrorRespone {
  statusCode: number;
  statusMessage: string;
  headers: Record<string, string>;
}

interface IProxyReponseCtx {
  pipes: (ctx: IContext, osham_headers?: Record<string, string>) => IProxyReponseCtx;
  toPromise: () => Promise<IProxyResponse>;
  proxy: Proxy;
  request: ClientRequest | FollowRedirects.RedirectableRequest<ClientRequest, IncomingMessage>;
  response: IErrorRespone | IncomingMessage;
  message: string;
}

class Proxy {
  static isSSL = /^https/;
  static upgradeHeader = /(^|,)\s*upgrade\s*($|,)/i;
  static ErrorResponse: IErrorRespone = { statusCode: 503, statusMessage: 'Service Unavailable', headers: {} };

  private isSecure = false;
  private agent:
    | typeof Https
    | typeof Http
    | FollowRedirects.Override<
        typeof Https,
        FollowRedirects.RedirectScheme<Https.RequestOptions, ClientRequest, IncomingMessage>
      >
    | FollowRedirects.Override<
        typeof Http,
        FollowRedirects.RedirectScheme<Http.RequestOptions, ClientRequest, IncomingMessage>
      >;
  private port: number;
  private target: UrlWithStringQuery;

  constructor(private options: IProxyOptions) {
    this.isSecure = Proxy.isSSL.test(options.target);
    this.target = parse(this.options.target);
    this.port = this.isSecure ? 443 : 80;
    const agents = this.options.followRedirects ? FollowRedirects : NativeAgents;
    this.agent = this.isSecure ? agents.https : agents.http;
  }

  request(
    path: string,
    method: string,
    headers: Record<string, string>,
    dataStream?: Stream,
  ): Promise<IProxyReponseCtx> {
    logger(`Request(${method}) ${path}`);
    const proxyCtx: Partial<IProxyReponseCtx> = {
      pipes,
      toPromise,
      proxy: this,
    };
    try {
      const options = this.getRequestOptions(path, method, headers);
      const request = this.agent.request(options);
      if (this.options.timeout) {
        request.setTimeout(this.options.timeout, () => request.abort());
      }
      if (dataStream && dataStream.pipe) {
        dataStream.pipe(request);
      }
      request.end();
      return new Promise(resolve => {
        request.on('response', (response: IncomingMessage) => {
          resolve({ ...proxyCtx, request, response } as IProxyReponseCtx);
        });
        request.on('error', (e: Error) =>
          resolve({
            ...proxyCtx,
            request,
            response: { ...Proxy.ErrorResponse },
            message: e.message,
          } as IProxyReponseCtx),
        );
        request.on('abort', (e: Error) =>
          resolve({
            ...proxyCtx,
            request,
            response: { ...Proxy.ErrorResponse },
            message: e.message,
          } as IProxyReponseCtx),
        );
      });
    } catch (e) {
      return Promise.resolve({
        ...proxyCtx,
        message: e.message,
        response: { ...Proxy.ErrorResponse },
      } as IProxyReponseCtx);
    }
  }

  private getRequestOptions(path: string, method: string, headers: Record<string, string>) {
    const options = {
      port: this.target.port || this.port,
      method,
      headers: { ...headers },
      host: this.target.hostname,
      path: join(this.target.path, path),
    };

    if (typeof options.headers.connection !== 'string' || !Proxy.upgradeHeader.test(options.headers.connection)) {
      options.headers.connection = 'close';
    }

    if (this.options.changeOrigin) {
      options.headers.host = options.headers.hostname = this.target.host;
    }

    if ((method === 'DELETE' || method === 'OPTIONS') && !headers['content-length']) {
      headers['content-length'] = '0';
      delete headers['transfer-encoding'];
    }

    return options;
  }
}

export function createProxy(
  options: IProxyOptions,
): (path: string, method: string, headers: Http.IncomingHttpHeaders, dataStream?: Stream) => Promise<IProxyReponseCtx> {
  const proxy = new Proxy(options);
  return (path: string, method: string, headers: Record<string, string>, dataStream?: Stream) =>
    proxy.request(path, method, headers, dataStream);
}

function pipes(ctx: IContext, osham_headers: Record<string, string> = {}) {
  const { response, message } = this as IProxyReponseCtx;
  const { statusCode, statusMessage, headers } = response;
  ctx.statusCode = statusCode;
  ctx.statusMessage = statusMessage;
  ctx.responseHeaders = writeHeaders(headers, ctx);
  writeHeaders(osham_headers, ctx);
  ctx.body = message || response;
  /** if not res.headersSent */
  /** @TODO:: ctx.setHeaders */
  /** if not res.finished */
  return this;
}

function toPromise(): Promise<IProxyResponse<unknown>> {
  const { response, message } = this as IProxyReponseCtx;
  const { statusCode, statusMessage } = response;
  const headers = writeHeaders(response.headers);
  const isGzip = hasGzipedResponse(headers);
  const ob: IProxyResponse<string> = {
    data: '',
    statusCode,
    statusMessage,
    headers,
    isGzip,
    ...this,
    toJSON() {
      return {
        data: this.data,
        statusCode: this.statusCode,
        statusMessage: this.statusMessage,
        headers: this.headers,
      };
    },
    message: '',
  };

  if (!(response instanceof IncomingMessage)) {
    return Promise.reject({ ...ob, message });
  }

  return new Promise((resolve, reject) => {
    const stream = ob.isGzip ? response.pipe(createGunzip()) : response;
    stream
      .on('error', onError)
      .on('end', onEnd)
      .on('data', (chunk: string) => (ob.data += chunk.toString()));
    return;
    // --end
    function onError(e: Error) {
      return reject({ ...ob, message: e.message });
    }
    function onEnd() {
      if (ob.isGzip) {
        delete ob.headers['content-encoding'];
        if (ob.data) {
          ob.headers['content-length'] = ob.data.length.toString();
        }
      }
      if (ob.statusCode >= 200 && ob.statusCode < 300) {
        return resolve(ob);
      }
      return reject({ ...ob, message });
    }
  });
}

function hasGzipedResponse(headers: Record<string, string>) {
  const encoding = headers['content-encoding'];
  return encoding && encoding.includes('gzip');
}
