import { safeLoad } from 'js-yaml';
import { readFileSync } from 'fs';
import { join } from 'path';

export function getCacheConfig() {
    try {
        const configFilePath = join(process.cwd(), 'cache-config.yml');
        const config = safeLoad(readFileSync(configFilePath, 'utf-8'));
        //@todo : validate yml config rules
        return config;
    }
    catch (e) {
        console.log(e);
        process.exit(1);
    }
}