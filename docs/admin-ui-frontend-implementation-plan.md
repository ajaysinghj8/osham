# Osham Admin UI Frontend Implementation Plan

## Purpose
Turn the existing admin UI docs into an implementation-ready frontend plan that fits the current Osham repository shape.

## Current repo reality
Osham is currently a **single-package backend TypeScript project**. There is no frontend app scaffold yet. Recent backend work already added:
- `GET /__osham/admin/config`
- `POST /__osham/admin/config/validate`
- `PUT /__osham/admin/config`
- `POST /__osham/admin/config/reload`

Those endpoints live in `src/middlewares/adminConfig.ts` and use a structured config shape close to the docs.

## Recommendation: frontend placement
Create a dedicated admin frontend under:

```text
osham/
  admin-ui/
```

This is better than forcing React into the root package because the root project is currently a clean backend package with Node 14-era tooling and no workspace setup. A sidecar app keeps frontend dependencies isolated and lowers risk.

## Recommended frontend stack
Use:
- **Vite + React + TypeScript**
- **React Router** for page routing
- **TanStack Query** for server state
- **React Hook Form** for forms
- **Zod** for client-side shaping and parsing of API responses
- **Tailwind CSS** for styling
- **shadcn/ui** style component patterns or small in-repo primitives
- **Recharts** for basic charts

### Why this stack
- Fast to scaffold
- Easy local dev against Osham backend
- Strong forms + async data patterns
- Low ceremony for an MVP admin console

---

# 1. Suggested project structure

```text
osham/
  admin-ui/
    index.html
    package.json
    tsconfig.json
    vite.config.ts
    postcss.config.js
    tailwind.config.ts
    src/
      main.tsx
      app/
        App.tsx
        router.tsx
        providers.tsx
        layouts/
          AdminLayout.tsx
          AuthGate.tsx
      pages/
        dashboard/
          DashboardPage.tsx
        config/
          ConfigOverviewPage.tsx
          GlobalSettingsPage.tsx
          NamespaceListPage.tsx
          NamespaceEditorPage.tsx
        metrics/
          MetricsPage.tsx
        health/
          HealthPage.tsx
        purge/
          PurgePage.tsx
        audit/
          AuditPage.tsx
        not-found/
          NotFoundPage.tsx
      components/
        app-shell/
          Sidebar.tsx
          Topbar.tsx
          PageHeader.tsx
          StatusBadge.tsx
        forms/
          FormField.tsx
          ArrayField.tsx
          ToggleField.tsx
          KeyValueList.tsx
          ValidationSummary.tsx
          DirtyStateBanner.tsx
        config/
          GlobalConfigForm.tsx
          NamespaceTable.tsx
          NamespaceCard.tsx
          NamespaceForm.tsx
          CacheSettingsSection.tsx
          RulesEditor.tsx
          AllowDenyEditor.tsx
          RevisionPill.tsx
        metrics/
          MetricCard.tsx
          NamespaceMetricsTable.tsx
          HitRatioChart.tsx
          RequestVolumeChart.tsx
        health/
          HealthSummaryPanel.tsx
          StartupSummaryPanel.tsx
          FeatureFlagsPanel.tsx
        purge/
          PurgeForm.tsx
          RiskWarningPanel.tsx
          ConfirmationDialog.tsx
        audit/
          AuditTable.tsx
        feedback/
          EmptyState.tsx
          ErrorState.tsx
          InlineAlert.tsx
          ToastViewport.tsx
          LoadingBlock.tsx
      lib/
        api/
          client.ts
          endpoints/
            admin-config.ts
            health.ts
            metrics.ts
            purge.ts
            audit.ts
          types.ts
          schemas.ts
          errors.ts
        config/
          env.ts
          nav.ts
        forms/
          config-defaults.ts
          namespace-mappers.ts
          validation-mappers.ts
        utils/
          format.ts
          paths.ts
          revisions.ts
          warnings.ts
      hooks/
        useAdminConfig.ts
        useValidateConfig.ts
        useSaveConfig.ts
        useApplyConfig.ts
        useMetricsSummary.ts
        useNamespaceMetrics.ts
        useHealth.ts
        useStartupSummary.ts
        usePurge.ts
        useAudit.ts
      state/
        editor-store.ts
        draft-store.ts
        ui-store.ts
      styles/
        globals.css
```

