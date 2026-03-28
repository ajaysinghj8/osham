# Osham Admin UI PRD

## Title
Osham Admin Console

## Summary
Build a web-based admin console for Osham so operators can manage config, inspect metrics, monitor health, and perform operational actions like purge safely from a browser.

The admin console should reduce manual YAML editing, improve confidence in config changes, and make Osham easier to operate in real deployments.

---

## Problem Statement
Today, Osham is configured primarily through file-based configuration and operational knowledge. That works for technical users, but it creates friction:

- config changes require manual editing
- invalid config can be harder to recover from
- metrics are available but not presented in a UI-friendly way
- operational actions like purge need safer, more discoverable workflows
- domain/namespace-level behavior is powerful but not easily manageable visually

There is an opportunity to turn Osham into a more complete operational product by adding an admin console.

---

## Product Vision
Osham Admin Console should let a user:
- view the currently active config
- create and edit namespace/domain-level config from a UI
- validate changes before saving
- safely apply config changes
- inspect health and metrics at both global and namespace levels
- perform purge actions with warnings and confirmation
- understand recent operational changes via audit visibility

---

## Goals

### Primary goals
1. **Config from UI**
   - users can create/edit namespace and global config from the browser

2. **Safe config lifecycle**
   - validate before apply
   - clear errors and warnings
   - protect against invalid or stale changes

3. **Operational visibility**
   - dashboard for health and metrics
   - namespace-level insights

4. **Safe operations**
   - purge with warnings and confirmation
   - admin-only access

### Secondary goals
- improve onboarding for new operators
- make Osham more suitable for managed/internal platform use
- create a path toward rollback/version history later

---

## Non-Goals (Initial Versions)
- advanced RBAC with many user roles
- enterprise SSO/OAuth in MVP
- multi-cluster or multi-environment management
- full visual rollback/version diff in MVP
- highly customized dashboards in MVP

---

## Target Users

### 1. Developer/operator
A developer running Osham locally or in a team environment who wants easy config management and observability.

### 2. Platform engineer
Someone operating Osham as infrastructure who needs safer config apply workflows and better visibility.

### 3. API operator
A user managing multiple namespaces/domains who wants to tune caching, allow/deny, and routing behavior per namespace.

---

## User Stories

### Config management
- As an operator, I want to see the current Osham config in structured form.
- As an operator, I want to edit a namespace without manually editing YAML.
- As an operator, I want to validate config before applying it.
- As an operator, I want clear field-level errors when config is invalid.
- As an operator, I want to manage allow/deny lists from UI.

### Observability
- As an operator, I want to see cache hits/misses and hit ratio.
- As an operator, I want to inspect namespace-level activity.
- As an operator, I want to see health and startup summary in one place.

### Operations
- As an operator, I want to purge cache safely from the UI.
- As an operator, I want warnings before dangerous wildcard purges.
- As an operator, I want an audit trail of config changes and purge actions.

---

## Functional Requirements

## 1. Admin authentication
- All admin routes must be protected.
- MVP may use shared secret header/env-based auth.
- Future versions may support session/JWT/SSO auth.

## 2. Config read API
- UI can fetch current structured config.
- Response includes global config, namespaces, and metadata.
- Secret values must not be returned in plaintext.

## 3. Config validate API
- UI can validate a proposed config payload.
- Response includes structured errors and warnings.
- Validation covers required fields, types, allow/deny shape, unknown keys, and config semantics.

## 4. Config save API
- UI can save config changes safely.
- Save should use atomic writes where applicable.
- Revision-aware save is recommended.

## 5. Config reload/apply API
- UI can apply saved config to the running service.
- Apply result includes success/failure and warnings.

## 6. Namespace editor
- UI supports create/edit/update for namespace config.
- Must support core fields:
  - name
  - expose
  - target
  - timeout
  - cache settings
  - allow / deny
  - rules

## 7. Global settings editor
- UI supports toggling/editing top-level settings such as:
  - health
  - metrics
  - purge
  - metrics path
  - startup visibility metadata

## 8. Metrics dashboard
- UI shows top-level metrics:
  - requests
  - cache hits/misses
  - hit ratio
  - pooled requests
  - cache size
- UI shows namespace-level metrics where possible.

## 9. Health and diagnostics
- UI shows health status.
- UI shows startup summary.
- UI shows config warnings where relevant.

## 10. Purge tools
- UI supports purge by key/pattern.
- UI shows broad pattern warnings.
- UI requires confirmation for risky purges.

