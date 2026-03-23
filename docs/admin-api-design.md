# Osham Admin API Design

## Purpose
Define the backend API contract for the Osham Admin UI so users can safely:
- view config
- validate config
- save/apply config
- view metrics and health
- perform purge actions
- inspect audit history

This document is intentionally implementation-oriented so coding agents can build against it directly.

---

## Design Principles

1. **Backend is source of truth**
   - UI convenience validation is fine, but backend validation decides correctness.

2. **Safe-by-default operations**
   - config changes validate before apply
   - purge actions return warnings for dangerous patterns
   - secrets are masked or write-only

3. **Structured responses**
   - all endpoints return machine-friendly shapes
   - validation returns field-level errors and warnings

4. **Operational clarity**
   - endpoints should expose startup summary, health, and metrics in a UI-friendly shape

5. **Incremental buildability**
   - implement config endpoints first
   - metrics/health/purge/audit can follow in phases

---

## Base Route

All admin endpoints live under:

```http
/__osham/admin
```

---

## Authentication Model

## MVP option
Use a shared admin secret header.

### Request header
```http
x-osham-admin-secret: <secret>
```

### Behavior
- If admin auth is enabled and header is missing/invalid → `401 Unauthorized`
- If auth is disabled in dev/test, allow local access only if explicitly configured

## Recommended config/env
- `OSHAM_ADMIN_SECRET`
- `OSHAM_ADMIN_ALLOW_INSECURE_LOCAL=false`

## Future option
- session auth / JWT / OAuth / SSO

---

## Common Response Shapes

## Success response
```json
{
  "ok": true,
  "data": {}
}
```

## Error response
```json
{
  "ok": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Config validation failed"
  }
}
```

## Validation response
```json
{
  "ok": true,
  "data": {
    "valid": false,
    "errors": [
      {
        "field": "namespaces.api.target",
        "message": "target is required",
        "severity": "error",
        "code": "REQUIRED_FIELD"
      }
    ],
    "warnings": [
      {
        "field": "global.helth",
        "message": "Unknown top-level key; did you mean 'health'?",
        "severity": "warning",
        "code": "UNKNOWN_KEY"
      }
    ]
  }
}
```

---

## Config Data Model

## Structured config returned to UI
```ts
type AdminConfigResponse = {
  globalConfig: {
    version: string
    health?: boolean
    metrics?: boolean
    purge?: boolean
    xResponseTime?: boolean
    metricsPath?: string
    secure?: {
      enabled: boolean
      sslKeyConfigured: boolean
      sslCertConfigured: boolean
    }
  }
  namespaces: Record<string, NamespaceConfig>
  meta: {
    source: string
    lastLoadedAt?: string
    lastAppliedAt?: string
    revision?: string
  }
}
```

## Namespace model
```ts
type NamespaceConfig = {
  expose: string
  target: string
  port?: number
  timeout?: number
  allow?: string[]
  deny?: string[]
  cache?: false | {
    expire?: string
    query?: false | string[]
    headers?: false | string[]
  }
  rules?: Array<{
    pattern?: string
    cache?: false | {
      expire?: string
      query?: false | string[]
      headers?: false | string[]
    }
  }>
}
```

### Secret handling
The following must **not** be returned in plaintext:
- admin secret
- purge secret
- SSL private key contents
- certificate contents

Expose only status/metadata, such as:
- configured / not configured
- path exists / missing

---

# Endpoints

## 1. Get current config

### `GET /__osham/admin/config`

Returns the currently loaded structured config.

### Response
```json
{
  "ok": true,
  "data": {
    "globalConfig": {
      "version": "1",
      "health": true,
      "metrics": true,
      "purge": true
    },
    "namespaces": {
      "api": {
        "expose": "/api/*",
        "target": "http://localhost:3000",
        "allow": ["/employees/**"],
        "deny": ["/employees/private/**"]
      }
    },
    "meta": {
      "source": "cache-config.yml",
      "lastAppliedAt": "2026-03-23T13:00:00Z",
      "revision": "abc123"
    }
  }
}
```

---

## 2. Validate config

### `POST /__osham/admin/config/validate`

Validates a proposed config payload without saving or applying it.

### Request
```json
{
  "config": {
    "globalConfig": {
      "version": "1",
      "health": true,
      "metrics": true,
      "purge": true
    },
    "namespaces": {
      "api": {
        "expose": "/api/*",
        "target": "http://localhost:3000"
      }
    }
  }
}
```

### Response
```json
{
  "ok": true,
  "data": {
    "valid": true,
    "errors": [],
    "warnings": []
  }
}
```

### Validation expectations
Should detect:
- missing required fields
- invalid types
- invalid allow/deny shapes
- unknown keys
- dangerous purge-related config warnings
- invalid rule/cache structure

---

## 3. Save config

### `PUT /__osham/admin/config`

Saves config to the configured config source but does **not necessarily apply it** unless explicitly designed to do so.

## Recommendation
Keep save and apply as separate actions.

### Request
```json
{
  "config": { "...": "..." },
  "expectedRevision": "abc123"
}
```

### Response
```json
{
  "ok": true,
  "data": {
    "saved": true,
    "revision": "abc124",
    "warnings": []
  }
}
```

### Notes
- use atomic file write
- reject stale writes if revision mismatch is implemented

---

