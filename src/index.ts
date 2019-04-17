import { App } from './server';
import { getCacheConfig } from './config.reader';
import { RouteTimeReqRes } from './middlewares/responseTime';
import { createNameSpaceHandler } from './middlewares/nameSpaceHandler';

const config = getCacheConfig();

/**
 * For each namespace
 *  create handler
 */

for (const key in config) {
    switch (key) {
        case 'version': break;
        case 'xResponseTime':
            App.use(RouteTimeReqRes);
            break;
        default:
            // it is namespace
            App.use(createNameSpaceHandler(key, config[key]));
    }
}
