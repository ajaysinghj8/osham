import { IncomingMessage, ServerResponse } from "http";
import { Stream } from "stream";
import { parse } from "url";
const statuses = require('statuses');

function respond() {
    const ctx = this;
    // allow bypassing koa
    if (false === ctx.sent) return;

    if (!ctx.writable) return;

    const res = ctx.res;
    let body = ctx.body;
    const code = ctx.status;

    // ignore body
    if (statuses.empty[code]) {
        // strip headers
        ctx.body = null;
        return res.end();
    }

    if ('HEAD' == ctx.method) {
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


export function CtxProvider(req: IncomingMessage, res: ServerResponse) {


    const ctx: Context = {
        req,
        res,
        set: function set(field: string, val: any) {
            // @todo if header not send
            this.res.setHeader(field, val);
            return this;
        },
        respond,
        get writable() {
            if (this.res.finished) return false;
            const socket = this.res.socket;
            if (!socket) return true;
            return socket.writable;
        },
        body: null,
        state: {},
        status: 404,
        get path() {
            return parse(this.req).pathname;
        },
    };
    return ctx;
}

export interface Context {
    req: IncomingMessage;
    res: ServerResponse;
    set: (field: string, val: any) => Context;
    respond: () => undefined;
    body: any;
    state: any;
    writable: boolean;
    status: number;
    path: string;
}