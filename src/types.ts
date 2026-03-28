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
  insecureSkipVerify?: boolean;
  timeout?: number;
  rules?: IRulesOptions;
  cache: ICacheOptions;
  allow?: string[];
  deny?: string[];
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
  purge?: boolean;
  metrics?: boolean;
  changeOrigin: boolean;
}

/**
 * IFullConfig is the structured result of parsing and validating cache-config.yml.
 * It separates the top-level global settings from the namespace map, eliminating
 * the need for unsafe casts when iterating over config entries.
 *
 * Replaces the old ICacheConfig union type (IParentConfig | { [key: string]: INameSpaceOptions })
 * which blurred the two concerns into a single flat object.
 */
export interface IFullConfig {
  globalConfig: IParentConfig;
  namespaces: Record<string, INameSpaceOptions>;
}

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
  respondWith: (response: IInternalResponse, oshamHeaders?: Record<string, string>) => IContext;
  body: unknown;
  responseHeaders: Record<string, string>;
  writable: boolean;
  statusCode: number;
  statusMessage: string;
}
