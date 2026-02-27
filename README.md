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

See `cache-config.example.yml` for full options and examples. The server supports per-namespace rules, cache expiry, pooling, and query/header-based cache variation.

### Example `cache-config.yml`

Here's a minimal example you can copy into your project to get started quickly.

```yaml
version: '1'
xResponseTime: true
health: true
purge: true
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

## Purge cache (administrative)

Osham provides an admin endpoint to invalidate cache by exact key or by pattern. See the detailed guide:

- [Purge Cache](docs/purge-cache.md)

Key format: `O:<NAMESPACE>:<PATH>[:<VARIANT_HASH>]` (variant hash is SHA1 hex).

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

## Contributing

PRs and issues welcome. Run tests with:

```sh
npm test
```

## License

See `LICENSE` in the repository.
