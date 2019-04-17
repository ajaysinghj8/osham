import { RedisSub, RedisPub } from "../storage/redis.store";
import { Cache } from "./cache.service";
import * as Debug from 'debug';
const logger = Debug('acp:service:pool');

export class RequestPool {
    static pool: Set<string> = new Set();

    static has(key: string) {
        return RequestPool.pool.has(key);
    }
    static add(key: string) {
        RequestPool.pool.add(key);
        return RequestPool;
    }

    static wait(key: string) {
        logger(`wating for ${key}`);
        return new Promise((resolve) => {
            function handler(channel: string, data: any) {
                if (channel !== key) return;
                resolve(JSON.parse(data));
                logger(`respond for ${key}`);
                RedisSub.off(key, handler);
            }
            RedisSub.on('message', handler);
        });
    }

    static async putAndPublish(key: string, data: any, expires: number) {
        logger(`putting and publishing for ${key}`);
        RedisSub.subscribe(key);
        await Cache.put(key, data, expires);
        RedisPub.publish(key, JSON.stringify(data));
        RequestPool.pool.delete(key);
        return data;
    }

}