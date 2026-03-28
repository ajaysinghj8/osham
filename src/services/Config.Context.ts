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
function toSeconds(expires: string | number): number {
  if (typeof expires === 'number') return expires;
  return parseToMs(expires) / 1000;
}

export class ConfigContext {
  private regexRules: Record<string, string> = {};
  private resolvedCache: ICacheOptions;
  private resolvedRules: IRulesOptions;

  constructor(cacheOption: ICacheOptions, rules: IRulesOptions) {
    // Work with local copies so shared config objects are never mutated.
    this.resolvedCache =
      cacheOption && cacheOption.expires
        ? { ...cacheOption, expires: toSeconds(cacheOption.expires) }
        : cacheOption;

    const resolvedRules: IRulesOptions = {};
    for (const key in rules) {
      if (!Object.prototype.hasOwnProperty.call(rules, key)) continue;
      this.regexRules[key] = pathToRegExp(key);
      const cache = rules[key].cache;
      resolvedRules[key] = {
        ...rules[key],
        cache: cache && cache.expires ? { ...cache, expires: toSeconds(cache.expires) } : cache,
      };
    }
    this.resolvedRules = resolvedRules;

    this.getCacheConfig = memo(this.getCacheConfig.bind(this));
  }

  getCacheConfig(path: string): ICacheOptions {
    const cacheConfig = this.getConfigFromRule(path);
    if (typeof cacheConfig === 'object' && cacheConfig !== null) return cacheConfig;
    if (cacheConfig === false) return cacheConfig;
    return this.resolvedCache;
  }

  private getConfigFromRule(path: string) {
    const _path = `/${path}/`;
    for (const key in this.resolvedRules) {
      if (!Object.prototype.hasOwnProperty.call(this.resolvedRules, key)) continue;
      const regex = this.regexRules[key];
      if (_path.match(regex)) {
        return this.resolvedRules[key].cache;
      }
    }
    return null;
  }
}