## Structure notes
- `pages/` holds route-level screens.
- `components/` holds reusable UI.
- `lib/api/` isolates all HTTP logic and response parsing.
- `hooks/` wraps TanStack Query usage and mutations.
- `state/` holds light client state only; avoid duplicating server state already owned by Query.

---

# 2. Route and screen map

## Route tree
```text
/admin
/admin/dashboard
/admin/config
/admin/config/global
/admin/config/namespaces
/admin/config/namespaces/new
/admin/config/namespaces/:namespaceId
/admin/metrics
/admin/health
/admin/purge
/admin/audit
```

## Screen responsibilities

### 2.1 Dashboard
**Goal:** fast operational overview.

**Show:**
- service health status
- config revision
- namespace count
- feature flags: health, metrics, purge, x-response-time, secure mode
- request totals, cache hits, misses, hit ratio, pooled requests, cache size
- recent warnings or startup warnings
- quick actions:
  - edit config
  - validate current draft
  - apply saved config
  - open purge tools

**Main components:**
- `MetricCard`
- `HealthSummaryPanel`
- `FeatureFlagsPanel`
- `RevisionPill`
- quick action button group

### 2.2 Config Overview
**Goal:** make config editing understandable before entering forms.

**Show:**
- current revision/meta
- unsaved draft state
- count of namespaces
- global toggle summary
- recent validation status
- links to global settings and namespace list

### 2.3 Global Settings
**Goal:** edit `globalConfig` fields safely.

**Fields based on current backend:**
- `version`
- `xResponseTime`
- `health`
- `metrics`
- `purge`
- `changeOrigin`
- read-only derived values:
  - `metricsPath`
  - `secure.enabled`
  - `secure.sslKeyConfigured`
  - `secure.sslCertConfigured`

**UX rules:**
- editable fields separated from read-only operational metadata
- secure info shown as status badges, never editable from MVP UI
- apply/validate buttons live in a sticky footer

### 2.4 Namespace List
**Goal:** make per-namespace config discoverable and manageable.

**Table columns:**
- namespace name
- expose path
- target
- timeout
- cache enabled
- rules count
- allow count
- deny count
- actions: edit, clone, disable/delete later

**Interactions:**
- search/filter by name or target
- “Create namespace”
- “Clone namespace” copies an existing config into a new draft

### 2.5 Namespace Editor
**Goal:** structured editor for namespace configuration.

**Sections:**
1. Basics
   - name
   - expose
   - target
   - port
   - timeout
   - followRedirects
   - changeOrigin
2. Default cache settings
   - cache enabled
   - expires
   - pool
   - query variation
   - header variation
3. Access control
   - allow patterns
   - deny patterns
4. Rules
   - rule pattern list
   - per-rule cache config
5. Advanced review
   - generated payload preview for this namespace

**Key opinion:** use a **single structured form** first. Do not start with YAML editing. Add raw preview only after structured editing is reliable.

### 2.6 Metrics
**Goal:** expose performance clearly.

**Show:**
- top-level metric cards
- namespace metrics table
- hit ratio chart
- requests by namespace chart
- pooled requests and cache size summaries

**Empty-state handling:**
- if metrics are disabled, show a clear explanatory panel instead of a blank page

### 2.7 Health
**Goal:** runtime confidence and diagnostics.

**Show:**
- service status
- uptime
- redis/connectivity status when available
- loaded config revision
- startup summary
- warnings returned by backend

### 2.8 Purge
**Goal:** safe destructive operation flow.

**Show:**
- pattern input
- dry-run placeholder state if endpoint arrives later
- warning banner area
- confirmation dialog for broad patterns
- result panel

