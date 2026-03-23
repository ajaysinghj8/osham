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
restrictedRest:
  expose: '/restricted/*'
  target: 'http://localhost:${stubPort}'
  changeOrigin: true
  cache:
    expires: 10s
  allow:
    - '/employees/**'
    - '/employee/*'
  deny:
    - '/employees/private/**'
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

describe('Allow/Deny URL Patterns', function () {
  this.timeout(5000);

  it('Should allow a path matching an allow pattern', async function () {
    const res = await client.get('/restricted/employees/123');
    assert.strictEqual(res.headers['x-osham-cache'], undefined, 'should not be denied');
    assert.notStrictEqual(res.status, 403, 'status should not be 403');
  });

  it('Should allow a path matching another allow pattern', async function () {
    const res = await client.get('/restricted/employee/5');
    assert.strictEqual(res.headers['x-osham-cache'], undefined, 'should not be denied');
    assert.notStrictEqual(res.status, 403, 'status should not be 403');
  });

  it('Should deny a path not matching any allow pattern', async function () {
    const res = await client.get('/restricted/departments/1');
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.headers['x-osham-cache'], 'denied');
  });

  it('Should deny a path matching a deny pattern even if it also matches allow', async function () {
    // /employees/private/secret matches allow (/employees/**) but deny wins
    const res = await client.get('/restricted/employees/private/secret');
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.headers['x-osham-cache'], 'denied');
  });

  it('Should deny a path matching deny but not in allow', async function () {
    const res = await client.get('/restricted/employees/private/other');
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.headers['x-osham-cache'], 'denied');
  });

  // Trailing-slash edge cases
  it('Should allow a path with a trailing slash that matches /employees/**', async function () {
    // /restricted/employees/ → pathToCall=employees/ → normalised to /employees → matches /employees/**
    const res = await client.get('/restricted/employees/');
    assert.notStrictEqual(res.status, 403, 'trailing-slash path should be allowed, not 403');
  });

  it('Should deny a path with a trailing slash that would only match deny pattern', async function () {
    // /restricted/employees/private/ → normalised → /employees/private → deny /employees/private/**
    const res = await client.get('/restricted/employees/private/');
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.headers['x-osham-cache'], 'denied');
  });

  // Single-star depth enforcement: /employee/* must NOT match paths with more than one segment.
  it('Should deny a deep path that only single-star allow pattern exists for', async function () {
    // /restricted/employee/5/sub → pathToCall=employee/5/sub → /employee/5/sub
    // Does not match /employees/** (different prefix) and does not match /employee/* (too deep)
    const res = await client.get('/restricted/employee/5/sub');
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.headers['x-osham-cache'], 'denied');
  });

  // Nested precedence: deny deeper path wins even if parent allow matches.
  it('Should deny a nested deny path even when a parent glob allow matches', async function () {
    // /employees/** allow matches /employees/admin/data, but /employees/private/** deny also matches
    const res = await client.get('/restricted/employees/private/admin/data');
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.headers['x-osham-cache'], 'denied');
  });
});

