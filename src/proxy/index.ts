import { IncomingMessage, ServerResponse, ClientRequest } from 'http';
import * as FollowRedirects from 'follow-redirects';
import * as Http from 'http';
import * as Https from 'http2';
import { parse, UrlWithStringQuery } from 'url';
import { join } from 'path';

import { writeHeaders } from './utils';

const NativeAgents = { http: Http, https: Https };

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
    pipes?(response: any): ExtendedClientRequest;
    toPromise?(): ProxyResponsePromise<any>;
};

class Proxy {
    static isSSL: RegExp = /^https/;
    static upgradeHeader: RegExp = /(^|,)\s*upgrade\s*($|,)/i;
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

    request(path: string, method: string, headers: Array<any>, dataStream?: any) {
        const options = this.getRequestOptions(path, method, headers);
        const request: ExtendedClientRequest = this.agent.request(options);
        if (this.options.timeout) {
            request.setTimeout(this.options.timeout, () => request.abort());
        }
        request.pipes = (response: ServerResponse) => this.pipe(request, response);
        request.toPromise = () => this.toPromise(request);
        if (dataStream && dataStream.pipe) {
            dataStream.pipe(request);
        }
        request.end();
        return request;
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


    pipe(request: ExtendedClientRequest, response: ServerResponse): ExtendedClientRequest {
        request.on('response', (res: IncomingMessage) => {
            response.statusCode = res.statusCode;
            response.statusMessage = res.statusMessage;
            /** if not res.headersSent */
            /** @TODO:: ctx.setHeaders */
            writeHeaders(res.headers, response);
            /** if not res.finished */
            res.pipe(response);
        });
        /**
         * @TODO::
         * on abort
         * on error
         * 
         */
        return request;
    }

    toPromise(request: ExtendedClientRequest): ProxyResponsePromise<string> {
        return new Promise((resolve, reject) => {
            request.on('response', (response: IncomingMessage) => {
                const { statusCode, statusMessage } = response;

                const ob: ProxyResponse = {
                    data: '',
                    statusCode,
                    statusMessage,
                    headers: writeHeaders(response.headers),
                    request,
                    response,
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
                response.on('error', (e) => reject({ ...ob, message: e.message }));
                response.on('data', (chunk) => ob.data += chunk);
                response.on('end', () => {
                    if (ob.statusCode >= 200 && ob.statusCode < 300) {
                        return resolve(ob);
                    }
                    return reject(ob);
                });
            });
        });
    }
}


export function createProxy(options: IProxyOptions) {
    const proxy = new Proxy(options);
    return (path: string, method: string, headers: Array<any>, dataStream?: any) =>
        proxy.request(path, method, headers, dataStream);
}