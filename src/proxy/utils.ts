import { ServerResponse, OutgoingHttpHeaders } from "http";

export function writeHeaders(headers: OutgoingHttpHeaders, response?: ServerResponse) {
    const headersMap: any = {};
    const setHeader = response ? (field: string, value: any) => response.setHeader(field, value)
        : (field: string, value: any) => headersMap[field] = value;
    for (const field in headers) {
        if (field === undefined) continue;
        const value = headers[field];
        setHeader(String(field).trim(), value);
    }
    return headersMap;
}

