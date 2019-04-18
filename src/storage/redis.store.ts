
import { createClient } from 'redis';
import * as Debug from 'debug';

const logger = Debug('acp:redis');


export const Redis = createClient({
    host: process.env.REDIS_HOST,
    port: +process.env.REDIS_PORT,
});

Redis.on('error', (e) => logger(e));

export const RedisPub = Redis.duplicate();
export const RedisSub = Redis.duplicate();

RedisSub.setMaxListeners(Infinity);
