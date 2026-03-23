# Osham Improvement Plan

## Snapshot
Osham is a TypeScript-based configurable proxy cache for HTTP APIs with request pooling, purge support, and Prometheus metrics. The project already has a useful core and a decent integration-style test suite, but it shows its age in dependency hygiene, config validation, operational hardening, and contributor ergonomics.

## What looks good
- Clear purpose and compact architecture.
- Good README for a first-time user.
- Useful integration tests around pooling, cache keys, purge, health, and metrics.
- Metrics and purge docs already exist.

## Main weaknesses observed
1. **Dependency health is poor**
   - `npm install` reports many vulnerabilities.
   - Core packages are old (`redis@3`, old eslint/typescript toolchain, `path-to-regexp@0.1.7`).
2. **Config loading is fragile**
   - `cache-config.yml` is required but only loosely parsed.
   - No schema validation despite a TODO in `config.reader.ts`.
   - Startup errors are likely to be confusing for users.
3. **Server startup / operational hardening is thin**
   - Minimal startup logging.
   - No explicit startup validation for required SSL envs when `SECURE=true`.
   - Error handling is basic and may hide root causes.
4. **Type modeling can be improved**
   - `ICacheConfig` typing is too loose.
   - Some types blur top-level config vs namespace map.
5. **Developer experience is dated**
   - Build/test/lint depend on local install but repo gives no setup section for contributors.
   - No CI metadata found at top level.
6. **Docs can be stronger**
   - Missing architecture/flow explanation for cache key composition, pooling behavior, and deployment expectations.
   - No troubleshooting guide.
   - README references `cache-config.example.yml`, but that file does not appear in repo root.

## Recommended task breakdown

### Phase 1 — Stabilize and validate
1. **Add config schema validation**
   - Validate top-level config and namespace definitions on startup.
   - Produce clear error messages with field names and examples.
   - Fix README/example references if example file is missing.

2. **Improve startup and runtime error handling**
   - Validate required env vars for secure mode.
   - Fail fast with actionable messages.
   - Improve request-chain error handling so users get safe errors and logs remain useful.

3. **Tighten type definitions**
   - Separate global config shape from namespace map.
   - Reduce unsafe casting in `config.reader.ts`.

### Phase 2 — Upgrade maintainability
4. **Modernize dependencies carefully**
   - Audit direct dependencies.
   - Upgrade low-risk tooling first.
   - Investigate runtime-impacting upgrades separately (especially redis and routing-related libs).
   - Keep behavior stable and expand tests before risky upgrades.

5. **Expand automated validation**
   - Add tests for invalid config.
   - Add tests for secure-mode startup validation.
   - Add tests for edge cases around header/query variation and purge safety.

6. **Add CI**
   - Run build, lint, and tests on push/PR.
   - Optionally add audit checks with a non-blocking or staged policy.

### Phase 3 — Product/documentation polish
7. **Improve docs**
   - Add contributor setup section.
   - Add troubleshooting page.
   - Add deployment guidance (Redis expectations, TLS mode, purge protection, metrics scraping).
   - Document cache key composition and pooling semantics.

8. **Operational hardening**
   - Restrict/admin-protect purge in production.
   - Add clearer warnings around anonymous GET-only caching.
   - Consider namespaced observability and startup config summary logs.

## Suggested execution order for Claude

### Task A — Config validation + startup failures
**Goal:** Make startup safe and predictable.
- Implement config validation.
- Add tests for invalid/missing config.
- Improve secure mode env validation.
- Update README/docs to match actual config behavior.

### Task B — Type cleanup
**Goal:** Reduce unsafe casts and improve maintainability.
- Refactor config/type model.
- Remove loose typing where practical.
- Keep external behavior unchanged.

### Task C — Docs cleanup
**Goal:** Make onboarding and operations easier.
- Fix missing/incorrect doc references.
- Add troubleshooting and contributor setup.

### Task D — Dependency modernization plan
**Goal:** Reduce risk before touching runtime-heavy packages.
- Produce an upgrade matrix.
- Separate safe upgrades from risky ones.
- Make changes incrementally with test coverage.

## Immediate recommendation
Have Claude start with **Task A (config validation + startup hardening)** first. It gives the best user-visible improvement with relatively low architectural risk.
