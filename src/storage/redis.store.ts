import { createClient, RedisClient } from 'redis';
import * as Debug from 'debug';

const logger = Debug('acp:redis');

export const RedisClientProvider = (): RedisClient => {
  const Connection = createClient({
    host: process.env.REDIS_HOST,
    port: +process.env.REDIS_PORT,
  });
  Connection.on('error', e => logger(e));
  return Connection;
};