**MVP UX rule:**
Require a second confirmation whenever the pattern contains `**`, a trailing `*`, or appears namespace-less.

### 2.9 Audit
**Goal:** visibility into admin actions.

**Show:**
- action
- time
- actor/source
- result
- details payload summary

**MVP fallback:** if endpoint is unavailable, stub this route behind a feature flag and show “backend support pending”.

---

# 3. State and data model

## 3.1 Server state vs client state
Use **TanStack Query** for server state:
- current config
- metrics summary
- namespace metrics
- health
- startup summary
- audit log

Use small local state/store only for:
- unsaved editor draft
- active namespace being edited
- dirty flags
- modal visibility
- validation result mapping

## 3.2 Frontend core types

```ts
type AdminMeta = {
  source: string
  lastLoadedAt: string
  lastAppliedAt: string | null
  revision: string
}

type GlobalConfigViewModel = {
  version: string
  xResponseTime: boolean
  health: boolean
  metrics: boolean
  purge: boolean
  changeOrigin: boolean
  metricsPath?: string
  secure?: {
    enabled: boolean
    sslKeyConfigured: boolean
    sslCertConfigured: boolean
  }
}

type CacheOptionsForm = {
  enabled: boolean
  expires?: string
  pool?: boolean
  queryMode: 'disabled' | 'all' | 'custom'
  queryKeys: string[]
  headerMode: 'disabled' | 'all' | 'custom'
  headerKeys: string[]
}

type RuleForm = {
  id: string
  pattern: string
  cache: CacheOptionsForm
}

type NamespaceFormModel = {
  name: string
  expose: string
  target: string
  port?: number
  timeout?: number
  followRedirects?: boolean
  changeOrigin?: boolean
  allow: string[]
  deny: string[]
  cache: CacheOptionsForm
  rules: RuleForm[]
}

type AdminConfigDraft = {
  globalConfig: GlobalConfigViewModel
  namespaces: NamespaceFormModel[]
  meta: AdminMeta
}
```

## 3.3 Why use form view-models instead of raw API shape
The raw backend shape is optimized for config/runtime, not UX.

Examples:
- `cache` can be `false | object` in API, but UI needs a stable object with an `enabled` switch.
- `rules` are currently object-like in runtime shape, but UI editing is easier as an ordered array.
- namespace names are map keys in API, but UI forms need `name` as a field.

So the frontend should use mappers:
- API response -> form model
- form model -> API payload

Keep those mappers in one place:
- `lib/forms/namespace-mappers.ts`

---

# 4. API client layout

## 4.1 Base API client
Create a small fetch wrapper in `lib/api/client.ts`.

Responsibilities:
- prepend base path
- attach `x-osham-admin-secret` when provided
- parse JSON safely
- normalize error shape
- allow abort signal usage

```ts
export type ApiClientOptions = {
  baseUrl?: string
  adminSecret?: string
}
```

## 4.2 Endpoint modules

### `lib/api/endpoints/admin-config.ts`
Expose:
- `getAdminConfig()`
- `validateAdminConfig(config)`
- `saveAdminConfig(config, expectedRevision)`
- `reloadAdminConfig(expectedRevision?)`

### `lib/api/endpoints/health.ts`
Expose:
- `getHealth()`
- `getStartupSummary()`

### `lib/api/endpoints/metrics.ts`
Expose:
- `getMetricsSummary()`
- `getNamespaceMetrics()`

### `lib/api/endpoints/purge.ts`
Expose:
- `runPurge(payload)`

### `lib/api/endpoints/audit.ts`
Expose:
- `getAuditLog()`

## 4.3 Response parsing
Use Zod schemas for API responses in `lib/api/schemas.ts`.

This is worth it because the backend is evolving and schema drift is one of the main risks already identified in the PRD.

## 4.4 Auth handling
For MVP, store the admin secret in memory for the session only.

Suggested approach:
- first-load prompt or login screen that asks for admin secret
- save in React state + `sessionStorage`
- never persist to localStorage by default

