import { config } from 'dotenv';
config();
import { Server } from './server';
import { IncomingMessage, ServerResponse } from 'http';
import { getCacheConfig } from './config.reader';
import { RouteTimeReqRes } from './middlewares/responseTime';
import { HealthCheck } from './middlewares/healthCheck';
import { createNameSpaceHandler } from './middlewares/nameSpaceHandler';
import { CtxProvider } from './ctx.provider';
import * as compose from 'koa-compose';
import { isNameSpace } from './utils';
// import { timeoutMiddlewareProvider } from './middlewares/timeoutMiddleware';

const middlewares: Array<any> = [];
const cacheConfig = getCacheConfig();

// /**
//  * For each namespace
//  *  create handler
//  */

if (process.env.TIMEOUT) {
    // middlewares.push(timeoutMiddlewareProvider(+process.env.TIMEOUT));
}

for (const key in cacheConfig) {
    if (!Object.prototype.hasOwnProperty.call(cacheConfig, key)) continue;
    switch (key) {
        case 'version':
        case 'changeOrigin':
            break;
        case 'xResponseTime':
            middlewares.push(RouteTimeReqRes);
            break;
        case 'health':
            middlewares.push(HealthCheck);
            break;
        default:
            // it is namespace
            const options = cacheConfig[key];
            if (isNameSpace(key, options)) {
                middlewares.push(createNameSpaceHandler(key, options));
            }
    }
}

Server.on('request', async (req: IncomingMessage, res: ServerResponse) => {
    const ctx = CtxProvider(req, res);
    const fnMiddleware = compose(middlewares);
    res.statusCode = 404;
    const onerror = (err: any) => res.end(err);
    const handleResponse = () => ctx.respond();
    return fnMiddleware(ctx).then(handleResponse).catch(onerror);
});
