import { OutgoingHttpHeaders } from 'http';
import { Context } from '../ctx.provider';

export function writeHeaders(headers: OutgoingHttpHeaders, ctx?: Context) {
    const headersMap: any = {};
    const setCtxHeaders = (field: string, value: any) => {
        ctx.set(field, value);
        headersMap[field] = value;
    };
    const setHeader = ctx ? setCtxHeaders : (field: string, value: any) => headersMap[field] = value;
    for (const field in headers) {
        if (!Object.prototype.hasOwnProperty.call(headers, field)) continue;
        setHeader(String(field).trim(), headers[field]);
    }
    return headersMap;
}