describe('Startup Validation', function () {
  this.timeout(5000);

  function loadServerModuleWithEnv(env) {
    const serverModulePath = require.resolve('../lib/server');
    const previousEnv = {
      SECURE: process.env.SECURE,
      SSL_KEY: process.env.SSL_KEY,
      SSL_CERT: process.env.SSL_CERT,
      PORT: process.env.PORT,
    };

    delete require.cache[serverModulePath];
    Object.assign(process.env, env);

    try {
      return require('../lib/server');
    } finally {
      delete require.cache[serverModulePath];
      for (const [key, value] of Object.entries(previousEnv)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    }
  }

  it('Should throw when SECURE=true and SSL_KEY is missing', function () {
    assert.throws(
      () => loadServerModuleWithEnv({ SECURE: 'true', SSL_KEY: '', SSL_CERT: '/tmp/cert.pem', PORT: '0' }),
      /SECURE=true requires SSL_KEY env var/,
    );
  });

  it('Should throw when SECURE=true and SSL_CERT is missing', function () {
    assert.throws(
      () => loadServerModuleWithEnv({ SECURE: 'true', SSL_KEY: '/tmp/key.pem', SSL_CERT: '', PORT: '0' }),
      /SECURE=true requires SSL_CERT env var/,
    );
  });

  it('Should throw when SECURE=true and SSL key file does not exist', function () {
    assert.throws(
      () =>
        loadServerModuleWithEnv({
          SECURE: 'true',
          SSL_KEY: '/tmp/does-not-exist-key.pem',
          SSL_CERT: '/tmp/also-missing-cert.pem',
          PORT: '0',
        }),
      /could not find SSL key file/,
    );
  });
});

describe('Config Validation', function () {
  this.timeout(5000);

  let validationTempDir;

  before(function () {
    validationTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'osham-validation-'));
  });

  after(function () {
    try {
      if (originalCwd) process.chdir(originalCwd);
    } catch (e) {
      // ignore
    }
  });

  function withConfig(yaml, fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'osham-cfg-'));
    fs.writeFileSync(path.join(dir, 'cache-config.yml'), yaml);
    const prev = process.cwd();
    process.chdir(dir);
    try {
      return fn();
    } finally {
      process.chdir(prev);
    }
  }

  it('Should throw when cache-config.yml is missing', function () {
    process.chdir(validationTempDir);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getCacheConfig } = require('../lib/config.reader');
    assert.throws(() => getCacheConfig(), /cache-config\.yml not found/);
  });

  it('Should throw when version field is missing', function () {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getCacheConfig } = require('../lib/config.reader');
    withConfig(`myNs:\n  expose: '/api/*'\n  target: 'http://localhost:3000'\n`, () =>
      assert.throws(() => getCacheConfig(), /missing required field "version"/),
    );
  });

  it('Should throw when no namespace is defined', function () {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getCacheConfig } = require('../lib/config.reader');
    withConfig(`version: '1'\n`, () => assert.throws(() => getCacheConfig(), /at least one proxy namespace/));
  });

  it('Should throw when namespace is missing expose', function () {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getCacheConfig } = require('../lib/config.reader');
    withConfig(`version: '1'\nmyNs:\n  target: 'http://localhost:3000'\n`, () =>
      assert.throws(() => getCacheConfig(), /missing required string field "expose"/),
    );
  });

  it('Should throw when namespace is missing target', function () {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getCacheConfig } = require('../lib/config.reader');
    withConfig(`version: '1'\nmyNs:\n  expose: '/api/*'\n`, () =>
      assert.throws(() => getCacheConfig(), /missing required string field "target"/),
    );
  });

  it('Should accept a valid minimal config', function () {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getCacheConfig } = require('../lib/config.reader');
    withConfig(`version: '1'\nmyNs:\n  expose: '/api/*'\n  target: 'http://localhost:3000'\n`, () =>
      assert.doesNotThrow(() => getCacheConfig()),
    );
  });

  it('Should return structured IFullConfig with globalConfig and namespaces', function () {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getCacheConfig } = require('../lib/config.reader');
    withConfig(
      `version: '1'\nxResponseTime: true\nhealth: true\npurge: true\nmyNs:\n  expose: '/api/*'\n  target: 'http://localhost:3000'\n`,
      () => {
        const cfg = getCacheConfig();
        assert.ok(cfg.globalConfig, 'should have globalConfig');
        assert.ok(cfg.namespaces, 'should have namespaces');
        assert.strictEqual(cfg.globalConfig.version, '1');
        assert.strictEqual(cfg.globalConfig.xResponseTime, true);
        assert.strictEqual(cfg.globalConfig.health, true);
        assert.strictEqual(cfg.globalConfig.purge, true);
        assert.strictEqual(cfg.globalConfig.metrics, false);
        assert.ok(cfg.namespaces.myNs, 'should have myNs namespace');
        assert.strictEqual(cfg.namespaces.myNs.expose, '/api/*');
        assert.strictEqual(cfg.namespaces.myNs.target, 'http://localhost:3000');
      },
    );
  });

  it('Should throw when global boolean flag is not a boolean', function () {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getCacheConfig } = require('../lib/config.reader');
    withConfig(`version: '1'\nhealth: yes_please\nmyNs:\n  expose: '/api/*'\n  target: 'http://localhost:3000'\n`, () =>
      assert.throws(() => getCacheConfig(), /"health" must be a boolean/),
    );
  });

  it('Should throw when namespace port is not a number', function () {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getCacheConfig } = require('../lib/config.reader');
    withConfig(
      `version: '1'\nmyNs:\n  expose: '/api/*'\n  target: 'http://localhost:3000'\n  port: "not-a-number"\n`,
      () => assert.throws(() => getCacheConfig(), /"port" must be a number/),
    );
  });

  it('Should throw when namespace timeout is not a number', function () {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getCacheConfig } = require('../lib/config.reader');
    withConfig(`version: '1'\nmyNs:\n  expose: '/api/*'\n  target: 'http://localhost:3000'\n  timeout: "fast"\n`, () =>
      assert.throws(() => getCacheConfig(), /"timeout" must be a number/),
    );
  });

  it('Should throw when namespace cache is not an object or false', function () {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getCacheConfig } = require('../lib/config.reader');
    withConfig(`version: '1'\nmyNs:\n  expose: '/api/*'\n  target: 'http://localhost:3000'\n  cache: "invalid"\n`, () =>
      assert.throws(() => getCacheConfig(), /"cache" must be an object, false, or omitted/),
    );
  });

  it('Should throw when cache.query is not false or array of strings', function () {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getCacheConfig } = require('../lib/config.reader');
    withConfig(
      `version: '1'\nmyNs:\n  expose: '/api/*'\n  target: 'http://localhost:3000'\n  cache:\n    query: "all"\n`,
      () => assert.throws(() => getCacheConfig(), /"cache.query" must be false or an array of strings/),
    );
  });

  it('Should throw when cache.headers is not false or array of strings', function () {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getCacheConfig } = require('../lib/config.reader');
    withConfig(
      `version: '1'\nmyNs:\n  expose: '/api/*'\n  target: 'http://localhost:3000'\n  cache:\n    headers: 123\n`,
      () => assert.throws(() => getCacheConfig(), /"cache.headers" must be false or an array of strings/),
    );
  });

  it('Should throw when rules entry is not an object', function () {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getCacheConfig } = require('../lib/config.reader');
    withConfig(
      `version: '1'\nmyNs:\n  expose: '/api/*'\n  target: 'http://localhost:3000'\n  rules:\n    /foo/: "invalid"\n`,
      () => assert.throws(() => getCacheConfig(), /must be an object with a "cache" field/),
    );
  });

  it('Should accept cache: false on a namespace', function () {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getCacheConfig } = require('../lib/config.reader');
    withConfig(`version: '1'\nmyNs:\n  expose: '/api/*'\n  target: 'http://localhost:3000'\n  cache: false\n`, () => {
      const cfg = getCacheConfig();
      assert.strictEqual(cfg.namespaces.myNs.cache, false);
    });
  });

  it('Should accept cache: false on a rule', function () {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getCacheConfig } = require('../lib/config.reader');
    withConfig(
      `version: '1'\nmyNs:\n  expose: '/api/*'\n  target: 'http://localhost:3000'\n  rules:\n    /foo/:\n      cache: false\n`,
      () => assert.doesNotThrow(() => getCacheConfig()),
    );
  });

  it('Should throw when allow is not an array of strings', function () {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getCacheConfig } = require('../lib/config.reader');
    withConfig(
      `version: '1'\nmyNs:\n  expose: '/api/*'\n  target: 'http://localhost:3000'\n  allow: "not-an-array"\n`,
      () => assert.throws(() => getCacheConfig(), /"allow" must be an array of glob pattern strings/),
    );
  });

  it('Should throw when deny is not an array of strings', function () {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getCacheConfig } = require('../lib/config.reader');
    withConfig(`version: '1'\nmyNs:\n  expose: '/api/*'\n  target: 'http://localhost:3000'\n  deny:\n    - 123\n`, () =>
      assert.throws(() => getCacheConfig(), /"deny" must be an array of glob pattern strings/),
    );
  });

  it('Should accept valid allow and deny arrays', function () {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getCacheConfig } = require('../lib/config.reader');
    withConfig(
      `version: '1'\nmyNs:\n  expose: '/api/*'\n  target: 'http://localhost:3000'\n  allow:\n    - '/employees/**'\n  deny:\n    - '/employees/private/**'\n`,
      () => {
        const cfg = getCacheConfig();
        assert.deepStrictEqual(cfg.namespaces.myNs.allow, ['/employees/**']);
        assert.deepStrictEqual(cfg.namespaces.myNs.deny, ['/employees/private/**']);
      },
    );
  });

  it('Should warn on unknown keys in a namespace', function () {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { validateConfig } = require('../lib/config.reader');
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
      validateConfig({
        version: '1',
        myNs: { expose: '/api/*', target: 'http://localhost:3000', unknownField: 'oops', anotherBad: 42 },
      });
    } finally {
      console.warn = originalWarn;
    }
    assert.ok(
      warnings.some(w => w.includes('unknown key') && w.includes('"unknownField"')),
      'should warn about unknownField',
    );
    assert.ok(
      warnings.some(w => w.includes('unknown key') && w.includes('"anotherBad"')),
      'should warn about anotherBad',
    );
  });

  it('Should warn on unknown top-level scalar keys (likely typos of global flags)', function () {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { validateConfig } = require('../lib/config.reader');
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
      validateConfig({
        version: '1',
        purges: true, // typo of 'purge'
        healthCheck: false, // typo of 'health'
        myNs: { expose: '/api/*', target: 'http://localhost:3000' },
      });
    } finally {
      console.warn = originalWarn;
    }
    assert.ok(
      warnings.some(w => w.includes('unknown top-level key') && w.includes('"purges"')),
      'should warn about unknown top-level scalar key "purges"',
    );
    assert.ok(
      warnings.some(w => w.includes('unknown top-level key') && w.includes('"healthCheck"')),
      'should warn about unknown top-level scalar key "healthCheck"',
    );
  });

  it('Should not warn on known top-level keys or namespace objects', function () {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { validateConfig } = require('../lib/config.reader');
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
      validateConfig({
        version: '1',
        xResponseTime: true,
        health: true,
        purge: true,
        metrics: true,
        changeOrigin: false,
        myNs: { expose: '/api/*', target: 'http://localhost:3000' },
      });
    } finally {
      console.warn = originalWarn;
    }
    const topLevelWarnings = warnings.filter(w => w.includes('unknown top-level key'));
    assert.strictEqual(topLevelWarnings.length, 0, 'should have no top-level unknown key warnings for known keys');
  });

  it('Should not warn on known namespace keys', function () {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { validateConfig } = require('../lib/config.reader');
    const warnings = [];
    const originalWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));
    try {
      validateConfig({
        version: '1',
        myNs: {
          expose: '/api/*',
          target: 'http://localhost:3000',
          cache: { expires: '10s' },
          allow: ['/foo/**'],
          deny: ['/foo/private/**'],
        },
      });
    } finally {
      console.warn = originalWarn;
    }
    assert.strictEqual(warnings.length, 0, 'should have no warnings for known keys');
  });
});

