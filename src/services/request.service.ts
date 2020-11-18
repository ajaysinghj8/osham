import { Context } from '../ctx.provider';
import * as Debug from 'debug';

const logger = Debug('acp:service:request');

function onSuccessWithCtx(ctx: Context, time: number) {
  return (response: any) => {
    const { statusCode, headers, data } = response;
    ctx.statusCode = statusCode;
    const stringData = data;
    for (const key in headers) {
      if (!Object.prototype.hasOwnProperty.call(headers, key)) continue;
      ctx.set(key, headers[key]);
    }
    ctx.body = stringData;
    logger(`Responded In: ${Date.now() - time} ms`);
    return {
      statusCode,
      headers,
      data: stringData,
    };
  };
}

export function onErrorWithCtx(ctx: Context) {
  return (error: any) => {
    throw error;
  };
}

export function makeRequest(ctx: Context, path: string, headers: any) {
  logger(`call server for ${path}`);
  const d1 = Date.now();
  const Axios: any = {}; /** no more axios */
  return Axios.get(path, { headers }).then(onSuccessWithCtx(ctx, d1), onErrorWithCtx(ctx));
}

export function errorToData(error: any) {
  const out: any = { statusCode: 503, data: '', headers: [] };
  try {
    const { message, statusCode, data, headers } = error;
    if (message) {
      return { statusCode, data, headers };
    }
    out.data = message;
  } catch (e) {}
  return out;
}
