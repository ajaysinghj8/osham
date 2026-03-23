# Osham Open Issues Plan

## Current open items

### Issue #53 — Allow/Disallow urls patterns
- URL: https://github.com/ajaysinghj8/osham/issues/53
- Type: feature
- Status: open
- Notes: issue body is empty, so implementation needs a sensible config design and documented precedence rules.

### PR #82 — build(deps): bump flatted from 3.1.0 to 3.4.2
- URL: https://github.com/ajaysinghj8/osham/pull/82
- Type: dependency/security maintenance
- Status: open
- Notes: low-risk dependency/security update; should be reviewed after the current local code changes are stabilized.

## Proposed sequencing

1. Finish local hardening work already in flight:
   - Task A: startup/config validation
   - Task B: type cleanup and deeper validation
2. Implement Issue #53 with tests and docs.
3. Review dependency PR #82 and either merge or manually absorb the version bump.
4. Continue docs/CI/dependency modernization.

## Issue #53 implementation proposal

### Goal
Allow Osham users to declare URL patterns that are explicitly allowed or explicitly denied for caching/proxy behavior within a namespace.

### Proposed config model
Per namespace:

```yml
myNs:
  expose: '/api/*'
  target: 'http://localhost:3000'
  allow:
    - '/employees/**'
    - '/employee/*'
  deny:
    - '/employees/private/**'
```

Optional future rule-level support can be added later, but namespace-level support is enough for the first release.

### Proposed semantics
- If `allow` exists, only matching paths are allowed.
- If `deny` exists, matching paths are denied.
- If both exist, **deny wins**.
- If neither exists, current behavior remains unchanged.
- Denied requests should fail clearly and predictably (or bypass caching/proxying based on chosen product behavior).

### Recommended first implementation
- Add optional `allow` / `deny` arrays to namespace config.
- Validate them in config loading.
- Add path matching helper.
- Enforce allow/deny before proxy/cache handling.
- Add tests for precedence and default behavior.
- Document examples in README.

## PR #82 handling plan
- Check whether `flatted` is directly or transitively relevant after current install tree resolution.
- If low-risk, absorb the bump after current feature work lands.
- Re-run tests/lint after dependency update.
