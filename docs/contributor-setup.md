# Contributor Setup

This guide covers everything you need to run, test, and contribute to Osham locally.

---

## Prerequisites

- **Node.js** 18+ (the project was originally written for Node 14 but CI runs on 18)
- **npm** 8+ (comes with Node 18)
- **Redis** (optional — Osham falls back to an in-memory store automatically if Redis is unavailable)

---

## Clone and install

```sh
git clone https://github.com/ajaysinghj8/osham.git
cd osham
npm install
```

---

## Running locally

You need a `cache-config.yml` in your working directory. Copy the minimal example from the README or use the one already present in the repo root:

```sh
# Build first (TypeScript → JavaScript)
npm run build

# Start the server
node bin/osham
# or
npx osham
```

The server defaults to port `26192`. Override with `PORT=3001 node bin/osham`.

### With ts-node (skip the build step during development)

```sh
npx ts-node src/index.ts
```

---

## Environment variables

Create a `.env` file in the project root (it is git-ignored):

```
PORT=26192
REDIS_HOST=localhost
REDIS_PORT=6379
OSHAM_ADMIN_SECRET=dev-secret
OSHAM_ADMIN_ALLOW_INSECURE_LOCAL=true
```

`OSHAM_ADMIN_ALLOW_INSECURE_LOCAL=true` lets you access admin endpoints without a secret header during local development.

---

## Building

```sh
npm run build
```

This compiles TypeScript to `lib/`. The `lib/` directory is git-ignored.

---

## Running tests

```sh
npm test
```

Tests are integration-style and start a real Osham server internally. They do not require Redis — the in-memory store is used automatically.

To run with coverage:

```sh
npm run test:coverage
```

---

## Linting

```sh
npm run lint          # check
npm run lint:fix      # auto-fix
npm run format        # prettier
npm run format:check  # prettier check (used in CI)
```

---

## Running the admin UI locally

```sh
cd admin-ui
npm install
npm run dev
```

The Vite dev server proxies `/__osham/*` requests to `http://127.0.0.1:26192`. Start Osham in another terminal before opening the UI.

To build the admin UI for production:

```sh
cd admin-ui
npm run build
```

---

## Project structure

```
osham/
  bin/osham              # CLI entry point
  src/
    index.ts             # App bootstrap
    server.ts            # HTTP/HTTPS server
    types.ts             # Core TypeScript interfaces
    config.reader.ts     # YAML config parsing and validation
    ctx.provider.ts      # Request context wrapper
    admin.state.ts       # Config hot-reload state
    admin.audit.ts       # Audit event persistence
    admin.history.ts     # Config snapshot history
    proxy/
      index.ts           # HTTP/HTTPS proxy (backend requests)
    middlewares/
      adminConfig.ts     # Admin API (/__osham/admin/*)
      nameSpaceHandler.ts  # Per-namespace cache/proxy logic
      purgeCache.ts      # Cache purge endpoint
      metricsEndpoint.ts # Prometheus metrics endpoint
      healthCheck.ts     # Health endpoint
    services/
      cache.service.ts   # Storage abstraction (Redis / memory)
      pool.service.ts    # Thundering-herd prevention
      metrics.service.ts # Prometheus metric tracking
      genkey.service.ts  # Cache key generation
    storage/
      redis.store.ts     # Redis storage backend
      mem.store.ts       # In-memory storage backend
  admin-ui/              # Sidecar Vue/React admin UI (Vite)
  test/
    index.js             # Integration test suite (Mocha + supertest)
  docs/                  # Documentation
```

---

## How to add a test

All tests live in `test/index.js`. The file is one large Mocha suite that spins up a real Osham server and a stub backend.

1. Find the relevant `describe` block (e.g. `'Admin API – Config Endpoints'`).
2. Add an `it(...)` case inside it.
3. Use `client.get(...)` / `client.post(...)` from `supertest` to make requests.
4. Assert with Node's built-in `assert` module.

Run `npm test` to verify.

---

## Pull request guidelines

- Open an issue first for non-trivial changes.
- Keep PRs focused — one concern per PR.
- Run `npm run lint` and `npm test` before pushing.
- Follow the existing commit message style: `type(scope): short description` (e.g. `fix(proxy): handle gzip decode error`).
- Update relevant docs in `docs/` if behaviour changes.
