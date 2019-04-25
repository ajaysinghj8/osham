import { IncomingMessage, ServerResponse, IncomingHttpHeaders } from 'http';
import { Stream } from 'stream';
import * as Debug from 'debug';
// tslint:disable-next-line: no-var-requires
const statuses = require('statuses');
// tslint:disable-next-line: no-var-requires
const qs = require('querystring');
// tslint:disable-next-line: no-var-requires
const logger = Debug('acp:server');
// tslint:disable-next-line: no-var-requires
const parse = require('parseurl');

function respond() {
    logger('respond called');
    const ctx = this;
    if (!ctx.writable) return;

    const res = ctx.res;
    let body = ctx.body;
    const code = ctx.statusCode;
    // ignore body
    if (statuses.empty[code]) {
        // strip headers
        ctx.body = null;
        return res.end();
    }

    if ('HEAD' === ctx.method) {
        if (!res.headersSent) {
            ctx.length = Buffer.byteLength(JSON.stringify(body));
        }
        return res.end();
    }

    // status body
    if (null == body) {
        if (ctx.req.httpVersionMajor >= 2) {
            body = String(code);
        } else {
            body = ctx.message || String(code);
        }
        if (!res.headersSent) {
            ctx.type = 'text';
            ctx.length = Buffer.byteLength(body);
        }
        return res.end(body);
    }
    if (body instanceof Stream) return body.pipe(res);
    res.end(body);
}

export interface Context {
    req: IncomingMessage;
    path: string;
    headers: IncomingHttpHeaders;
    method: string;
    querystring: string;
    query: any;
    search: string;
    get: (field: string) => string;

    res: ServerResponse;
    set: (field: string, val: any) => Context;
    respond: () => any;
    body: any;
    state: any;
    writable: boolean;
    statusCode: number;
    statusMessage: string;
}

export function CtxProvider(request: IncomingMessage, res: ServerResponse) {
    const urlParsedCache = parse(request);
    const ctx: Context = {
        /** in */
        req: request,
        get path() {
            return urlParsedCache.pathname;
        },
        get headers() {
            return this.req.headers;
        },
        get method() {
            return this.req.method;
        },
        get querystring() {
            if (!this.req) return '';
            return urlParsedCache.query || '';
        },
        get search() {
            if (!this.querystring) return '';
            return `?${this.querystring}`;
        },
        get(field: string) {
            const req = this.req;
            switch (field = field.toLowerCase()) {
                case 'referer':
                case 'referrer':
                    return req.headers.referrer || req.headers.referer || '';
                default:
                    return req.headers[field] || '';
            }
        },
        get query() {
            const str = this.querystring;
            const c = this._querycache = this._querycache || {};
            return c[str] || (c[str] = qs.parse(str));
        },

        /** out */
        res,
        body: null,
        state: {},
        get statusCode() {
            return this.res.statusCode;
        },
        set statusCode(code: number) {
            this.res.statusCode = code;
        },
        get statusMessage() {
            return this.res.statusMessage;
        },
        set statusMessage(msg: string) {
            this.res.statusMessage = msg;
        },
        respond,
        get writable() {
            if (this.res.finished) return false;
            const socket = this.res.socket;
            if (!socket) return true;
            return socket.writable;
        },
        set(field: string, val: any) {
            // @todo if header not send
            this.res.setHeader(field, val);
            return this;
        },
    };
    return ctx;
}
