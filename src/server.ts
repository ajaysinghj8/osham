import * as Debug from 'debug';
import { readFileSync } from 'fs';
import { createServer } from 'http';
import { createServer as createSecureServer } from 'https';

const logger = Debug('acp:server');

function createAServer() {
  if (process.env.SECURE === 'true') {
    const options = {
      key: readFileSync(process.env.SSL_KEY),
      cert: readFileSync(process.env.SSL_CERT),
    };
    return createSecureServer(options);
  }
  return createServer();
}

export const Server = createAServer();

const port = +process.env.PORT || 26192;

Server.listen(port, () => {
  logger(`listing on ${port}`);
});
