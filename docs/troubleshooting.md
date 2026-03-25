# Troubleshooting

Common issues and how to resolve them.

---

## Server won't start

### `Error: ENOENT: no such file or directory, open 'cache-config.yml'`
Osham looks for `cache-config.yml` in the **current working directory** when you run it.

```sh
# Make sure you're in the directory that contains cache-config.yml
cd /path/to/your/project
osham
```

### `Error: config validation failed`
Your `cache-config.yml` has a structural problem. The error message includes the field name and a description. Common causes:

- Missing `version: '1'` at the top level
- A namespace is missing the required `expose` or `target` fields
- `cache.expires` is set to an unrecognised duration string (use `10s`, `1m`, `3600`, etc.)
- An `allow` or `deny` value is not an array of strings

### Server exits immediately in HTTPS mode
When `SECURE=true` is set, both `SSL_KEY` and `SSL_CERT` must point to valid files:

```
SECURE=true
SSL_KEY=/path/to/server.key
SSL_CERT=/path/to/server.crt
```

If either file is missing or unreadable, the server will fail on startup with a clear message.

---

## Cache is not working

### Responses are never cached (always a miss)
- Only **GET** requests are cached. POST, PUT, DELETE, and other methods always pass through.
- Check that `cache:` is configured for the namespace and not set to `false`.
- Check that a per-path rule isn't overriding the namespace cache with `cache: false`.

### Cache works locally but not in production
- Verify `REDIS_HOST` and `REDIS_PORT` are set and the Redis instance is reachable.
- If Redis is unavailable, Osham silently falls back to an **in-memory store** that is not shared across processes and is lost on restart.
- Run `GET /__osham/admin/health` to confirm the cache backend (`redis` or `memory`) currently in use.

### TTL seems wrong
- `cache.expires` accepts a duration string (`10s`, `5m`, `1h`) or an integer number of seconds.
- The value `0` disables expiry (items stay until Redis evicts them or the process restarts for in-memory).

---

## Requests are not being proxied

### 403 Forbidden — `x-osham-cache: denied`
The request matched a `deny` pattern or failed to match a required `allow` pattern. Check your namespace's `allow` and `deny` lists. Deny always wins over allow. See the [allow/deny docs](../README.md#allow--deny-url-patterns).

### 404 from Osham (not from the backend)
The request path did not match any configured namespace `expose` pattern. Verify the `expose` field uses `path-to-regexp` syntax (e.g. `/api/v1/*`).

### Requests time out
- The backend is slow or unreachable.
- `timeout` (in the namespace config or the `TIMEOUT` env var) may be too low.
- Check `/__osham/admin/health` for backend connectivity clues.

---

## Purge not working

### 401 Unauthorized on purge
`OSHAM_PURGE_SECRET` is set but you didn't include the `x-osham-purge-secret` header:

```sh
curl -X POST 'http://localhost:26192/__osham/purge?pattern=O:myNs:/api/**' \
  -H 'x-osham-purge-secret: your-secret'
```

### Pattern matched nothing
- Cache keys follow the format `O:<NAMESPACE>:<PATH>[:<VARIANT_HASH>]`.
- Use `**` (not `*`) to match slashes and hash suffixes, e.g. `O:myNs:/api/v1/users**`.
- Patterns without the `O:` prefix trigger a warning and match across all namespaces — be careful.
- See [purge-cache.md](purge-cache.md) for the full key format and pattern semantics.

### Purge endpoint returns 404
`purge: true` must be set in your `cache-config.yml`, or `OSHAM_PURGE_PATH` must match the path you're requesting.

---

## Metrics not showing

### `GET /__osham/metrics` returns 404
Add `metrics: true` to your `cache-config.yml` and reload the server (or use the admin UI to apply the config).

### Custom metrics path not working
Set the env var before starting Osham:

```sh
OSHAM_METRICS_PATH=/prometheus osham
```

Metrics will then be at `GET /prometheus`.

### Prometheus scrape returns no data
Traffic must flow through Osham for counters to be non-zero. The metrics endpoint always responds even with no traffic — counters will just be `0`.

---

## Admin UI not connecting

### Auth gate shows after every page refresh
The admin secret is stored in `sessionStorage` only, so it is cleared when the browser tab is closed. Re-enter the secret when prompted.

### `401 Unauthorized` in the UI
- The secret you entered does not match `OSHAM_ADMIN_SECRET` on the server.
- If `OSHAM_ADMIN_SECRET` is not set, you must set `OSHAM_ADMIN_ALLOW_INSECURE_LOCAL=true` for unauthenticated local access.

### UI can't reach the admin API (network error or CORS)
When running the dev server (`npm run dev` in `admin-ui/`), requests to `/__osham/*` are proxied to `http://127.0.0.1:26192` by default. If your server runs on a different port:

```sh
OSHAM_ADMIN_API_TARGET=http://127.0.0.1:3001 npm run dev
```

When serving the built UI as a static file from a different origin, configure your web server to forward `/__osham/*` to the Osham backend.

---

## High latency / frequent cache misses

### Every request is a miss despite correct config
- The cache key depends on the path and, optionally, query params and headers. If `cache.query` includes a param that changes on every request, each will get its own cache key.
- Use the `x-osham-cache` response header to confirm: `hit`, `miss`, or `pooled`.

### Pool wait timeouts
If a pooled request exceeds the pool timeout (default 5 s), waiting requests fail. This usually means the backend is slow. Consider increasing `timeout` in the namespace config or investigating backend latency.

### Redis latency
If Redis round-trips are high, cache hits will be slower than expected. Check Redis network proximity and consider running Redis on the same host as Osham.
