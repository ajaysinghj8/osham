import { IncomingMessage, ServerResponse, ClientRequest } from 'http';
import * as FollowRedirects from 'follow-redirects';
import * as Http from 'http';
import * as Https from 'https';
import { parse, UrlWithStringQuery } from 'url';
import { join } from 'path';
import * as Debug from 'debug';
import { writeHeaders } from './utils';
import { Context } from '../ctx.provider';

const NativeAgents = { http: Http, https: Https };
const logger = Debug('acp:service:proxy');
export interface IProxyOptions {
    target: string;
    port?: number;
    followRedirects?: boolean;
    changeOrigin?: boolean;
    timeout?: number;
}

export interface ProxyResponse<T = any> {
    data: T;
    statusCode: number;
    statusMessage: string;
    headers: any;
    request?: ExtendedClientRequest;
    response?: IncomingMessage;
    toJSON?: () => ProxyResponse<T>;
    message?: string;
}

export interface ProxyResponsePromise<T = any> extends Promise<ProxyResponse<T>> {
}

interface ExtendedClientRequest extends ClientRequest {
    pipes?(ctx: Context): ExtendedClientRequest;
    toPromise?(): ProxyResponsePromise<any>;
};

class Proxy {
    static isSSL: RegExp = /^https/;
    static upgradeHeader: RegExp = /(^|,)\s*upgrade\s*($|,)/i;
    static ErrorResponse: any = { statusCode: 503, statusMessage: 'Service Unavailable', headers: {} };

    private isSecure: boolean = false;
    private agent: any;
    private port: number;
    private target: UrlWithStringQuery;

    constructor(private options: IProxyOptions) {
        this.isSecure = Proxy.isSSL.test(options.target);
        this.target = parse(this.options.target);
        this.port = this.isSecure ? 443 : 80;
        const agents = (this.options.followRedirects ? FollowRedirects : NativeAgents);
        this.agent = this.isSecure ? agents.https : agents.http;
    }

    request(path: string, method: string, headers: any, dataStream?: any) {
        logger(`Request(${method}) ${path}`);
        const options = this.getRequestOptions(path, method, headers);
        const request: ExtendedClientRequest = this.agent.request(options);
        if (this.options.timeout) {
            request.setTimeout(this.options.timeout, () => request.abort());
        }
        const proxyCtx = {
            pipes,
            toPromise,
            prxoy: this,
        };
        if (dataStream && dataStream.pipe) {
            dataStream.pipe(request);
        }
        request.end();
        return new Promise((resolve, reject) => {
            request.on('response', (response: IncomingMessage) => {
                resolve({ ...proxyCtx, request, response });
            });
            request.on('error', (e: Error) => reject({ ...proxyCtx, request, response: { ...Proxy.ErrorResponse }, message: e.message }));
            request.on('abort', (e: Error) => reject({ ...proxyCtx, request, response: { ...Proxy.ErrorResponse }, message: e.message }));
        });
    }

    private getRequestOptions(path: string, method: string, headers: any) {
        const options: any = {
            port: this.target.port || this.port,
            method,
            headers: { ...headers },
            host: this.target.host,
            path: join(this.target.path, path)
        };

        if (typeof options.headers.connection !== 'string' || !Proxy.upgradeHeader.test(options.headers.connection)) {
            options.headers.connection = 'close';
        }

        if (this.options.changeOrigin) {
            options.headers.host = options.headers.hostname = this.target.host;
        }

        if ((method === 'DELETE' || method === 'OPTIONS')
            && !headers['content-length']) {
            headers['content-length'] = '0';
            delete headers['transfer-encoding'];
        }

        return options;
    }
}


export function createProxy(options: IProxyOptions) {
    const proxy = new Proxy(options);
    return (path: string, method: string, headers: any, dataStream?: any) =>
        proxy.request(path, method, headers, dataStream);
};

function pipes(ctx: Context) {
    const { response } = this;
    const { statusCode, statusMessage, headers } = response;
    ctx.statusCode = statusCode;
    ctx.statusMessage = statusMessage;
    ctx.state.headers = writeHeaders(response.headers, ctx);
    ctx.body = response;
    /** if not res.headersSent */
    /** @TODO:: ctx.setHeaders */
    /** if not res.finished */
    return this;
}

function toPromise(ctx: Context) {
    const proxyCtx = this;
    const { response } = proxyCtx;
    return new Promise((resolve, reject) => {
        const { statusCode, statusMessage } = response;
        const ob: ProxyResponse = {
            data: '',
            statusCode,
            statusMessage,
            headers: ctx.state.headers || writeHeaders(response.headers),
            ...proxyCtx,
            toJSON: function () {
                return {
                    data: this.data,
                    statusCode: this.statusCode,
                    statusMessage: this.statusMessage,
                    headers: this.headers
                };
            },
            message: ''
        };
        response.on('error', (e: any) => reject({ ...ob, message: e.message }));
        response.on('data', (chunk: any) => ob.data += chunk);
        response.on('end', () => {
            if (ob.statusCode >= 200 && ob.statusCode < 300) {
                return resolve(ob);
            }
            return reject(ob);
        });
    });
}
