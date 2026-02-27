/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable no-undef */
/* eslint-disable no-console */
const http = require('http');
const net = require('net');
const url = require('url');
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const supertest = require('supertest');

let stubServer;
let oshamServer;
let client;
let employeesUrl;
let originalCwd;
let tempDir;

function getFreePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
    s.on('error', reject);
  });
}

async function waitForHealth(baseUrl) {
  const req = supertest(baseUrl);
  for (let i = 0; i < 60; i++) {
    try {
      const res = await req.get('/health');
      if (res.status === 200) return;
    } catch (e) {
      // ignore until server is up
    }
    await new Promise(r => setTimeout(r, 50));
  }
  throw new Error('Osham server did not become healthy in time');
}

before(async function () {
  this.timeout(15000);

  originalCwd = process.cwd();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'osham-test-'));

  // Start stub backend on an ephemeral port.
  stubServer = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname;

    // Delay employees to reliably exercise request pooling.
    if (req.method === 'GET' && pathname === '/employees') {
      return setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', data: [] }));
      }, 200);
    }

    if (req.method === 'GET' && pathname.startsWith('/employee/')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'success', data: { id: pathname.split('/').pop() } }));
      return;
    }

    if (req.method === 'POST' && pathname === '/employees') {
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'created' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
  });
  await new Promise(resolve => stubServer.listen(0, resolve));
  const stubPort = stubServer.address().port;

  // Write a dedicated config into a temp working directory so tests don't depend on repo `cache-config.yml`.
  const cacheConfig = `version: '1'
xResponseTime: true
health: true
purge: true
metrics: true
dummyRest:
  expose: '/api/v1/*'
  target: 'http://localhost:${stubPort}'
  changeOrigin: true
  cache:
    pool: true
    expires: 10s
    query: false
    headers: false
  rules:
    /employees/:
      cache:
        expires: 1m
        pool: true
        query:
          - limit
          - page
          - alphabet
        headers:
          - x-locale
    /employee/2/:
      cache: false
`;
  fs.writeFileSync(path.join(tempDir, 'cache-config.yml'), cacheConfig);

  // Start Osham server on a free port.
  const oshamPort = await getFreePort();
  process.env.PORT = String(oshamPort);
  process.env.SECURE = 'false';

  process.chdir(tempDir);
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('../lib/index');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  oshamServer = require('../lib/server').Server;

  const baseUrl = `http://localhost:${oshamPort}`;
  client = supertest(baseUrl);
  employeesUrl = `/api/v1/employees?limit=${Date.now()}`;
  await waitForHealth(baseUrl);
});

after(function (done) {
  try {
    if (originalCwd) process.chdir(originalCwd);
  } catch (e) {
    // ignore
  }

  let pending = 0;
  function next() {
    pending -= 1;
    if (pending === 0) done();
  }

  const servers = [
    { s: oshamServer, name: 'osham' },
    { s: stubServer, name: 'stub' },
  ];

  for (const { s } of servers) {
    if (!s || !s.close) continue;
    pending += 1;
    s.close(() => next());
  }

  if (pending === 0) done();
});

