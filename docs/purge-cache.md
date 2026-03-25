# Purging Cache

Osham provides an administrative HTTP endpoint to remove cached entries either by exact cache key or by pattern (wildcard). This page documents how to use the purge endpoint, the key format, and recommendations for safe usage.

## Endpoint

The purge endpoint is enabled when `purge: true` is set in your `cache-config.yml` (default test config enables this). By default the endpoint path is:

- `POST /__osham/purge` — Purge keys using query parameters.

You may customize the path with the `OSHAM_PURGE_PATH` environment variable.

## Parameters

- `?key=...` — Purge a single, exact cache key. Use `encodeURIComponent` when passing keys containing special characters.
- `?pattern=...` — Purge all keys matching a glob pattern. Patterns use `minimatch` semantics (i.e. shell-style globs).

Only one of `key` or `pattern` should be provided per request. The request method should be `POST` (or `DELETE` depending on your configuration); other methods return 405.

Example (purge single key):

```sh
curl -X POST 'http://localhost:26192/__osham/purge?key=O%3AdummyRest%3A%2Fapi%2Fv1%2Femployees%3A3a1229e3...'
```

Example (purge by pattern):

```sh
# purge all employees entries in namespace 'dummyRest'
curl -X POST 'http://localhost:26192/__osham/purge?pattern=O:dummyRest:/api/v1/employees*'
```

## Cache key format

Cache keys are generated using the namespace and request path. To aid pattern-based purging, Osham uses a stable key structure:

```
O:<NAMESPACE>:<PATH>[:<VARIANT_HASH>]
```

- `<VARIANT_HASH>` is included when query parameters or headers are part of the cache configuration. It is a SHA1 hex digest (hex encoding) of the variant string (headers + query) and is safe for glob matching because it contains only hex characters (0-9a-f).

Example keys:

- `O:dummyRest:/api/v1/employees`
- `O:dummyRest:/api/v1/employees:3a1229e3e72090...`

Using this format you can purge by path and namespace (e.g. `O:dummyRest:/api/v1/employees*`) and match both the canonical (no-variant) key and variant keys.

## Pattern semantics

Osham delegates pattern matching to the `minimatch` library which implements shell-style globbing. Notes:

- `*` matches any number of characters except `/` by default. To match slashes, use `**` or appropriate glob expression.
- Example: `O:dummyRest:/api/v1/employees**` matches `O:dummyRest:/api/v1/employees` and `O:dummyRest:/api/v1/employees:...`.

## Store behavior

- **In-memory store (`MemStore`)**: purge by pattern iterates keys and removes matches. This operation runs in-process and is immediate.
- **Redis store**: If the storage driver exposes `purgeByPattern`, it will be used. Otherwise Osham falls back to `SCAN` + batch `DEL` to avoid blocking Redis.

## Authentication

Osham supports a lightweight shared-secret mechanism to protect the purge endpoint. Set the `OSHAM_PURGE_SECRET` environment variable to a secret value; callers must then supply the same value in the `x-osham-purge-secret` request header, or the request is rejected with a `401 Unauthorized` response.

```sh
# Start Osham with a purge secret:
OSHAM_PURGE_SECRET=my-secret-token osham

# Purge with the secret header:
curl -X POST 'http://localhost:26192/__osham/purge?pattern=O:dummyRest:/api/v1/employees**' \
  -H 'x-osham-purge-secret: my-secret-token'
```

If `OSHAM_PURGE_SECRET` is not set, no authentication is required — appropriate for trusted internal networks only.

## Broad-pattern warnings

Patterns that do not start with `O:` (the namespace prefix) may accidentally match cache keys across all namespaces. When such a pattern is used, Osham returns a `warning` field in the response body alongside the `deleted` count:

```json
{ "deleted": 3, "warning": "Pattern may match keys across all namespaces. Use the \"O:<namespace>:<path>\" prefix ..." }
```

Always prefer namespaced patterns like `O:myNs:/api/v1/users*` over bare globs like `*` or `**`.

## Security and safety

- Restrict access to the purge endpoint — it can invalidate a lot of cached data. Use `OSHAM_PURGE_SECRET` and/or firewall rules to prevent unauthorized purges.
- Consider logging purges and rate-limiting purge requests in production.
- The purge endpoint accepts `POST` and `DELETE` methods; other methods return `405 Method Not Allowed`.

## Examples and tips

- Purge a single variant:

```sh
curl -X POST "http://localhost:26192/__osham/purge?key=$(node -e "console.log(encodeURIComponent('O:dummyRest:/api/v1/employees:3a1229...'))")"
```

- Purge all employees keys (namespace `dummyRest`):

```sh
curl -X POST 'http://localhost:26192/__osham/purge?pattern=O:dummyRest:/api/v1/employees**'
```

## Troubleshooting

- If purge by pattern did not remove expected keys, log keys before and after purge to verify pattern compatibility. Ensure you use `**` to match colon- or slash-containing suffixes when appropriate.

If you want, I can add a CLI helper for generating purge patterns or a small script to show matching keys before deletion.

Doc generated by contributor scripts. Keep this file in `docs/` for easy reference.