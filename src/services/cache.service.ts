import * as Debug from 'debug';
import { Redis } from '../storage/redis.store';



const logger = Debug('api-cache-proxy:service:cache');


export class Cache {

    static isConnected() {
        const status = Redis.connected;
        logger('Redis connection Status', status);
        return status;
    }

    static put(key: string, value: any, exptime?: number) {
        logger('Caching ->', key);
        return new Promise((resolve) => {
            Redis.set(key, JSON.stringify(value), () => {
                if (exptime) Redis.expire(key, exptime);
                logger('Cached ->', key);
                return resolve(value);
            });
        });
    }

    static get(key: string) {
        return new Promise((resolve, reject) => {
            Redis.get(key, (error, buffer) => {
                if (error || !buffer) {
                    logger('failed cache ->', key);
                    return reject(new Error(`Cache not found for key ${key}`));
                }
                logger('From cache ->', key);
                return resolve(JSON.parse(buffer.toString()));
            });
        });
    }

    static purge(key: string) {
        logger('Invalidating cache ->', key);
        return new Promise((resolve) => {
            Redis.del(key, (_, reply) => {
                resolve(reply);
            });
        });
    }
}

