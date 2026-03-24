# ओषम् (Osham)

[![Total alerts](https://img.shields.io/lgtm/alerts/g/ajaysinghj8/osham.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/ajaysinghj8/osham/alerts/)
[![Language grade: JavaScript](https://img.shields.io/lgtm/grade/javascript/g/ajaysinghj8/osham.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/ajaysinghj8/osham/context:javascript)

Osham is a lightweight configurable proxy cache server for HTTP APIs. It reduces backend load, improves response times, and includes request pooling to avoid thundering-herd effects on first requests.

## Quick start

Install locally:

```sh
npm install osham
```

Install globally:

```sh
npm install -g osham
```

Run (from a project with `cache-config.yml`):

```sh
npx osham
# or if installed globally
osham
```

## Configuration essentials

Create a `.env` (optional) and a `cache-config.yml` in your working directory. Minimal env vars:

```
PORT=26192
REDIS_HOST=localhost
REDIS_PORT=6379
SECURE=false
TIMEOUT=7000
```

The server supports per-namespace rules, cache expiry, pooling, and query/header-based cache variation. See the inline example below and the full config reference in the docs.

### Example `cache-config.yml`

Here's a minimal example you can copy into your project to get started quickly.

```yaml
version: '1'
xResponseTime: true
health: true
purge: true
metrics: true
dummyRest:
  expose: '/api/v1/*'
  target: 'http://localhost:3000'
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
        headers:
          - x-locale
    /employee/2/:
      cache: false
```

## Allow / Deny URL patterns

Each namespace accepts optional `allow` and `deny` glob pattern lists that control which paths Osham proxies. Requests blocked by these rules receive a `403` response with the header `x-osham-cache: denied`.

**Precedence rules:**

- If `deny` is set and the path matches any pattern → **403 Forbidden** (deny always wins).
- Else if `allow` is set and the path does **not** match any pattern → **403 Forbidden**.
- If neither `allow` nor `deny` is present, all paths within the namespace are handled normally (existing behavior unchanged).

**Example:**

```yaml
myNs:
  expose: '/api/v1/*'
  target: 'http://localhost:3000'
  cache:
    expires: 10s
  allow:
    - '/employees/**'
    - '/employee/*'
  deny:
    - '/employees/private/**'
```

In this example:

- `/employees/123` → proxied (matches allow)
- `/employee/5` → proxied (matches allow)
- `/employees/private/data` → **403** (deny wins, even though it also matches `/employees/**` in allow)
- `/departments/1` → **403** (not in allow list)

Patterns follow glob syntax (e.g. `*` matches a single path segment, `**` matches any number of segments).

## Purge cache (administrative)

Osham provides an admin endpoint to invalidate cache by exact key or by pattern. See the detailed guide:

- [Purge Cache](docs/purge-cache.md)

Key format: `O:<NAMESPACE>:<PATH>[:<VARIANT_HASH>]` (variant hash is SHA1 hex).

## Metrics (Prometheus)

Enable Prometheus metrics to monitor cache performance:

```yaml
version: '1'
metrics: true
# ... rest of config
```

Access metrics at `/__osham/metrics` (Prometheus text format). Exposed metrics include:

- **osham_cache_hits_total** — cumulative cache hits (by namespace)
- **osham_cache_misses_total** — cumulative cache misses (by namespace)
- **osham_request_duration_seconds** — request latency histogram (by namespace, method, HTTP status)
- **osham_pooled_requests** — current number of pooled requests (by namespace)
- **osham_cache_size_bytes** — current cache size in bytes (by namespace)

Scrape this endpoint from your Prometheus instance to track cache efficiency and identify optimization opportunities. See the detailed guide:

- [Metrics](docs/metrics.md)

## Admin UI

Osham now includes a sidecar admin UI under `admin-ui/` for config editing, health/metrics visibility, purge tooling, audit review, config history, rollback, and draft import/export.

### Run the admin UI locally

Start Osham first so the admin API is reachable, then in another shell:

```sh
cd admin-ui
npm install
npm run build
# or for local development
npm run dev
```

By default the Vite dev server proxies `'/__osham/*'` requests to `http://127.0.0.1:26192`. If your Osham server listens elsewhere, override the proxy target:

```sh
OSHAM_ADMIN_API_TARGET=http://127.0.0.1:3001 npm run dev
```

The UI stores `x-osham-admin-secret` in `sessionStorage` only and will prompt again if the saved secret is rejected by the admin API.

## When to use Osham

- Reduce backend load and TTFB for high-read API endpoints
- Prevent thundering-herd on first-request cache misses using request pooling
- Centralize caching for multiple backend endpoints

## Limitations

1. Only anonymous GET requests are cached.
2. Purge operations should be restricted and protected in production.

## Architecture

The diagram below illustrates how Osham handles incoming HTTP GET requests:

1. **Concurrent requests** reach the proxy. On a cache miss, Osham pools followers
   and forwards a single request to the backend to avoid a thundering‑herd.
2. The backend response is cached and then replayed to all pooled clients.
3. Subsequent requests for the same resource hit the cache directly, avoiding
   any backend traffic.

![Osham Architecture](https://raw.githubusercontent.com/ajaysinghj8/osham/master/public/Arch.svg?sanitize=true&raw=true)

## Troubleshooting

Having problems? See the [Troubleshooting guide](docs/troubleshooting.md) for solutions to common issues including:

- Server won't start (missing config, invalid YAML, HTTPS env vars)
- Cache misses or incorrect TTL behaviour
- 403 responses from allow/deny rules
- Purge not working (auth, pattern format)
- Metrics endpoint returning 404
- Admin UI auth and CORS issues

## Contributing

PRs and issues welcome. See the [Contributor Setup guide](docs/contributor-setup.md) for full local setup instructions, test guidance, and PR guidelines.

Quick start:

```sh
npm install
npm run build
npm test
```

## License

See `LICENSE` in the repository.
