# Getting Started with Osham

Osham is a caching reverse proxy. You define upstreams in `cache-config.yml`, Osham intercepts matching requests, caches responses, and forwards misses to the backend.

---

## 1. Installation & Running

```bash
npm install
npm run build
npm start
```

Or in development with live reload:
```bash
npm run dev
```

The server starts on port `26192` by default. Override with `PORT=8080` in `.env`.

---

## 2. Environment Variables (`.env`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `26192` | Port to listen on |
| `REDIS_HOST` | — | Redis hostname (omit to use in-memory cache) |
| `REDIS_PORT` | — | Redis port |
| `SECURE` | `false` | Enable HTTPS on the osham server itself |
| `SSL_KEY` | — | Path to TLS private key (required if `SECURE=true`) |
| `SSL_CERT` | — | Path to TLS certificate (required if `SECURE=true`) |
| `TIMEOUT` | `5000` | Upstream request timeout in ms |
| `OSHAM_ADMIN_SECRET` | — | Secret header for admin API |
| `OSHAM_ADMIN_ALLOW_INSECURE_LOCAL` | `false` | Skip admin auth on localhost (dev only) |
| `OSHAM_PURGE_SECRET` | — | Secret header for purge endpoint |

**Cache backend:** If `REDIS_HOST` and `REDIS_PORT` are both set, Osham uses Redis. Otherwise it falls back to in-memory (data lost on restart — not for production).

```env
# .env
PORT=26192
REDIS_HOST=localhost
REDIS_PORT=6379
TIMEOUT=5000
OSHAM_ADMIN_SECRET=my-secret
```

---

## 3. `cache-config.yml` Structure

```yaml
version: '1'           # required, must be '1'
health: true           # enable GET /__osham/health
purge: true            # enable POST /__osham/purge
metrics: true          # enable GET /__osham/metrics (Prometheus)
xResponseTime: false   # add x-response-time header to all responses
changeOrigin: false    # global default for changeOrigin (see below)

myApi:                 # namespace name (arbitrary key)
  expose: /api/v1/*   # path pattern to intercept
  target: http://localhost:3000/api/v1  # upstream URL
  cache:
    expires: 30s
    pool: true
```

### Global Options

| Option | Type | Default | Description |
|---|---|---|---|
| `version` | string | required | Must be `'1'` |
| `health` | boolean | `false` | Enable `GET /__osham/health` |
| `purge` | boolean | `false` | Enable `POST /__osham/purge` |
| `metrics` | boolean | `false` | Enable `GET /__osham/metrics` |
| `xResponseTime` | boolean | `false` | Add `x-response-time` response header |
| `changeOrigin` | boolean | `false` | Global default for namespace `changeOrigin` |

---

## 4. Namespace Options

Each top-level key (other than the globals above) is a **namespace** — a named proxy route.

### Required

| Option | Description |
|---|---|
| `expose` | Path pattern to intercept (path-to-regexp syntax, e.g. `/api/v1/*`) |
| `target` | Upstream base URL (e.g. `http://localhost:3000`) |

### Optional

| Option | Type | Default | Description |
|---|---|---|---|
| `changeOrigin` | boolean | global | Rewrite `Host` header to the target hostname |
| `followRedirects` | boolean | `false` | Follow 3xx redirects from the upstream |
| `insecureSkipVerify` | boolean | `false` | Ignore TLS certificate errors (HTTPS upstreams only) |
| `timeout` | number | `TIMEOUT` env | Per-namespace request timeout in ms |
| `cache` | object or `false` | — | Cache config (see below) |
| `rules` | object | `{}` | Per-path cache overrides |
| `allow` | string[] | — | Glob patterns to allowlist; unmatched paths get 403 |
| `deny` | string[] | — | Glob patterns to denylist; matched paths get 403 (takes precedence) |

---

## 5. Cache Options

```yaml
cache:
  expires: 10s          # TTL: '10s', '5m', '1h', or number of seconds
  pool: true            # prevent thundering-herd (one backend call per cache miss)
  query: false          # false = ignore query params in cache key
                        # ['page', 'limit'] = vary cache by these params only
  headers: false        # false = ignore headers in cache key
                        # ['x-locale'] = vary cache by these headers only
```

Set `cache: false` to disable caching for a namespace or a specific rule.

### `pool: true` — Thundering-Herd Prevention

Without pooling, 100 concurrent requests hitting a cold cache result in 100 upstream calls. With `pool: true`, only **one** request goes upstream; the rest wait for that response. Response headers indicate pool status:

