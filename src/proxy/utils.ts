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
        const value = headers[field];
        const val = Array.isArray(value) ? value.map(String) : String(value);
        setHeader(String(field).trim(), val);
    }
    return headersMap;
}
