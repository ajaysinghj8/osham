import { IncomingHttpHeaders, IncomingMessage, ServerResponse } from 'http';

interface BaseICacheOptions {
  expires?: number | string;
  query?: false | Array<string>;
  headers?: false | Array<string>;
  pool?: boolean;
}

export type ICacheOptions = undefined | false | BaseICacheOptions;

export interface IRulesOptions {
  [key: string]: { cache: ICacheOptions };
}

export interface INameSpaceOptions {
  expose: string;
  target: string;
  port?: number;
  followRedirects?: boolean;
  changeOrigin?: boolean;
  timeout?: number;
  rules: IRulesOptions;
  cache: ICacheOptions;
}

export interface IInternalResponse {
  statusCode: number;
  headers: Record<string, string>;
  data: string;
  statusMessage?: string;
  message?: string;
}

export interface IParentConfig {
  version: string;
  xResponseTime: boolean;
  health: boolean;
  changeOrigin: boolean;
}

export type ICacheConfig = IParentConfig | { [key: string]: INameSpaceOptions };

export interface IContext {
  req: IncomingMessage;
  path: string;
  headers: IncomingHttpHeaders;
  method: string;
  querystring: string;
  query: Record<string, string>;
  search: string;
  get: (field: string) => string;

  res: ServerResponse;
  set: (field: string, val: string) => IContext;
  respond: () => void;
  body: unknown;
  responseHeaders: Record<string, string>;
  writable: boolean;
  statusCode: number;
  statusMessage: string;
}
