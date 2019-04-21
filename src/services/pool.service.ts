import { Cache } from "./cache.service";
import * as Debug from 'debug';
import { EventEmitter } from "events";
const logger = Debug('acp:service:pool');

function nextTick() {
    return new Promise((resolve) => {
        process.nextTick(resolve);
    });
}

export class RequestPool {
    static pool: Set<string> = new Set();
    static ee: EventEmitter = (new EventEmitter()).setMaxListeners(Infinity);

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
            function handler(data: any) {
                resolve(data);
                logger(`respond for ${key}`);
            }
            RequestPool.ee.once(key, handler);
        });
    }

    static async putAndPublish(key: string, data: any, expires: number) {
        logger(`putting and publishing for ${key}`);
        RequestPool.ee.emit(key, data);
        await Cache.put(key, data, expires);
        RequestPool.pool.delete(key);
        return data;
    }

    static async errorAndPublish(key: string, data: any) {
        logger(`error and publishing for ${key}`);
        RequestPool.ee.emit(key, data);
        RequestPool.pool.delete(key);
    }

}