## 11. Audit visibility
- UI shows recent config apply/save actions and purge actions.

---

## UX / Screen Requirements

### Dashboard
Show:
- service health
- feature flags enabled
- total namespaces
- requests / hits / misses / hit ratio
- quick links to config, metrics, purge

### Namespaces screen
Show:
- namespace list
- expose path
- target
- cache status
- actions (edit, clone, disable, delete if supported)

### Namespace editor screen
Show editable form fields for:
- name
- expose
- target
- timeout
- cache settings
- rules
- allow / deny
- advanced options as collapsible sections

### Global settings screen
Show:
- health/metrics/purge toggles
- metrics path
- secure mode visibility/status
- masked secret status

### Metrics screen
Show:
- dashboard cards
- namespace metrics table
- optional charts for traffic/hit ratio/latency

### Health / diagnostics screen
Show:
- health result
- startup summary
- warnings
- config revision metadata

### Purge screen
Show:
- pattern input
- safety warnings
- confirmation UX
- result feedback

### Audit log screen
Show:
- recent actions
- timestamps
- actor/source
- outcome

---

## Technical Approach

## Architecture recommendation
Use a two-part architecture:
1. **Admin API inside Osham backend**
2. **React-based admin UI**

This keeps the source of truth close to runtime behavior and avoids a separate backend service initially.

## Why this approach
- lower deployment complexity
- easier reuse of existing validation logic
- direct access to metrics and startup info
- simpler long-term maintenance for MVP

---

## API Scope
The following endpoints are expected in the admin API:

### Config
- `GET /__osham/admin/config`
- `POST /__osham/admin/config/validate`
- `PUT /__osham/admin/config`
- `POST /__osham/admin/config/reload`

### Metrics
- `GET /__osham/admin/metrics/summary`
- `GET /__osham/admin/metrics/namespaces`

### Health
- `GET /__osham/admin/health`
- `GET /__osham/admin/startup-summary`

### Purge
- `POST /__osham/admin/purge`

### Audit
- `GET /__osham/admin/audit`

Detailed contracts are specified in `docs/admin-api-design.md`.

---

## Security Requirements
- admin endpoints require authentication
- secrets must not be exposed in plaintext
- purge/config operations should be audited
- risky/broad purges should return warnings and require confirmation
- HTTPS should be used in production

---

## Validation Requirements
Backend validation is source of truth.

Validation should support:
- required field checking
- type checking
- unknown-key warnings/errors
- allow/deny validation
- cache/rules validation
- clear field-path responses for UI rendering

---

## MVP Definition

### Backend MVP
- admin auth
- config read/validate/save/reload endpoints
- health summary endpoint
- metrics summary endpoint
- purge endpoint with warnings

### Frontend MVP
- admin shell/navigation
- namespaces list
- namespace editor
- global settings editor
- validate/apply workflow
- basic metrics dashboard
- purge page with warnings

MVP does **not** require:
- rollback UI
- multi-user collaboration controls
- advanced charting
- enterprise auth

---

## Success Metrics
The Admin Console is successful if operators can:
- update namespace config without editing YAML manually
- validate and apply config safely
- understand cache/health state from the dashboard
- perform purge with appropriate safety guidance
- manage Osham faster and with fewer operator mistakes

Possible measurable indicators:
- lower time to make config changes
- fewer invalid config startup failures
- faster diagnosis of cache/health issues
- fewer risky purge mistakes

---

## Delivery Phases

### Phase 1
- admin API foundation
- config read/validate/save/reload

### Phase 2
- namespace/global config UI
- validate/save/apply UX

### Phase 3
- metrics and health UI

### Phase 4
- purge UI + audit visibility

### Phase 5
- hardening, revision control, rollback, read-only mode

---

## Risks
- config reload safety
- stale writes / concurrent edits
- YAML persistence and formatting drift
- secret handling mistakes
- purge actions affecting too much data
- frontend/backend schema drift

## Mitigations
- structured backend validation
- revision tokens for writes
- atomic saves
- secret masking
- warnings + confirmations
- audit logging

---

## Dependencies
- existing structured config model in Osham
- validation logic already present in backend
- metrics support already present in Osham
- purge safeguards already in progress

---

## Best Next Step
Start implementation with:
- **Task Bundle 1 + 2** from `docs/admin-ui-agent-task-list.md`

That means:
- admin API scaffold
- admin auth middleware
- config read/validate/save/reload endpoints
- tests

This gives the project its first real UI-enabling backend milestone.
