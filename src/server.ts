import * as Koa from 'koa';
import * as Debug from 'debug';

const logger = Debug('api-cache-proxy:server');

export const App = new Koa();

App.listen(process.env.PORT || 26192, () => {
    logger(`listing on ${process.env.PORT}`);
});