describe('Purge Safety', function () {
  this.timeout(5000);

  it('Should include a warning when purging with a broad pattern (no namespace prefix)', async function () {
    const res = await client.post('/__osham/purge?pattern=*').expect(200);
    const body = JSON.parse(res.text);
    assert.ok(body.warning, 'should return a warning for a broad pattern');
    assert.ok(body.warning.includes('O:<namespace>'), 'warning should mention O:<namespace> prefix');
  });

  it('Should include a warning when purging with a bare ** pattern', async function () {
    const res = await client.post('/__osham/purge?pattern=**').expect(200);
    const body = JSON.parse(res.text);
    assert.ok(body.warning, 'should return a warning for ** pattern');
  });

  it('Should NOT include a warning when purging with a namespaced pattern', async function () {
    const res = await client.post('/__osham/purge?pattern=O:dummyRest:/api/v1/*').expect(200);
    const body = JSON.parse(res.text);
    assert.ok(!body.warning, 'should not warn for a properly prefixed pattern');
  });

  it('Should return 401 when OSHAM_PURGE_SECRET is set but header is missing', async function () {
    process.env.OSHAM_PURGE_SECRET = 'test-secret-abc';
    try {
      const res = await client.post('/__osham/purge?pattern=O:dummyRest:*');
      assert.strictEqual(res.status, 401);
      const body = JSON.parse(res.text);
      assert.ok(body.error.includes('Unauthorized'), 'should return unauthorized error');
    } finally {
      delete process.env.OSHAM_PURGE_SECRET;
    }
  });

  it('Should allow purge when OSHAM_PURGE_SECRET matches the header', async function () {
    process.env.OSHAM_PURGE_SECRET = 'test-secret-abc';
    try {
      const res = await client
        .post('/__osham/purge?pattern=O:dummyRest:/api/v1/*')
        .set('x-osham-purge-secret', 'test-secret-abc')
        .expect(200);
      const body = JSON.parse(res.text);
      assert.strictEqual(typeof body.deleted, 'number', 'should return deleted count');
    } finally {
      delete process.env.OSHAM_PURGE_SECRET;
    }
  });
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
      res3.headers['x-osham-hit'] === 'false' || res3.headers['x-osham-key'] !== res1.headers['x-osham-key'],
      'cache should have been purged or returned new key',
    );

    const res4 = await client.get('/api/v1/employees').query({ limit: 22 });
    assert(
      res4.headers['x-osham-hit'] === 'false' || res4.headers['x-osham-key'] !== res2.headers['x-osham-key'],
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

// ---------------------------------------------------------------------------
// Admin API — auth
// ---------------------------------------------------------------------------
describe('Admin API – Auth', function () {
  this.timeout(5000);

  let prevSecret;
  let prevInsecure;

  before(function () {
    prevSecret = process.env.OSHAM_ADMIN_SECRET;
    prevInsecure = process.env.OSHAM_ADMIN_ALLOW_INSECURE_LOCAL;
    delete process.env.OSHAM_ADMIN_SECRET;
    delete process.env.OSHAM_ADMIN_ALLOW_INSECURE_LOCAL;
  });

  after(function () {
    if (prevSecret === undefined) {
      delete process.env.OSHAM_ADMIN_SECRET;
    } else {
      process.env.OSHAM_ADMIN_SECRET = prevSecret;
    }
    if (prevInsecure === undefined) {
      delete process.env.OSHAM_ADMIN_ALLOW_INSECURE_LOCAL;
    } else {
      process.env.OSHAM_ADMIN_ALLOW_INSECURE_LOCAL = prevInsecure;
    }
  });

  it('Should return 401 when no OSHAM_ADMIN_SECRET and OSHAM_ADMIN_ALLOW_INSECURE_LOCAL is not set', async function () {
    const res = await client.get('/__osham/admin/config');
    assert.strictEqual(res.status, 401);
    const body = JSON.parse(res.text);
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.error.code, 'UNAUTHORIZED');
  });

  it('Should return 401 when OSHAM_ADMIN_SECRET is set but header is missing', async function () {
    process.env.OSHAM_ADMIN_SECRET = 'test-admin-secret';
    const res = await client.get('/__osham/admin/config');
    assert.strictEqual(res.status, 401);
    const body = JSON.parse(res.text);
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.error.code, 'UNAUTHORIZED');
  });

  it('Should return 401 when OSHAM_ADMIN_SECRET is set but header value is wrong', async function () {
    process.env.OSHAM_ADMIN_SECRET = 'test-admin-secret';
    const res = await client.get('/__osham/admin/config').set('x-osham-admin-secret', 'wrong-value');
    assert.strictEqual(res.status, 401);
    const body = JSON.parse(res.text);
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.error.code, 'UNAUTHORIZED');
  });

  it('Should allow local insecure admin access only when explicitly enabled', async function () {
    delete process.env.OSHAM_ADMIN_SECRET;
    process.env.OSHAM_ADMIN_ALLOW_INSECURE_LOCAL = 'true';
    const res = await client.get('/__osham/admin/config');
    assert.strictEqual(res.status, 200);
    const body = JSON.parse(res.text);
    assert.strictEqual(body.ok, true);
  });

  it('Should still require the admin secret when both secret and insecure-local are set', async function () {
    process.env.OSHAM_ADMIN_SECRET = 'test-admin-secret';
    process.env.OSHAM_ADMIN_ALLOW_INSECURE_LOCAL = 'true';
    const res = await client.get('/__osham/admin/config');
    assert.strictEqual(res.status, 401);
    const body = JSON.parse(res.text);
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.error.code, 'UNAUTHORIZED');
  });
});