If the request gets `401`, redirect back to the auth gate and clear the stored secret.

---

# 5. Form design details

## 5.1 Global config form sections
1. Core
   - version
2. Runtime features
   - health
   - metrics
   - purge
   - xResponseTime
   - changeOrigin
3. Read-only environment/secure status
   - metrics path
   - secure enabled
   - cert/key configured

## 5.2 Namespace form sections

### Basics
- namespace name
- expose path
- target URL
- port
- timeout
- follow redirects
- change origin

### Cache defaults
- cache enabled
- expires
- pool
- query variation:
  - disabled
  - custom list
- header variation:
  - disabled
  - custom list

### Access control
- allow list editor
- deny list editor
- helper text explaining deny precedence

### Rules editor
Each row should allow:
- rule pattern
- cache enabled
- cache expiry
- pool
- query keys
- header keys
- remove/reorder

## 5.3 Validation rendering
Backend returns field-level errors/warnings. Normalize them into UI paths.

Examples:
- `namespaces.api.target`
- `global.health`

Map backend paths to form fields:
- current namespace screen should show inline messages for matching paths
- also show a page-level `ValidationSummary` panel for all errors/warnings

## 5.4 Save / validate / apply flow
Recommended user flow:
1. user edits draft
2. clicks **Validate**
3. inline errors and warnings appear
4. if valid, **Save** becomes primary
5. after save success, show new revision from response
6. user clicks **Apply** / **Reload**
7. show backend note about restart requirement if returned

Important repo-specific note:
Current backend `POST /config/reload` updates admin state but does **not fully rebuild runtime middleware**, so frontend copy should say:
- **Saved to config file**
- **Admin state reloaded**
- **Server restart may still be required for routing changes**

That avoids lying to operators.

---

# 6. Query keys and hook plan

## Query keys
```ts
const queryKeys = {
  config: ['admin-config'],
  health: ['health'],
  startupSummary: ['startup-summary'],
  metricsSummary: ['metrics-summary'],
  namespaceMetrics: ['namespace-metrics'],
  audit: ['audit'],
}
```

## Hooks
- `useAdminConfig()`
- `useValidateConfig()`
- `useSaveConfig()`
- `useApplyConfig()`
- `useHealth()`
- `useStartupSummary()`
- `useMetricsSummary()`
- `useNamespaceMetrics()`
- `usePurge()`
- `useAudit()`

### Mutation behavior
- after save: invalidate `config`
- after apply: invalidate `config`, `health`, `startupSummary`
- after purge: optionally invalidate `metricsSummary` and `namespaceMetrics`

---

# 7. Phased execution notes

## Phase A — frontend scaffold and API contract lock
**Goal:** make the app boot and talk to current backend.

### Tasks
- scaffold `admin-ui/` with Vite React TS
- add Tailwind
- add Router + Query provider
- implement auth gate for admin secret
- implement base fetch client and config endpoints
- add Zod schemas for currently available endpoints
- create `AdminLayout` + nav shell

### Done when
- app runs locally
- can load `/__osham/admin/config`
- can show auth errors cleanly

## Phase B — config editor MVP
**Goal:** let users view/edit/validate/save current config.

### Tasks
- build Config Overview
- build Global Settings page
- build Namespace List page
- build Namespace Editor page
- implement API<->form mappers
- wire validate/save/reload actions
- add dirty-state banner and revision display

### Done when
- operator can edit one namespace and save it
- operator can validate and see field warnings/errors
- UI displays restart note after apply/reload if returned

## Phase C — dashboard, metrics, health
**Goal:** make the UI useful day-to-day.

### Depends on backend
- `/health`
- `/startup-summary`
- `/metrics/summary`
- `/metrics/namespaces`

### Tasks
- dashboard cards
- health page
- metrics page with table + 1–2 simple charts
- empty states when metrics disabled/unavailable

## Phase D — purge operations
**Goal:** safe destructive workflows.

### Depends on backend
- `/purge`

