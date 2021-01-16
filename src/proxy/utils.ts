import { OutgoingHttpHeaders } from 'http';
import { IContext } from '../types';

export function writeHeaders(headers: OutgoingHttpHeaders, ctx?: IContext): Record<string, string> {
  const headersMap: Record<string, string> = {};
  const setCtxHeaders = (field: string, value: string) => {
    ctx.set(field, value);
    headersMap[field] = value;
  };
  const setHeader = ctx ? setCtxHeaders : (field: string, value: string) => (headersMap[field] = value);
  for (const field in headers) {
    if (!Object.prototype.hasOwnProperty.call(headers, field)) continue;
    const value = headers[field];
    const val = Array.isArray(value) ? value.map(String) : String(value);
    if (!val) continue;
    setHeader(String(field).trim(), val as string);
  }
  return headersMap;
}
