import { ICacheOptions, IRulesOptions } from "../types";
const pathToRegExp = require('path-to-regexp');

export class ConfigContext {
    private regexRules: any = {};
    constructor(private cacheOption: ICacheOptions, private rules: IRulesOptions) {
        //@todo : memo
        // this.getConfig = memo(this.getConfig)
        for (const key in this.rules) {
            const regex = pathToRegExp(key);
            this.regexRules[key] = regex;
        }
    }
    getConfig(path: string) {
        return { ...this.cacheOption, ...this.getConfigFromRule(path) };
    }

    private getConfigFromRule(path: string) {
        for (const key in this.rules) {
            const regex = this.regexRules[key];
            if (path.match(regex)) {
                return this.rules[key];
            }
        }
        return null;
    }
}
