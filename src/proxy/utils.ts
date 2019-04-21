import { ServerResponse, OutgoingHttpHeaders } from "http";
import { Context } from "../ctx.provider";

export function writeHeaders(headers: OutgoingHttpHeaders, ctx?: Context) {
    const headersMap: any = {};
    const setCtxHeaders = (field: string, value: any) => {
        ctx.set(field, value);
        headersMap[field] = value;
    };
    const setHeader = ctx ? setCtxHeaders : (field: string, value: any) => headersMap[field] = value;
    for (const field in headers) {
        if (field === undefined) continue;
        const value = headers[field];
        setHeader(String(field).trim(), value);
    }
    return headersMap;
}

