import { safeLoad } from 'js-yaml';
import { readFileSync } from 'fs';
import { join } from 'path';

function supplant(o: any = {}) {
    return this.replace(/\${([^{}]*)}/g,
        (a: string, b: string) => {
            const r: any = o[b];
            if (r === undefined) {
                throw new Error(`Please set environment value of ${b}`);
            }
            return typeof r === 'string' || typeof r === 'number' ? r : a;
        }
    );
}

export function getCacheConfig() {
    try {
        const configFilePath = join(process.cwd(), 'cache-config.yml');
        const config = safeLoad(
            supplant.call(readFileSync(configFilePath, 'utf-8'), process.env)
        );
        // @todo : validate yml config rules
        return config;
    }
    catch (e) {
        throw e;
    }
}