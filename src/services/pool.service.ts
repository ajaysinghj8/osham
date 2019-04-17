import { RedisSub, RedisPub } from "../storage/redis.store";
import { Cache } from "./cache.service";

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
        return new Promise((resolve) => {
            function handler(channel: string, data: any) {
                if (channel !== key) return;
                resolve(JSON.parse(data));
                RedisSub.off(key, handler);
            }
            RedisSub.on('message', handler);
        });
    }

    static async putAndPublish(key: string, data: any, expires: number) {
        RedisSub.subscribe(key);
        await Cache.put(key, data, expires);
        RedisPub.publish(key, JSON.stringify(data));
        RequestPool.pool.delete(key);
        return data;
    }

}