### Tasks
- purge page
- warnings/confirmation UX
- result rendering
- broad-pattern risk highlighting

## Phase E — audit + hardening
**Goal:** operational trust.

### Depends on backend
- `/audit`
- optional stronger revision semantics

### Tasks
- audit page
- revision conflict UX
- stale draft recovery UX
- optional import/export and read-only modes later

---

# 8. Concrete component breakdown by screen

## Dashboard
- `MetricCard`
- `HealthSummaryPanel`
- `FeatureFlagsPanel`
- `RevisionPill`
- `InlineAlert` for warnings

## Namespace List
- `NamespaceTable`
- `StatusBadge`
- `PageHeader`
- `EmptyState`

## Namespace Editor
- `NamespaceForm`
- `CacheSettingsSection`
- `AllowDenyEditor`
- `RulesEditor`
- `ValidationSummary`
- `DirtyStateBanner`

## Global Settings
- `GlobalConfigForm`
- `ValidationSummary`
- `RevisionPill`

## Metrics
- `MetricCard`
- `NamespaceMetricsTable`
- `HitRatioChart`
- `RequestVolumeChart`

## Health
- `HealthSummaryPanel`
- `StartupSummaryPanel`
- `FeatureFlagsPanel`

## Purge
- `PurgeForm`
- `RiskWarningPanel`
- `ConfirmationDialog`

## Audit
- `AuditTable`

---

# 9. Implementation cautions specific to Osham

## 9.1 API/shape drift is likely
The docs describe a slightly broader model than the currently shipped backend. Frontend should code to **current endpoint behavior first**, while keeping extension points for:
- startup summary
- metrics summary
- namespace metrics
- purge
- audit

## 9.2 Rules shape may need adapter logic
Runtime config rules are object-keyed by pattern, but UI editing is easier as arrays. Do not spread this conversion logic across forms; centralize it.

## 9.3 Apply semantics are not full live-apply yet
The current backend note says routing changes still require restart. The frontend must surface this as a warning banner after apply/reload responses.

## 9.4 Node 14 compatibility at repo root
Because the backend package targets older Node tooling, keeping the frontend in `admin-ui/` avoids destabilizing the current build scripts.

---

# 10. Suggested initial ticket breakdown

## Ticket FE-1: scaffold admin UI app
- create `admin-ui/`
- add Vite React TS
- add Tailwind, Router, Query
- add admin layout and nav

## Ticket FE-2: API client and schemas
- build fetch wrapper
- add config endpoint module
- add response schemas and error normalization

## Ticket FE-3: auth gate
- admin secret prompt
- session storage restore
- 401 reset flow

## Ticket FE-4: config overview + global settings
- current config load
- globalConfig form
- validation summary rendering

## Ticket FE-5: namespace list + editor
- namespace table
- namespace form
- clone/create draft flow
- mapper layer

## Ticket FE-6: validate/save/apply workflow
- buttons, toasts, dirty state, revision update
- restart-required copy handling

## Ticket FE-7: dashboard and health
- depends on backend health/startup endpoints

## Ticket FE-8: metrics page
- depends on backend metrics endpoints

## Ticket FE-9: purge page
- depends on backend purge endpoint

## Ticket FE-10: audit page + conflicts
- depends on audit endpoint and stronger revision flow

---

# 11. MVP delivery recommendation
If only one frontend milestone is built first, build this exact slice:
- auth gate
- admin shell
- config fetch
- global settings page
- namespace list
- namespace editor
- validate/save/reload flow

That gives Osham a real admin UI before metrics/purge/audit land.

---

# 12. Definition of done for first frontend milestone
The first frontend milestone is complete when:
- a new `admin-ui/` app exists and builds independently
- operator can authenticate with the admin secret
- current structured config loads from backend
- global settings and namespaces are editable in structured forms
- validate/save/reload actions work against existing admin endpoints
- validation warnings/errors render both inline and in summary form
- revision metadata is visible
- restart-required behavior is communicated honestly
