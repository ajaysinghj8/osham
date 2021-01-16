/* eslint-disable @typescript-eslint/no-var-requires */
import { ICacheOptions, IRulesOptions } from '../types';
const pathToRegExp = require('path-to-regexp');
const parseToMs = require('parse-duration');

function memo(fn: CallableFunction) {
  const store = new Map();
  return function memoFn(path: string) {
    if (store.has(path)) return store.get(path);
    const result = fn(path);
    store.set(path, result);
    return result;
  };
}
export class ConfigContext {
  private regexRules: Record<string, string> = {};

  constructor(private cacheOption: ICacheOptions, private rules: IRulesOptions) {
    if (this.cacheOption && this.cacheOption.expires) {
      this.cacheOption.expires = parseToMs(this.cacheOption.expires) / 1000;
    }

    for (const key in this.rules) {
      if (!Object.prototype.hasOwnProperty.call(this.rules, key)) continue;
      const regex = pathToRegExp(key);
      const cache = this.rules[key].cache;
      if (cache && cache.expires) {
        cache.expires = parseToMs(cache.expires) / 1000;
      }
      this.regexRules[key] = regex;
    }

    this.getCacheConfig = memo(this.getCacheConfig.bind(this));
  }

  getCacheConfig(path: string): ICacheOptions {
    const cacheConfig = this.getConfigFromRule(path);
    if (typeof cacheConfig === 'object' && cacheConfig !== null) return cacheConfig;
    if (cacheConfig === false) return cacheConfig;
    return this.cacheOption;
  }

  private getConfigFromRule(path: string) {
    const _path = `/${path}/`;
    for (const key in this.rules) {
      if (!Object.prototype.hasOwnProperty.call(this.rules, key)) continue;
      const regex = this.regexRules[key];
      if (_path.match(regex)) {
        return this.rules[key].cache;
      }
    }
    return null;
  }
}
