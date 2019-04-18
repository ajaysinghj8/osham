import { config } from 'dotenv';
config();
import { App } from './server';
import { getCacheConfig } from './config.reader';
import { RouteTimeReqRes } from './middlewares/responseTime';
import { createNameSpaceHandler } from './middlewares/nameSpaceHandler';

const cacheConfig = getCacheConfig();

/**
 * For each namespace
 *  create handler
 */

for (const key in cacheConfig) {
    switch (key) {
        case 'version': break;
        case 'xResponseTime':
            App.use(RouteTimeReqRes);
            break;
        default:
            // it is namespace
            App.use(createNameSpaceHandler(key, cacheConfig[key]));
    }
}
