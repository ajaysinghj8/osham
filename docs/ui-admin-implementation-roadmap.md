# Osham Admin UI Implementation Roadmap

## Goal
Build a web-based admin UI for Osham so users can:
- view and update config safely
- manage namespace/domain-level behavior from the UI
- validate config before applying it
- view health and metrics
- perform operational actions like purge with safeguards

This roadmap breaks the work into backend and frontend deliverables so it can be implemented incrementally.

---

## Product Scope

### In scope
- Config read/update from UI
- Namespace/domain-level config management
- Global settings management
- Config validation and reload/apply workflow
- Metrics and health visibility
- Purge management with safety warnings
- Basic authentication/authorization for admin routes
- Auditability for config and purge actions

### Out of scope for MVP
- Full RBAC with multiple roles
- Multi-environment management
- Advanced collaboration/locking
- Full config history rollback UI
- SSO/OAuth enterprise auth

---

# Phase 0 — Design Foundations

## Backend tasks
1. **Define admin API contract**
   - Create a design doc for all `/__osham/admin/*` endpoints
   - Define request/response schemas
   - Define validation error/warning format
   - Define auth model for admin endpoints

2. **Define structured config response model**
   - Standardize the config shape returned to the UI
   - Reuse the internal structured config model (`globalConfig`, `namespaces`)
   - Mark secret-backed fields as masked/non-readable

3. **Define operational safety rules**
   - Which changes require reload?
   - Whether save and apply are the same or separate actions
   - What constitutes a dangerous purge pattern?
   - What actions should be logged?

## Frontend tasks
1. **Create UX wireframe / screen map**
   - Dashboard
   - Namespaces list
   - Namespace editor
   - Global settings
   - Metrics
   - Health / diagnostics
   - Purge tools
   - Audit log

2. **Define frontend data model**
   - Match backend structured config model
   - Support form editing + optional advanced/raw editor later

## Deliverables
- Admin API design doc
- Validation response schema
- Screen map / UX outline

---

# Phase 1 — Backend MVP: Config API

## Objective
Expose safe admin endpoints so a UI can read, validate, save, and apply config.

## Backend tasks
1. **Add admin route namespace**
   - `/__osham/admin/*`
   - Protect all admin endpoints with auth

2. **Implement config read endpoint**
   - `GET /__osham/admin/config`
   - Return structured config
   - Mask secret-backed fields where needed

3. **Implement config validate endpoint**
   - `POST /__osham/admin/config/validate`
   - Accept structured config payload
   - Return:
     - `valid`
     - `errors[]`
     - `warnings[]`

4. **Implement config save endpoint**
   - `PUT /__osham/admin/config`
   - Save config in a safe format
   - Prefer atomic file write
   - Preserve formatting expectations if YAML is stored

5. **Implement config reload/apply endpoint**
   - `POST /__osham/admin/config/reload`
   - Re-parse and apply config safely
   - Return success/failure + warnings

6. **Return structured validation output**
   Example:
   ```json
   {
     "valid": false,
     "errors": [
       { "field": "namespaces.api.target", "message": "target is required" }
     ],
     "warnings": [
       { "field": "global.foo", "message": "unknown config key" }
     ]
   }
   ```

7. **Add tests for admin config API**
   - unauthorized access
   - valid read
   - invalid config validate
   - valid save
   - failed reload

## Frontend tasks
- none required yet, but frontend can begin mocking these APIs

## Deliverables
- Admin config endpoints
- Auth protection
- Validation response format
- Test coverage for config API

---

# Phase 2 — Frontend MVP: Config Editor

## Objective
Build the first usable admin UI for config management.

## Frontend tasks
1. **Set up admin UI app**
   Recommended stack:
   - React + TypeScript
   - Tailwind
   - React Query or equivalent for data fetching
   - React Hook Form / Zod or similar for forms

2. **Build dashboard shell / navigation**
   - Sidebar/top nav
   - Screen routing
   - auth gate if required

3. **Build namespaces list page**
   - Show namespace name, expose, target, cache enabled, status
   - Actions: create, edit, clone, delete/disable

4. **Build namespace editor form**
   Fields:
   - name
   - expose
   - target
   - timeout
   - cache on/off
   - cache expiry
   - cache headers/query variations
   - allow list
   - deny list
   - rules
   - pooling / namespace-level toggles

5. **Build global settings page**
   Fields:
   - version
   - metrics
   - health
   - purge
   - metrics path
   - secure mode visibility
   - secret status (masked)

6. **Build validate/save/apply workflow**
   - Validate button
   - Show errors/warnings inline
   - Save draft
   - Apply/reload config
   - Success/failure toast + details

7. **Optional advanced mode**
   - Read-only raw YAML preview initially
   - Editable raw mode only after structured editor is stable

## Backend tasks
1. Ensure admin config endpoints are stable for UI use
2. Add helpful field-level error mapping if needed

## Deliverables
- Working config editor UI
- Namespace CRUD (or create/edit/disable for MVP)
- Validate + apply flow

---

# Phase 3 — Metrics and Health UI

## Objective
Expose observability data in a human-friendly admin dashboard.

## Backend tasks
1. **Add metrics summary endpoint**
   - `GET /__osham/admin/metrics/summary`
   - return totals and key counters

2. **Add namespace metrics endpoint**
   - `GET /__osham/admin/metrics/namespaces`
   - per-namespace metrics summary

3. **Optional timeseries endpoint**
   - `GET /__osham/admin/metrics/timeseries`
   - if metrics history exists or can be sampled

