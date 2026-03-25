# Osham Admin UI Agent Task List

This file breaks the Admin UI roadmap into concrete task bundles that can be handed to Claude, Codex, or other coding agents.

---

## Priority Order

1. Admin API foundation
2. Config editor backend
3. Config editor frontend
4. Metrics + health backend/frontend
5. Purge + audit features
6. Hardening / versioning / rollback

---

# Task Bundle 1 — Admin API Foundation (Backend)

## Goal
Create the initial admin route scaffold and authentication layer.

## Scope
- Work in `osham/`
- Add `/__osham/admin/*` route foundation
- Add admin auth middleware
- Add tests for unauthorized access

## Required work
- Add admin route registration
- Add admin auth check via header/env-based secret
- Add common success/error response helpers if useful
- Document required env vars briefly

## Deliverables
- admin route scaffold
- auth middleware
- tests for 401 behavior
- docs update if needed

## Verification
- lint
- build
- test

---

# Task Bundle 2 — Config Read/Validate/Save/Reload API (Backend)

## Goal
Expose the first usable config management API for the UI.

## Scope
Implement:
- `GET /__osham/admin/config`
- `POST /__osham/admin/config/validate`
- `PUT /__osham/admin/config`
- `POST /__osham/admin/config/reload`

## Required work
- Return structured config model
- Mask secret-backed fields
- Use current validation logic as source of truth
- Return structured validation errors/warnings
- Use atomic file writes for save if config file is updated
- Define apply semantics clearly

## Deliverables
- working config endpoints
- structured validation response
- tests for valid/invalid cases

## Verification
- lint
- build
- test

---

# Task Bundle 3 — Startup Summary + Health API (Backend)

## Goal
Provide dashboard-ready operational state.

## Scope
Implement:
- `GET /__osham/admin/health`
- `GET /__osham/admin/startup-summary`

## Required work
- expose current health state
- expose startup summary in structured form
- include enabled features and namespace info
- include warnings where available

## Deliverables
- health endpoint
- startup summary endpoint
- tests

## Verification
- lint
- build
- test

---

# Task Bundle 4 — Metrics Summary API (Backend)

## Goal
Make metrics UI-consumable.

## Scope
Implement:
- `GET /__osham/admin/metrics/summary`
- `GET /__osham/admin/metrics/namespaces`

## Required work
- convert existing metrics into dashboard-friendly JSON
- include cache hits, misses, hit ratio, pooled requests, cache size
- include per-namespace summaries if possible

## Deliverables
- metrics summary endpoints
- tests
- docs update if endpoint behavior needs explanation

## Verification
- lint
- build
- test

---

# Task Bundle 5 — Purge Admin API + Safety (Backend)

## Goal
Add safe operational purge controls for UI use.

## Scope
Implement:
- `POST /__osham/admin/purge`
- optional purge preview support later

## Required work
- validate purge request payload
- return warnings for broad/dangerous patterns
- enforce auth/secret checks consistently
- optionally include dry-run support if easy and safe

## Deliverables
- purge admin endpoint
- tests for warnings and auth
- docs update

## Verification
- lint
- build
- test

---

# Task Bundle 6 — Audit Logging (Backend)

## Goal
Track sensitive admin actions.

## Scope
- log config save/apply operations
- log purge actions
- expose `GET /__osham/admin/audit`

## Required work
- choose simple initial storage (in-memory/file-backed)
- define audit event shape
- return recent history

## Deliverables
- audit event capture
- audit endpoint
- tests

## Verification
- lint
- build
- test

---

# Task Bundle 7 — Admin UI Shell (Frontend)

## Goal
Create the frontend skeleton.

## Suggested stack
- React + TypeScript
- Tailwind
- React Query
- React Hook Form

## Scope
- project scaffold for UI
- nav/layout
- route structure for dashboard/config/metrics/health/purge
- API client layer

## Deliverables
- frontend shell
- route scaffolding
- API service layer

## Verification
- build
- lint

---

# Task Bundle 8 — Namespace Config Editor (Frontend)

## Goal
Let users edit namespace/domain-level config from UI.

## Scope
- namespace list page
- namespace editor form
- create/edit/clone/disable flows
- validate/save/apply flow integration

## Required work
- inline field validation
- render backend warnings/errors clearly
- preserve advanced fields like allow/deny/cache/rules

## Deliverables
- namespace config UI
- save/apply UX

## Verification
- build
- lint
- component/integration tests if available

---

# Task Bundle 9 — Global Settings UI (Frontend)

## Goal
Edit top-level Osham config from UI.

## Scope
- health/metrics/purge toggles
- version display/edit if appropriate
- secure mode visibility
- masked secret status

## Deliverables
- global settings page
- validation/error rendering

## Verification
- build
- lint

---

# Task Bundle 10 — Metrics + Health UI (Frontend)

## Goal
Show observability clearly.

## Scope
- dashboard cards
- namespace metrics table
- charts for hit/miss/latency if available
- health and startup summary pages

## Deliverables
- dashboard
- metrics page
- health page

## Verification
- build
- lint

---

# Task Bundle 11 — Purge + Audit UI (Frontend)

## Goal
Add safe operational UI controls.

## Scope
- purge form
- warning banners for broad patterns
- confirmations
- audit log viewer

## Deliverables
- purge UI
- audit log UI

## Verification
- build
- lint

---

# Task Bundle 12 — Hardening / Productization

## Goal
Make the admin UI safer for real-world use.

## Scope
- revision/conflict handling
- config versioning
- rollback support
- import/export
- read-only mode

## Deliverables
- revision-aware save/apply flow
- version history primitives
- docs updates

---

## Recommended Handoff Order for Agents

### First handoff
Give an agent **Task Bundle 1 + 2** together:
- admin API foundation
- config read/validate/save/reload

### Second handoff
Then assign **Task Bundle 3 + 4**:
- health/startup summary
- metrics summary endpoints

### Third handoff
Then assign **Task Bundle 5 + 6**:
- purge admin API
- audit logging

### Fourth handoff
Start frontend with **Task Bundle 7 + 8**:
- UI shell
- namespace config editor

---

## Suggested instruction for coding agents

When handing off a bundle, require this output:

### Summary
- ...

### Files Changed
- ...

### Verification
- lint: pass/fail/not run
- build: pass/fail/not run
- test: pass/fail/not run

### Commit
- `<hash>` - `<message>`

### Remaining Work
- ...

### Blockers
- ...