| Header | Meaning |
|---|---|
| `x-osham-pooled-main: true` | This request was the leader (made the upstream call) |
| `x-osham-pooled: true` | This request waited for another's response |
| `x-osham-pooled-wait: 42` | Milliseconds this request waited in the pool |

---

## 6. Per-Path Rules

Override cache config for specific paths within a namespace:

```yaml
employees:
  expose: /api/*
  target: http://localhost:3000
  cache:
    expires: 10s
  rules:
    /employees/:
      cache:
        expires: 5m        # cache employee list for longer
        query:
          - page
          - limit
    /employees/private/:
      cache: false         # never cache private data
```

---

## 7. Allow / Deny

```yaml
employees:
  expose: /api/*
  target: http://localhost:3000
  allow:
    - '/employees/**'
    - '/employee/*'
  deny:
    - '/employees/admin/**'   # deny always wins, even over allow
```

Uses `minimatch` glob syntax: `*` = one segment, `**` = any depth.

---

## 8. Working with HTTPS Upstreams

### The common problems

| Symptom | Cause | Fix |
|---|---|---|
| `ERR_TLS_CERT_ALTNAME_INVALID` | Certificate hostname mismatch | `insecureSkipVerify: true` |
| `HTTP 302` passed to client | Upstream redirects, proxy doesn't follow | `followRedirects: true` |
| `EPROTO / packet length too long` | Upstream redirects to HTTP, but proxy still uses TLS | Switch target to `http://` |
| Redirects loop back to `0.0.0.0` | Upstream builds redirect URL from `Host` header | `changeOrigin: true` |

### `changeOrigin: true`

When Osham proxies a request, it forwards the original client `Host` header by default. Some upstreams use the `Host` header to construct redirect `Location` URLs — so a client request to `0.0.0.0:26192` causes the upstream to redirect to `http://0.0.0.0:26192/...`, which loops back to Osham.

`changeOrigin: true` rewrites the `Host` header to match the upstream hostname:

```yaml
myApi:
  target: https://api.example.com
  changeOrigin: true   # Host: api.example.com (not 0.0.0.0:26192)
```

### `insecureSkipVerify: true`

For HTTPS upstreams with self-signed certificates, expired certs, or certificate hostname mismatches:

```yaml
myApi:
  target: https://internal-api.corp
  insecureSkipVerify: true   # skip TLS certificate verification
```

> Only use this for internal or test APIs. Never use it for public production upstreams.

### `followRedirects: true`

When the upstream returns a 3xx redirect and you want the proxy to transparently follow it:

```yaml
myApi:
  target: http://api.example.com
  followRedirects: true
```

Without this, the 302 is returned to the client as-is (same as `curl` without `-L`).

---

## 9. Full Example

A realistic configuration proxying a public test API:

```yaml
version: '1'
health: true
purge: true
metrics: true
xResponseTime: true

employees:
  expose: /api/v1/*
  target: http://dummy.restapiexample.com/api/v1
  changeOrigin: true      # fix redirect loops
  followRedirects: true   # follow 302s from upstream
  cache:
    expires: 30s
    pool: true
  rules:
    /employee/create/:
      cache: false        # don't cache write endpoints
  allow:
    - '/employees/**'
    - '/employee/*'
```

Test it:
```bash
# Health
curl http://localhost:26192/__osham/health

# Proxied + cached request
curl http://localhost:26192/api/v1/employees

# Check cache headers
curl -I http://localhost:26192/api/v1/employees
# x-osham-hit: true   → served from cache
# x-osham-hit: false  → cache miss, fetched from upstream

# Purge all employee cache entries
curl -X POST "http://localhost:26192/__osham/purge?pattern=O:employees:/api/v1/employees**"

# Prometheus metrics
curl http://localhost:26192/__osham/metrics
```

---

## 10. Response Headers Reference

| Header | Values | Description |
|---|---|---|
| `x-osham-hit` | `true` / `false` | Whether response was served from cache |
| `x-osham-key` | cache key string | The cache key used for this request |
| `x-osham-cache` | `no-config`, `not-allowed`, `denied` | Why caching was skipped |
| `x-osham-pooled` | `true` | Request waited in pool for another's upstream call |
| `x-osham-pooled-main` | `true` | Request was the pool leader (made the upstream call) |
| `x-osham-pooled-wait` | ms number | Time spent waiting in pool |
| `x-response-time` | ms number | Total request time (if `xResponseTime: true`) |
