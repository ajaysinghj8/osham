import * as Debug from 'debug';
import { existsSync, readFileSync } from 'fs';
import { Server as HttpServer, createServer } from 'http';
import { Server as HttpsServer, ServerOptions, createServer as createSecureServer } from 'https';

const logger = Debug('acp:server');

export function getSecureServerOptions(): ServerOptions {
  if (!process.env.SSL_KEY) {
    throw new Error('SECURE=true requires SSL_KEY env var to be set to a PEM key file path');
  }
  if (!process.env.SSL_CERT) {
    throw new Error('SECURE=true requires SSL_CERT env var to be set to a PEM certificate file path');
  }
  if (!existsSync(process.env.SSL_KEY)) {
    throw new Error(`SECURE=true could not find SSL key file at "${process.env.SSL_KEY}"`);
  }
  if (!existsSync(process.env.SSL_CERT)) {
    throw new Error(`SECURE=true could not find SSL certificate file at "${process.env.SSL_CERT}"`);
  }

  return {
    key: readFileSync(process.env.SSL_KEY),
    cert: readFileSync(process.env.SSL_CERT),
  };
}

export function createAServer(): HttpServer | HttpsServer {
  if (process.env.SECURE === 'true') {
    return createSecureServer(getSecureServerOptions());
  }
  return createServer();
}

export const Server = createAServer();

const port = +process.env.PORT || 26192;

Server.listen(port, () => {
  logger(`listing on ${port}`);
});