## 4. Apply / reload config

### `POST /__osham/admin/config/reload`

Reloads config from source and applies it to the running service.

### Request
```json
{
  "expectedRevision": "abc124"
}
```

### Response
```json
{
  "ok": true,
  "data": {
    "applied": true,
    "revision": "abc124",
    "warnings": [],
    "summary": {
      "namespaceCount": 3,
      "features": {
        "health": true,
        "metrics": true,
        "purge": true
      }
    }
  }
}
```

### Failure example
```json
{
  "ok": false,
  "error": {
    "code": "APPLY_FAILED",
    "message": "Config could not be applied"
  },
  "details": {
    "errors": [
      {
        "field": "namespaces.api.target",
        "message": "target is invalid"
      }
    ]
  }
}
```

---

## 5. Health summary

### `GET /__osham/admin/health`

Returns service health in a UI-friendly format.

### Response
```json
{
  "ok": true,
  "data": {
    "status": "ok",
    "uptimeSeconds": 12345,
    "redis": {
      "status": "ok"
    },
    "config": {
      "loaded": true,
      "revision": "abc124"
    }
  }
}
```

---

## 6. Startup summary

### `GET /__osham/admin/startup-summary`

Returns the same important runtime summary the server logs on startup.

### Response
```json
{
  "ok": true,
  "data": {
    "version": "1.0.2",
    "namespaceCount": 2,
    "namespaces": [
      {
        "name": "api",
        "expose": "/api/*",
        "target": "http://localhost:3000",
        "cache": {
          "enabled": true,
          "expire": "10s"
        },
        "allow": ["/employees/**"],
        "deny": ["/employees/private/**"]
      }
    ],
    "features": {
      "health": true,
      "metrics": true,
      "purge": true,
      "xResponseTime": true,
      "secureMode": false
    },
    "warnings": []
  }
}
```

---

## 7. Metrics summary

### `GET /__osham/admin/metrics/summary`

Returns top-level metric totals for dashboard cards.

### Response
```json
{
  "ok": true,
  "data": {
    "requests": 10000,
    "cacheHits": 8200,
    "cacheMisses": 1800,
    "hitRatio": 0.82,
    "pooledRequests": 3,
    "cacheSizeBytes": 1200340
  }
}
```

---

## 8. Namespace metrics

### `GET /__osham/admin/metrics/namespaces`

Returns per-namespace metrics.

### Response
```json
{
  "ok": true,
  "data": [
    {
      "namespace": "api",
      "requests": 4000,
      "cacheHits": 3500,
      "cacheMisses": 500,
      "hitRatio": 0.875,
      "cacheSizeBytes": 450000,
      "pooledRequests": 1,
      "latency": {
        "p50": 0.012,
        "p95": 0.082
      }
    }
  ]
}
```

---

## 9. Purge endpoint

### `POST /__osham/admin/purge`

Performs a purge with safety warnings.

### Request
```json
{
  "pattern": "api:/employees/*",
  "dryRun": false
}
```

### Response
```json
{
  "ok": true,
  "data": {
    "purged": true,
    "warnings": [
      "Pattern is broad and may affect multiple keys"
    ]
  }
}
```

### Safety behavior
- require purge secret/admin auth as appropriate
- warn on:
  - `**`
  - namespace-less broad patterns
  - patterns likely to purge many keys
- optional `dryRun` support later

---

## 10. Audit log

### `GET /__osham/admin/audit`

Returns recent admin actions.

### Response
```json
{
  "ok": true,
  "data": [
    {
      "time": "2026-03-23T13:05:00Z",
      "action": "config.apply",
      "actor": "admin",
      "result": "success",
      "details": {
        "revision": "abc124"
      }
    }
  ]
}
```

### MVP note
This can initially be in-memory or file-based if no durable event store exists.

---

## Error Codes

Recommended codes:
- `UNAUTHORIZED`
- `VALIDATION_FAILED`
- `SAVE_FAILED`
- `APPLY_FAILED`
- `REVISION_CONFLICT`
- `PURGE_DENIED`
- `NOT_FOUND`
- `INTERNAL_ERROR`

---

## Apply/Save Semantics

## Recommended behavior
- **Validate**: checks payload only
- **Save**: persists payload to source of truth
- **Reload/Apply**: applies saved config to running service

This separation is safer for UI workflows and allows future review/diff screens.

---

## Concurrency / Revision Handling

## MVP
- optional revision token in config metadata

## Recommended
- attach `revision` to `GET /config`
- require `expectedRevision` for `PUT /config`
- reject stale writes with `409 REVISION_CONFLICT`

---

## Testing Requirements

### Admin API tests should cover
- unauthorized access
- valid config fetch
- invalid config validate response shape
- successful save
- failed save
- successful reload/apply
- failed reload/apply
- purge safety warnings
- startup summary response
- metrics summary response

---

## Implementation Order

1. `GET /config`
2. `POST /config/validate`
3. `PUT /config`
4. `POST /config/reload`
5. `GET /health`
6. `GET /startup-summary`
7. `GET /metrics/summary`
8. `GET /metrics/namespaces`
9. `POST /purge`
10. `GET /audit`

---

## Best Next Step

Use this doc to implement the first backend milestone:
- admin route scaffold
- auth middleware
- config read/validate/save/reload endpoints
- tests for those endpoints