// ---------------------------------------------------------------------------
// Admin API — config endpoints (authorized)
// ---------------------------------------------------------------------------
describe('Admin API – Config Endpoints', function () {
  this.timeout(5000);

  const ADMIN_SECRET = 'test-admin-secret';

  let prevSecret;
  let prevInsecure;

  before(function () {
    prevSecret = process.env.OSHAM_ADMIN_SECRET;
    prevInsecure = process.env.OSHAM_ADMIN_ALLOW_INSECURE_LOCAL;
    process.env.OSHAM_ADMIN_SECRET = ADMIN_SECRET;
    delete process.env.OSHAM_ADMIN_ALLOW_INSECURE_LOCAL;
  });

  after(function () {
    if (prevSecret === undefined) {
      delete process.env.OSHAM_ADMIN_SECRET;
    } else {
      process.env.OSHAM_ADMIN_SECRET = prevSecret;
    }
    if (prevInsecure === undefined) {
      delete process.env.OSHAM_ADMIN_ALLOW_INSECURE_LOCAL;
    } else {
      process.env.OSHAM_ADMIN_ALLOW_INSECURE_LOCAL = prevInsecure;
    }
  });

  it('GET /__osham/admin/config should return structured config', async function () {
    const res = await client.get('/__osham/admin/config').set('x-osham-admin-secret', ADMIN_SECRET);
    assert.strictEqual(res.status, 200);
    const body = JSON.parse(res.text);
    assert.strictEqual(body.ok, true);
    assert.ok(body.data, 'data should be present');
    assert.ok(body.data.globalConfig, 'globalConfig should be present');
    assert.ok(body.data.namespaces, 'namespaces should be present');
    assert.ok(body.data.meta, 'meta should be present');
    assert.ok(body.data.meta.revision, 'revision should be present');
    assert.ok(body.data.meta.lastLoadedAt, 'lastLoadedAt should be present');
    assert.ok(body.data.meta.source, 'source should be present');
    assert.strictEqual(typeof body.data.globalConfig.version, 'string');
  });

  it('GET /__osham/admin/config should include secure block in globalConfig', async function () {
    const res = await client.get('/__osham/admin/config').set('x-osham-admin-secret', ADMIN_SECRET);
    const body = JSON.parse(res.text);
    assert.ok(body.data.globalConfig.secure, 'secure block should be present');
    assert.strictEqual(typeof body.data.globalConfig.secure.enabled, 'boolean');
  });

  it('POST /__osham/admin/config/validate with valid config should return valid:true', async function () {
    const payload = {
      config: {
        globalConfig: { version: '1', health: true },
        namespaces: {
          api: { expose: '/api/*', target: 'http://localhost:9999' },
        },
      },
    };
    const res = await client
      .post('/__osham/admin/config/validate')
      .set('x-osham-admin-secret', ADMIN_SECRET)
      .set('content-type', 'application/json')
      .send(JSON.stringify(payload));
    assert.strictEqual(res.status, 200);
    const body = JSON.parse(res.text);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.data.valid, true);
    assert.ok(Array.isArray(body.data.errors), 'errors should be an array');
    assert.ok(Array.isArray(body.data.warnings), 'warnings should be an array');
    assert.strictEqual(body.data.errors.length, 0);
  });

  it('POST /__osham/admin/config/validate with missing version should return valid:false', async function () {
    const payload = {
      config: {
        globalConfig: {},
        namespaces: {
          api: { expose: '/api/*', target: 'http://localhost:9999' },
        },
      },
    };
    const res = await client
      .post('/__osham/admin/config/validate')
      .set('x-osham-admin-secret', ADMIN_SECRET)
      .set('content-type', 'application/json')
      .send(JSON.stringify(payload));
    assert.strictEqual(res.status, 200);
    const body = JSON.parse(res.text);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.data.valid, false);
    assert.ok(body.data.errors.length > 0, 'should have at least one error');
  });

  it('POST /__osham/admin/config/validate with missing namespace expose should return valid:false', async function () {
    const payload = {
      config: {
        globalConfig: { version: '1' },
        namespaces: {
          api: { target: 'http://localhost:9999' },
        },
      },
    };
    const res = await client
      .post('/__osham/admin/config/validate')
      .set('x-osham-admin-secret', ADMIN_SECRET)
      .set('content-type', 'application/json')
      .send(JSON.stringify(payload));
    assert.strictEqual(res.status, 200);
    const body = JSON.parse(res.text);
    assert.strictEqual(body.data.valid, false);
    assert.ok(body.data.errors[0].message.includes('expose'), 'error should mention expose field');
  });

  it('PUT /__osham/admin/config with valid config should save and return revision', async function () {
    const payload = {
      config: {
        globalConfig: { version: '1', health: true, metrics: true, purge: true },
        namespaces: {
          dummyRest: {
            expose: '/api/v1/*',
            target: `http://localhost:${stubServer.address().port}`,
            cache: { expires: '10s' },
          },
        },
      },
    };
    const res = await client
      .put('/__osham/admin/config')
      .set('x-osham-admin-secret', ADMIN_SECRET)
      .set('content-type', 'application/json')
      .send(JSON.stringify(payload));
    assert.strictEqual(res.status, 200);
    const body = JSON.parse(res.text);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.data.saved, true);
    assert.ok(body.data.revision, 'revision should be returned');
    assert.ok(Array.isArray(body.data.warnings));
  });

  it('PUT /__osham/admin/config with invalid config should return 400 with validation errors', async function () {
    const payload = {
      config: {
        globalConfig: {},
        namespaces: {},
      },
    };
    const res = await client
      .put('/__osham/admin/config')
      .set('x-osham-admin-secret', ADMIN_SECRET)
      .set('content-type', 'application/json')
      .send(JSON.stringify(payload));
    assert.strictEqual(res.status, 400);
    const body = JSON.parse(res.text);
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.error.code, 'VALIDATION_FAILED');
    assert.ok(body.details.errors.length > 0, 'should have validation errors');
  });

  it('PUT /__osham/admin/config should reject stale expectedRevision values', async function () {
    const payload = {
      config: {
        globalConfig: { version: '1', health: true, metrics: true, purge: true },
        namespaces: {
          dummyRest: {
            expose: '/api/v1/*',
            target: `http://localhost:${stubServer.address().port}`,
            cache: { expires: '10s' },
          },
        },
      },
      expectedRevision: 'stale-revision',
    };

    const res = await client
      .put('/__osham/admin/config')
      .set('x-osham-admin-secret', ADMIN_SECRET)
      .set('content-type', 'application/json')
      .send(JSON.stringify(payload));

    assert.strictEqual(res.status, 409);
    const body = JSON.parse(res.text);
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.error.code, 'REVISION_CONFLICT');
  });

  it('POST /__osham/admin/config/reload should return applied:true with summary', async function () {
    const res = await client.post('/__osham/admin/config/reload').set('x-osham-admin-secret', ADMIN_SECRET);
    assert.strictEqual(res.status, 200);
    const body = JSON.parse(res.text);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.data.applied, true);
    assert.ok(body.data.revision, 'revision should be returned');
    assert.ok(body.data.summary, 'summary should be present');
    assert.strictEqual(typeof body.data.summary.namespaceCount, 'number');
    assert.ok(body.data.summary.features, 'features should be in summary');
    assert.match(body.data.note, /applied to the running/i);
  });

  it('POST /__osham/admin/config/reload should reject stale expectedRevision values', async function () {
    const res = await client
      .post('/__osham/admin/config/reload')
      .set('x-osham-admin-secret', ADMIN_SECRET)
      .set('content-type', 'application/json')
      .send(JSON.stringify({ expectedRevision: 'stale-revision' }));

    assert.strictEqual(res.status, 409);
    const body = JSON.parse(res.text);
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.error.code, 'REVISION_CONFLICT');
  });

  it('POST /__osham/admin/config/reload should apply newly added namespaces without a restart', async function () {
    const currentConfigRes = await client.get('/__osham/admin/config').set('x-osham-admin-secret', ADMIN_SECRET);
    assert.strictEqual(currentConfigRes.status, 200);
    const currentConfigBody = JSON.parse(currentConfigRes.text);
    const currentConfig = currentConfigBody.data;

    const nextConfig = {
      globalConfig: {
        version: currentConfig.globalConfig.version,
        health: currentConfig.globalConfig.health,
        metrics: currentConfig.globalConfig.metrics,
        purge: currentConfig.globalConfig.purge,
        xResponseTime: currentConfig.globalConfig.xResponseTime,
        changeOrigin: currentConfig.globalConfig.changeOrigin,
      },
      namespaces: {
        ...currentConfig.namespaces,
        liveReloaded: {
          expose: '/live/*',
          target: currentConfig.namespaces.dummyRest.target,
          changeOrigin: true,
          cache: {
            expires: '5s',
          },
        },
      },
    };

    const saveRes = await client
      .put('/__osham/admin/config')
      .set('x-osham-admin-secret', ADMIN_SECRET)
      .set('content-type', 'application/json')
      .send(
        JSON.stringify({
          config: nextConfig,
          expectedRevision: currentConfig.meta.revision,
        }),
      );
    assert.strictEqual(saveRes.status, 200);

    await client.get('/live/employees').expect(404);

    const reloadRes = await client.post('/__osham/admin/config/reload').set('x-osham-admin-secret', ADMIN_SECRET);
    assert.strictEqual(reloadRes.status, 200);

    const liveRes = await client.get('/live/employees').expect(200);
    assert.strictEqual(liveRes.body.status, 'success');
    assert.strictEqual(liveRes.headers['x-osham-hit'], 'false');
  });

  it('GET /__osham/admin/health should return operational health summary', async function () {
    const res = await client.get('/__osham/admin/health').set('x-osham-admin-secret', ADMIN_SECRET);
    assert.strictEqual(res.status, 200);
    const body = JSON.parse(res.text);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.data.status, 'ok');
    assert.strictEqual(typeof body.data.uptimeSeconds, 'number');
    assert.strictEqual(body.data.config.loaded, true);
    assert.ok(body.data.config.revision);
  });

  it('GET /__osham/admin/startup-summary should return config-derived startup summary', async function () {
    const res = await client.get('/__osham/admin/startup-summary').set('x-osham-admin-secret', ADMIN_SECRET);
    assert.strictEqual(res.status, 200);
    const body = JSON.parse(res.text);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(typeof body.data.namespaceCount, 'number');
    assert.ok(Array.isArray(body.data.namespaces));
    assert.ok(body.data.features);
    assert.strictEqual(typeof body.data.features.metrics, 'boolean');
  });

  it('GET /__osham/admin/metrics/summary should return aggregate metrics', async function () {
    await client.get('/api/v1/employees?limit=501').expect(200);
    await client.get('/api/v1/employees?limit=501').expect(200);
    const res = await client.get('/__osham/admin/metrics/summary').set('x-osham-admin-secret', ADMIN_SECRET);
    assert.strictEqual(res.status, 200);
    const body = JSON.parse(res.text);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(typeof body.data.requests, 'number');
    assert.strictEqual(typeof body.data.cacheHits, 'number');
    assert.strictEqual(typeof body.data.cacheMisses, 'number');
    assert.strictEqual(typeof body.data.hitRatio, 'number');
  });

  it('GET /__osham/admin/metrics/namespaces should return per-namespace metrics', async function () {
    await client.get('/api/v1/employees?limit=777').expect(200);
    const res = await client.get('/__osham/admin/metrics/namespaces').set('x-osham-admin-secret', ADMIN_SECRET);
    assert.strictEqual(res.status, 200);
    const body = JSON.parse(res.text);
    assert.strictEqual(body.ok, true);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.length >= 1, 'should contain configured namespaces');
    const dummyRest = body.data.find(row => row.namespace === 'dummyRest');
    assert.ok(dummyRest, 'dummyRest metrics should be present');
    assert.strictEqual(typeof dummyRest.requests, 'number');
    assert.strictEqual(typeof dummyRest.latency.p50, 'number');
    assert.strictEqual(typeof dummyRest.latency.p95, 'number');
  });

  it('POST /__osham/admin/purge should return warnings for broad patterns', async function () {
    const res = await client
      .post('/__osham/admin/purge')
      .set('x-osham-admin-secret', ADMIN_SECRET)
      .send({ pattern: '**' });
    assert.strictEqual(res.status, 200);
    const body = JSON.parse(res.text);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.data.purged, true);
    assert.ok(Array.isArray(body.data.warnings));
    assert.ok(body.data.warnings.length > 0);
  });

  it('POST /__osham/admin/purge should support dryRun', async function () {
    const res = await client
      .post('/__osham/admin/purge')
      .set('x-osham-admin-secret', ADMIN_SECRET)
      .send({ pattern: 'O:dummyRest:/employees*', dryRun: true });
    assert.strictEqual(res.status, 200);
    const body = JSON.parse(res.text);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.data.purged, false);
    assert.strictEqual(body.data.dryRun, true);
    assert.strictEqual(body.data.deleted, 0);
  });

  it('GET /__osham/admin/audit should return recent admin events', async function () {
    await client
      .post('/__osham/admin/purge')
      .set('x-osham-admin-secret', ADMIN_SECRET)
      .send({ pattern: '**', dryRun: true })
      .expect(200);

    const res = await client.get('/__osham/admin/audit').set('x-osham-admin-secret', ADMIN_SECRET);
    assert.strictEqual(res.status, 200);
    const body = JSON.parse(res.text);
    assert.strictEqual(body.ok, true);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.data.some(event => event.action === 'admin.purge'));
  });

  it('Unknown admin route should return 404 with ok:false', async function () {
    const res = await client.get('/__osham/admin/unknown-route').set('x-osham-admin-secret', ADMIN_SECRET);
    assert.strictEqual(res.status, 404);
    const body = JSON.parse(res.text);
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.error.code, 'NOT_FOUND');
  });
});
