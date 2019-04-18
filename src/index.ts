import { config } from 'dotenv';
config();
import { Server } from './server';
import { IncomingMessage, ServerResponse } from 'http';
import { getCacheConfig } from './config.reader';
import { RouteTimeReqRes } from './middlewares/responseTime';
import { createNameSpaceHandler } from './middlewares/nameSpaceHandler';
import { CtxProvider } from './ctx.provider';
const compose = require('koa-compose');

const middlewares: Array<Function> = [];
const cacheConfig = getCacheConfig();

// /**
//  * For each namespace
//  *  create handler
//  */

for (const key in cacheConfig) {
    switch (key) {
        case 'version': break;
        case 'timeout':
            // @todo apply timeout 
            break;
        case 'xResponseTime':
            middlewares.push(RouteTimeReqRes);
            break;
        default:
            // it is namespace
            middlewares.push(createNameSpaceHandler(key, cacheConfig[key]));
    }
}

Server.on('request', async (req: IncomingMessage, res: ServerResponse) => {
    const ctx = CtxProvider(req, res);
    const fnMiddleware = compose(middlewares);
    res.statusCode = 404;
    const onerror = (err: any) => res.end(err);
    const handleResponse = () => res.end('working');//respond(ctx);
    // onFinished(res, onerror);
    return fnMiddleware(ctx).then(handleResponse).catch(onerror);
});