4. **Add health/diagnostics endpoints**
   - `GET /__osham/admin/health`
   - `GET /__osham/admin/startup-summary`
   - include warnings, feature flags, namespace counts, secure mode state

## Frontend tasks
1. **Dashboard cards**
   - total requests
   - cache hits
   - cache misses
   - hit ratio
   - cache size
   - pooled requests
   - number of active namespaces

2. **Charts**
   - requests over time
   - hit/miss ratio
   - latency distribution
   - per-namespace traffic comparison

3. **Health page**
   - service status
   - startup summary
   - validation warnings
   - feature flags
   - Redis connectivity (if available)

## Deliverables
- Metrics dashboard
- Health/diagnostics UI
- Per-namespace metrics visibility

---

# Phase 4 — Purge and Operations

## Objective
Add safe operational tooling.

## Backend tasks
1. **Add purge admin endpoint**
   - `POST /__osham/admin/purge`

2. **Optional purge preview endpoint**
   - `POST /__osham/admin/purge/preview`
   - estimate what may be affected

3. **Add purge warnings in response**
   - broad wildcard warnings
   - namespace-less pattern warnings

4. **Add audit logging hooks**
   Log:
   - config save
   - config apply/reload
   - purge actions
   - auth failures (if appropriate)

## Frontend tasks
1. **Build purge tools page**
   - purge by exact key
   - purge by pattern
   - clear warning banners for dangerous patterns

2. **Add confirmation UX**
   - second confirmation for broad purges
   - show examples of risky patterns

3. **Add audit log page**
   - who changed what
   - when
   - result

## Deliverables
- Purge UI with safety warnings
- Audit log visibility

---

# Phase 5 — Hardening and Productization

## Objective
Make the admin UI production-ready.

## Backend tasks
1. **Config versioning**
   - store snapshots of applied config
   - allow rollback later

2. **Concurrency protection**
   - revision IDs / optimistic locking
   - reject stale config writes

3. **Expanded auth model**
   - optional role separation later
   - admin vs read-only operator

4. **Import/export support**
   - download current config
   - import validated config

5. **Unknown key / migration assistance**
   - structured upgrade warnings
   - deprecation notices

## Frontend tasks
1. **Version history UI**
2. **Rollback UI**
3. **Read-only operator mode**
4. **Import/export controls**
5. **Better diff/review screen before apply**

## Deliverables
- Safer multi-user operation
- Rollback path
- Better long-term maintainability

---

# Recommended API Endpoints

## Config
- `GET /__osham/admin/config`
- `POST /__osham/admin/config/validate`
- `PUT /__osham/admin/config`
- `POST /__osham/admin/config/reload`

## Metrics
- `GET /__osham/admin/metrics/summary`
- `GET /__osham/admin/metrics/namespaces`
- `GET /__osham/admin/metrics/timeseries` (optional)

## Health
- `GET /__osham/admin/health`
- `GET /__osham/admin/startup-summary`

## Purge
- `POST /__osham/admin/purge`
- `POST /__osham/admin/purge/preview` (optional)

## Audit
- `GET /__osham/admin/audit`

---

# Suggested Technical Stack

## Backend
- Existing Osham Node/TypeScript service
- Admin routes added to same service initially
- Reuse existing validation logic as source of truth

## Frontend
- React + TypeScript
- Tailwind CSS
- React Query
- React Hook Form
- Chart library: Recharts / ECharts / Chart.js

## Why this approach
- simpler deployment
- less moving pieces initially
- keeps config/metrics logic close to source of truth

---

# Validation Rules Strategy

## Backend is source of truth
The UI may do convenience validation, but final validation must happen in backend.

## Validation should return
- field path
- message
- severity (`error` / `warning`)
- optional code

## Examples
- missing target
- invalid expose path
- unknown namespace key
- dangerous purge configuration
- duplicate namespace names

---

# Security Requirements

## Minimum
- auth on all admin endpoints
- HTTPS in production
- do not expose secrets in plaintext
- audit log for sensitive operations
- confirmation for destructive/broad actions

## Secret handling
- show configured/not configured
- allow replace/reset
- do not reveal actual secret values after save

---

# MVP Recommendation

If building in the shortest sensible path, ship this first:

## Backend MVP
- config read
- config validate
- config save
- config reload
- health summary
- metrics summary
- purge endpoint with warnings

## Frontend MVP
- login/admin protection
- dashboard shell
- namespaces list
- namespace editor
- global settings page
- validate/apply flow
- basic metrics dashboard
- purge page with confirmations

---

# Suggested Task Breakdown for Agents

## Backend task bundle 1
- admin route scaffold
- auth middleware
- config read/validate/save/reload endpoints
- tests

## Frontend task bundle 1
- React admin shell
- navigation
- namespaces list
- namespace editor form

## Backend task bundle 2
- metrics summary + health endpoints
- startup summary endpoint
- tests

## Frontend task bundle 2
- metrics dashboard
- health page

## Backend task bundle 3
- purge admin endpoints
- warnings + audit hooks

## Frontend task bundle 3
- purge UI
- audit log UI

---

# Best Next Step

Start with a new doc:
**`docs/admin-api-design.md`**

That should define:
- endpoint specs
- request/response payloads
- auth model
- validation shape
- apply/reload semantics

Then implement backend config APIs before starting UI coding.

---

# Success Criteria

The admin UI effort is successful when a user can:
- create/edit a namespace from the browser
- validate config before saving
- safely apply config without manual YAML edits
- inspect metrics and health for each namespace
- perform purge actions with appropriate warnings
- understand what changed through logs/audit history