describe('Specifications', function () {
  this.timeout(5000);
  it('Multiple requests to same resource should queue', async function () {
    const responses = await Promise.all([
      client.get(employeesUrl),
      ...new Array(25).fill(1).map(() => client.get(employeesUrl)),
    ]);

    // exactly one request should be marked as the main pooled request
    const mainResponses = responses.filter(r => r.headers['x-osham-pooled-main'] === 'true');
    assert.strictEqual(mainResponses.length, 1, 'expected exactly one main pooled response');
    assert.strictEqual(mainResponses[0].headers['x-osham-hit'], 'false');

    // Depending on timing, followers may be pooled (miss) or may arrive after cache is written (hit).
    let pooledCount = 0;
    const followers = responses.filter(r => r.headers['x-osham-pooled-main'] !== 'true');
    for (const r of followers) {
      const isPooled = r.headers['x-osham-pooled'] === 'true';
      const isHit = r.headers['x-osham-hit'] === 'true';
      assert.ok(isPooled || isHit, 'expected follower request to be pooled or a cache hit');
      if (isPooled) {
        pooledCount += 1;
        assert.ok(/[0-9]ms/.test(String(r.headers['x-osham-pooled-wait'])));
      }
    }
    assert.ok(pooledCount > 0, 'expected at least one pooled follower request');
  });

  it('Should be a hit', async function () {
    await client.get(employeesUrl).expect('x-osham-hit', 'true');
  });

  it('Should be a miss', async function () {
    await client.get('/api/v1/employee/1').expect('x-osham-hit', 'false');
  });

  it('Should be no config', async function () {
    await client.get('/api/v1/employee/2').expect('x-osham-cache', 'no-config');
  });

  it('Health endpoint should respond ok', async function () {
    await client.get('/health').expect(200).expect('ok');
  });

  it('Responses should include x-osham-time header', async function () {
    await client.get(employeesUrl).expect('x-osham-time', /[0-9]+ms/);
  });

  it('Non-GET requests should be marked not-allowed', async function () {
    await client.post('/api/v1/employees').send({}).expect('x-osham-cache', 'not-allowed');
  });

  it('Cache key should vary on configured query params', async function () {
    const res1 = await client.get('/api/v1/employees').query({ limit: 10 });
    const res2 = await client.get('/api/v1/employees').query({ limit: 20 });
    assert.notStrictEqual(res1.headers['x-osham-key'], res2.headers['x-osham-key']);
  });

  it('Cache key should not vary on unconfigured query params', async function () {
    const res1 = await client.get('/api/v1/employees').query({ foo: 'bar' });
    const res2 = await client.get('/api/v1/employees').query({ foo: 'baz' });
    assert.strictEqual(res1.headers['x-osham-key'], res2.headers['x-osham-key']);
  });

  it('Cache key should vary on configured headers', async function () {
    const res1 = await client.get('/api/v1/employees').set('x-locale', 'en-US');
    const res2 = await client.get('/api/v1/employees').set('x-locale', 'fr-FR');
    assert.notStrictEqual(res1.headers['x-osham-key'], res2.headers['x-osham-key']);
  });

  it('Should purge cache by cache id', async function () {
    const res = await client.get(employeesUrl).expect('x-osham-hit', 'true');
    const cacheKey = res.headers['x-osham-key'];
    await client.post(`/__osham/purge?key=${encodeURIComponent(cacheKey)}`).expect(200);
    await client.get(employeesUrl).expect('x-osham-hit', 'false');
  });

  it('Should purge cache by wildcard cache id', async function () {
    const res1 = await client.get('/api/v1/employees').query({ limit: 11 }).expect('x-osham-hit', 'false');
    const res2 = await client.get('/api/v1/employees').query({ limit: 22 }).expect('x-osham-hit', 'false');
    
    assert.notStrictEqual(res1.headers['x-osham-key'], res2.headers['x-osham-key']);

    await client.post('/__osham/purge?pattern=O:dummyRest:/api/v1/employees**').expect(200);

    const res3 = await client.get('/api/v1/employees').query({ limit: 11 });
    // if the request was still a hit we must have a new key (old entry deleted)
    assert(
      res3.headers['x-osham-hit'] === 'false' ||
        res3.headers['x-osham-key'] !== res1.headers['x-osham-key'],
      'cache should have been purged or returned new key',
    );

    const res4 = await client.get('/api/v1/employees').query({ limit: 22 });
    assert(
      res4.headers['x-osham-hit'] === 'false' ||
        res4.headers['x-osham-key'] !== res2.headers['x-osham-key'],
      'cache should have been purged or returned new key',
    );
  });

  it('Metrics endpoint should expose Prometheus metrics', async function () {
    const res = await client.get('/__osham/metrics').expect(200);
    assert.strictEqual(res.headers['content-type'], 'text/plain; version=0.0.4');
    assert(res.text.includes('osham_cache_hits_total'), 'metrics should include cache hits counter');
    assert(res.text.includes('osham_cache_misses_total'), 'metrics should include cache misses counter');
    assert(res.text.includes('dummyRest'), 'metrics should include namespace labels');
  });
});
