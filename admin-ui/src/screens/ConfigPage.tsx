import React from 'react';
import { dump, load } from 'js-yaml';
import { ApiError, apiGet, apiPost, apiPut } from '../api';
import {
  AdminConfigSnapshot,
  AdminConfigView,
  CacheConfigView,
  NamespaceView,
  ValidationResult,
} from '../types';
import { Page } from '../ui/Page';

// ─── Pure helpers (unchanged) ────────────────────────────────────
function toLines(value: string): string[] {
  return value.split('\n').map(l => l.trim()).filter(Boolean);
}
function fromLines(value?: string[]): string {
  return (value || []).join('\n');
}

type CacheSource =
  | NamespaceView['cache']
  | { expires?: string | number; pool?: boolean; query?: string[] | false; headers?: string[] | false }
  | false
  | undefined;

function toCacheView(cache: CacheSource): CacheConfigView {
  if (!cache) return { enabled: false, expires: '', pool: false, query: [], headers: [] };
  return {
    enabled: true,
    expires: cache.expires ? String(cache.expires) : '',
    pool: !!cache.pool,
    query: Array.isArray(cache.query) ? cache.query : [],
    headers: Array.isArray(cache.headers) ? cache.headers : [],
  };
}

function toRuleViews(
  rules: NamespaceView['rules'] | Record<string, { cache?: CacheSource }> | undefined,
): NamespaceView['rules'] {
  if (!rules) return [];
  if (Array.isArray(rules)) return rules.map(r => ({ pattern: r.pattern, cache: toCacheView(r.cache) }));
  return Object.entries(rules).map(([pattern, rule]) => ({ pattern, cache: toCacheView(rule?.cache) }));
}

function normalizeConfig(data: AdminConfigView): AdminConfigView {
  return {
    ...data,
    namespaces: Object.fromEntries(
      Object.entries(data.namespaces || {}).map(([name, ns]) => [
        name,
        {
          expose: ns.expose || '',
          target: ns.target || '',
          port: ns.port ? String(ns.port) : '',
          timeout: ns.timeout ? String(ns.timeout) : '',
          followRedirects: !!ns.followRedirects,
          changeOrigin: !!ns.changeOrigin,
          allow: ns.allow || [],
          deny: ns.deny || [],
          cache: toCacheView(ns.cache),
          rules: toRuleViews(ns.rules),
        },
      ]),
    ),
  };
}

function buildPayload(config: AdminConfigView) {
  const namespaces = Object.fromEntries(
    Object.entries(config.namespaces).map(([name, ns]) => {
      const built: Record<string, unknown> = { expose: ns.expose, target: ns.target };
      if (ns.port) built.port = Number(ns.port);
      if (ns.timeout) built.timeout = Number(ns.timeout);
      if (ns.followRedirects) built.followRedirects = true;
      if (ns.changeOrigin) built.changeOrigin = true;
      if (ns.allow.length) built.allow = ns.allow;
      if (ns.deny.length) built.deny = ns.deny;
      if (ns.cache.enabled) {
        built.cache = {
          ...(ns.cache.expires ? { expires: ns.cache.expires } : {}),
          ...(ns.cache.pool ? { pool: true } : {}),
          ...(ns.cache.query.length ? { query: ns.cache.query } : {}),
          ...(ns.cache.headers.length ? { headers: ns.cache.headers } : {}),
        };
      } else {
        built.cache = false;
      }
      const validRules = ns.rules.filter(r => r.pattern?.trim());
      if (validRules.length) {
        built.rules = Object.fromEntries(
          validRules.map(r => [
            r.pattern,
            {
              cache: r.cache.enabled
                ? {
                    ...(r.cache.expires ? { expires: r.cache.expires } : {}),
                    ...(r.cache.pool ? { pool: true } : {}),
                    ...(r.cache.query.length ? { query: r.cache.query } : {}),
                    ...(r.cache.headers.length ? { headers: r.cache.headers } : {}),
                  }
                : false,
            },
          ]),
        );
      }
      return [name, built];
    }),
  );
  return {
    globalConfig: {
      version: config.globalConfig.version,
      xResponseTime: config.globalConfig.xResponseTime,
      health: config.globalConfig.health,
      purge: config.globalConfig.purge,
      metrics: config.globalConfig.metrics,
      changeOrigin: config.globalConfig.changeOrigin,
    },
    namespaces,
  };
}

function cloneNamespaceView(ns: NamespaceView): NamespaceView {
  return {
    ...ns,
    allow: [...ns.allow],
    deny: [...ns.deny],
    cache: { ...ns.cache, query: [...ns.cache.query], headers: [...ns.cache.headers] },
    rules: ns.rules.map(r => ({ pattern: r.pattern, cache: { ...r.cache, query: [...r.cache.query], headers: [...r.cache.headers] } })),
  };
}

function isAdminConfigView(v: unknown): v is AdminConfigView {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const r = v as Record<string, unknown>;
  return !!r.globalConfig && !!r.namespaces;
}

function toDraftAdminConfigView(parsed: unknown, currentMeta: AdminConfigView['meta'] | undefined): AdminConfigView {
  const fallbackMeta = currentMeta || { source: 'imported draft', lastLoadedAt: new Date().toISOString(), lastAppliedAt: null, revision: 'imported-draft' };
  if (isAdminConfigView(parsed)) return normalizeConfig({ ...parsed, meta: parsed.meta || fallbackMeta });
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Imported file must be a JSON or YAML object.');
  const { version, xResponseTime, health, purge, metrics, changeOrigin, ...namespaces } = parsed as Record<string, unknown>;
  return normalizeConfig({
    globalConfig: {
      version: typeof version === 'string' ? version : '',
      xResponseTime: xResponseTime === true,
      health: health === true,
      purge: purge === true,
      metrics: metrics === true,
      changeOrigin: changeOrigin === true,
    },
    namespaces: namespaces as AdminConfigView['namespaces'],
    meta: fallbackMeta,
  });
}

function downloadDraftConfig(config: AdminConfigView, format: 'json' | 'yaml') {
  const payload = buildPayload(config);
  const content = format === 'yaml' ? dump(payload, { noRefs: true, lineWidth: 120 }) : JSON.stringify(payload, null, 2);
  const blob = new Blob([content], { type: format === 'yaml' ? 'application/x-yaml' : 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `osham-config-${config.meta.revision || 'draft'}.${format === 'yaml' ? 'yml' : 'json'}`; a.click();
  URL.revokeObjectURL(url);
}

function getIssuesForPaths(validation: ValidationResult | null, paths: string[]): ValidationResult['errors'] {
  if (!validation) return [];
  const ps = paths.filter(Boolean);
  return [...validation.errors, ...validation.warnings].filter(i => ps.some(p => i.field === p || i.field.startsWith(`${p}.`)));
}

// ─── Small shared components ─────────────────────────────────────
function FieldIssues({ issues }: { issues: ValidationResult['errors'] }) {
  if (!issues.length) return null;
  return (
    <div className="field-issues">
      {issues.map((issue, i) => (
        <div key={`${issue.code}-${issue.field}-${i}`} className={`field-issue field-issue--${issue.severity}`}>{issue.message}</div>
      ))}
    </div>
  );
}

function ChevronDown() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CollapsibleSection({ title, badge, defaultOpen = false, children }: {
  title: string; badge?: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="collapsible">
      <button className="collapsible__header" onClick={() => setOpen(o => !o)}>
        <span className="collapsible__title">{title}</span>
        {badge && <span className="collapsible__badge">{badge}</span>}
        <span className={`collapsible__chevron${open ? ' open' : ''}`}><ChevronDown /></span>
      </button>
      {open && <div className="collapsible__body">{children}</div>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────
export function ConfigPage() {
  // Config state
  const [config, setConfig]                     = React.useState<AdminConfigView | null>(null);
  const [history, setHistory]                   = React.useState<AdminConfigSnapshot[]>([]);
  const [selectedNamespace, setSelectedNamespace] = React.useState<string>('');
  const [allowText, setAllowText]               = React.useState('');
  const [denyText, setDenyText]                 = React.useState('');
  const [rulesText, setRulesText]               = React.useState('[]');
  const [validation, setValidation]             = React.useState<ValidationResult | null>(null);
  const [message, setMessage]                   = React.useState<string | null>(null);
  const [error, setError]                       = React.useState<string | null>(null);
  const [busy, setBusy]                         = React.useState<string | null>(null);
  const [lastSavedSnapshot, setLastSavedSnapshot] = React.useState<string>('');
  const importInputRef = React.useRef<HTMLInputElement | null>(null);

  // UI state (Phase 2)
  const [tab, setTab]               = React.useState<'global' | 'namespaces' | 'history'>('global');
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewFormat, setPreviewFormat] = React.useState<'yaml' | 'json'>('yaml');

  // ── Load ──────────────────────────────────────────────────────
  const loadConfig = React.useCallback(async () => {
    try {
      const [configData, historyData] = await Promise.all([
        apiGet<AdminConfigView>('/__osham/admin/config'),
        apiGet<AdminConfigSnapshot[]>('/__osham/admin/config/history'),
      ]);
      const data = normalizeConfig(configData);
      setConfig(data);
      setHistory(historyData);
      setSelectedNamespace(current => (current && data.namespaces[current] ? current : Object.keys(data.namespaces)[0] || ''));
      setValidation(null);
      setError(null);
      setLastSavedSnapshot(JSON.stringify(buildPayload(data), null, 2));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load config');
    }
  }, []);

  React.useEffect(() => { loadConfig(); }, [loadConfig]);

  const namespace = config && selectedNamespace ? config.namespaces[selectedNamespace] : null;

  React.useEffect(() => {
    if (!namespace) return;
    setAllowText(fromLines(namespace.allow));
    setDenyText(fromLines(namespace.deny));
    setRulesText(JSON.stringify(namespace.rules, null, 2));
  // Only reset text areas when the user switches to a different namespace.
  // Omitting `namespace` from deps intentionally — we do NOT want to reset
  // the text areas whenever config mutates (e.g. after save/patch), only
  // when the selection itself changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNamespace]);

  // ── Patchers ──────────────────────────────────────────────────
  function patchConfig(updater: (c: AdminConfigView) => AdminConfigView) {
    setConfig(c => (c ? updater(c) : c));
  }
  function patchNamespace(updater: (ns: NamespaceView) => NamespaceView) {
    if (!config || !selectedNamespace) return;
    patchConfig(c => ({ ...c, namespaces: { ...c.namespaces, [selectedNamespace]: updater(c.namespaces[selectedNamespace]) } }));
  }

  // ── Sync + preview ────────────────────────────────────────────
  function buildSyncedConfigSnapshot(current: AdminConfigView): AdminConfigView {
    if (!selectedNamespace || !current.namespaces[selectedNamespace]) return current;
    const parsedRules = JSON.parse(rulesText) as NamespaceView['rules'];
    if (!Array.isArray(parsedRules)) throw new Error('Rules JSON must be an array');
    return {
      ...current,
      namespaces: {
        ...current.namespaces,
        [selectedNamespace]: {
          ...current.namespaces[selectedNamespace],
          allow: toLines(allowText),
          deny: toLines(denyText),
          rules: parsedRules.map(r => ({ pattern: r.pattern, cache: toCacheView(r.cache) })),
        },
      },
    };
  }

  function syncTextAreas() {
    if (!config) return null;
    try {
      const next = buildSyncedConfigSnapshot(config);
      setConfig(next);
      return next;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rules JSON is invalid');
      return null;
    }
  }

  const previewState = React.useMemo(() => {
    if (!config) return null;
    try {
      const payload = buildPayload(buildSyncedConfigSnapshot(config));
      return { rawJson: JSON.stringify(payload, null, 2), rawYaml: dump(payload, { noRefs: true, lineWidth: 120 }), error: null as string | null };
    } catch (err) {
      const payload = buildPayload(config);
      return { rawJson: JSON.stringify(payload, null, 2), rawYaml: dump(payload, { noRefs: true, lineWidth: 120 }), error: err instanceof Error ? err.message : 'Rules JSON is invalid' };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowText, config, denyText, rulesText, selectedNamespace]);

  const currentPayload = previewState?.rawJson || '';
  const hasUnsavedChanges = !!config && currentPayload !== lastSavedSnapshot;

  React.useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) { if (hasUnsavedChanges) { e.preventDefault(); e.returnValue = ''; } }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [hasUnsavedChanges]);

  // ── Actions ───────────────────────────────────────────────────
  function issuesForGlobalField(field: string) {
    return getIssuesForPaths(validation, [field, `globalConfig.${field}`, `global.${field}`]);
  }
  function issuesForNamespaceField(field: string) {
    if (!selectedNamespace) return [];
    return getIssuesForPaths(validation, [`namespaces.${selectedNamespace}.${field}`]);
  }

  async function runValidate() {
    if (!config) return;
    const synced = syncTextAreas();
    if (!synced) return;
    setBusy('validate'); setMessage(null); setError(null);
    try {
      const result = await apiPost<ValidationResult>('/__osham/admin/config/validate', { config: buildPayload(synced) });
      setValidation(result);
      setMessage(result.valid ? 'Validation passed.' : 'Validation failed. Review the issues below.');
    } catch (err) { setError(err instanceof Error ? err.message : 'Validation failed'); }
    finally { setBusy(null); }
  }

  async function runSave() {
    if (!config) return;
    const synced = syncTextAreas();
    if (!synced) return;
    setBusy('save'); setMessage(null); setError(null);
    try {
      const data = await apiPut<{ saved: boolean; revision: string; warnings: { message: string }[] }>(
        '/__osham/admin/config',
        { config: buildPayload(synced), expectedRevision: synced.meta.revision },
      );
      setMessage(`Saved — revision ${data.revision}.`);
      await loadConfig();
      if (data.warnings?.length) {
        setValidation({ valid: true, errors: [], warnings: data.warnings.map(w => ({ field: 'config', message: w.message, severity: 'warning', code: 'SAVE_WARNING' })) });
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'REVISION_CONFLICT') setError('Save blocked: config changed elsewhere. Refresh and re-apply your edits.');
      else setError(err instanceof Error ? err.message : 'Save failed');
    } finally { setBusy(null); }
  }

  async function runReload() {
    if (hasUnsavedChanges) { setError('Reload blocked — save or reset your draft first.'); return; }
    setBusy('reload'); setMessage(null); setError(null);
    try {
      const data = await apiPost<{ applied: boolean; revision: string; note?: string }>('/__osham/admin/config/reload', { expectedRevision: config?.meta.revision });
      setMessage(data.note || `Reloaded at revision ${data.revision}.`);
      await loadConfig();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'REVISION_CONFLICT') setError('Reload blocked: another change landed first. Refresh first.');
      else setError(err instanceof Error ? err.message : 'Reload failed');
    } finally { setBusy(null); }
  }

  async function runRollback(snapshot: AdminConfigSnapshot) {
    if (!config) return;
    if (hasUnsavedChanges) { setError('Rollback blocked — save or reset your draft first.'); return; }
    if (!window.confirm(`Roll back from ${config.meta.revision} → ${snapshot.revision}?\nThis immediately rewrites cache-config.yml.`)) return;
    setBusy(`rollback:${snapshot.revision}`); setMessage(null); setError(null);
    try {
      const data = await apiPost<{ applied: boolean; revision: string; note?: string }>('/__osham/admin/config/rollback', { revision: snapshot.revision, expectedRevision: config.meta.revision });
      setMessage(data.note || `Rolled back to revision ${data.revision}.`);
      await loadConfig();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'REVISION_CONFLICT') setError('Rollback blocked: another change landed first. Refresh first.');
      else setError(err instanceof Error ? err.message : 'Rollback failed');
    } finally { setBusy(null); }
  }

  function addNamespace() {
    const name = window.prompt('Namespace name');
    if (!name || !config || config.namespaces[name]) return;
    patchConfig(c => ({ ...c, namespaces: { ...c.namespaces, [name]: { expose: '/api/*', target: 'http://localhost:3000', port: '', timeout: '', followRedirects: false, changeOrigin: false, allow: [], deny: [], cache: { enabled: true, expires: '', pool: false, query: [], headers: [] }, rules: [] } } }));
    setSelectedNamespace(name);
    setTab('namespaces');
  }

  function cloneNamespace() {
    if (!config || !namespace || !selectedNamespace) return;
    const name = window.prompt('Clone namespace as', `${selectedNamespace}-copy`);
    if (!name || config.namespaces[name]) return;
    patchConfig(c => ({ ...c, namespaces: { ...c.namespaces, [name]: cloneNamespaceView(c.namespaces[selectedNamespace]) } }));
    setSelectedNamespace(name);
    setMessage(`Cloned ${selectedNamespace} → ${name}.`);
  }

  function deleteNamespace() {
    if (!config || !namespace || !selectedNamespace) return;
    if (!window.confirm(`Delete namespace "${selectedNamespace}"? Only affects the draft until you save.`)) return;
    const names = Object.keys(config.namespaces).filter(n => n !== selectedNamespace);
    patchConfig(c => { const next = { ...c.namespaces }; delete next[selectedNamespace]; return { ...c, namespaces: next }; });
    setSelectedNamespace(names[0] || '');
    setMessage(`Removed "${selectedNamespace}" from draft. Save to persist.`);
  }

  function resetDraft() {
    if (!hasUnsavedChanges) return;
    if (!window.confirm('Discard draft changes and reload the live config?')) return;
    setMessage('Draft discarded.'); setValidation(null); setError(null);
    void loadConfig();
  }

  function exportDraft() {
    if (!config) return;
    const synced = syncTextAreas();
    if (!synced) return;
    downloadDraftConfig(synced, previewFormat);
    setMessage(`Exported draft as ${previewFormat.toUpperCase()}.`); setError(null);
  }

  async function importDraftFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const isYaml = /\.(ya?ml)$/i.test(file.name);
      const normalized = toDraftAdminConfigView((isYaml ? load(text) : JSON.parse(text)) as unknown, config?.meta);
      setConfig(normalized);
      setSelectedNamespace(c => (c && normalized.namespaces[c] ? c : Object.keys(normalized.namespaces)[0] || ''));
      setValidation(null); setError(null);
      setMessage(`Imported ${isYaml ? 'YAML' : 'JSON'} from ${file.name}. Validate before saving.`);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to import config file'); }
  }

  async function copyPreview() {
    if (!previewState) return;
    try {
      await navigator.clipboard.writeText(previewFormat === 'yaml' ? previewState.rawYaml : previewState.rawJson);
      setMessage(`Copied ${previewFormat.toUpperCase()} to clipboard.`); setError(null);
    } catch (err) { setError(err instanceof Error ? err.message : 'Copy failed'); }
  }

  // ── Derived ───────────────────────────────────────────────────
  const deduplicatedHistory = history.reduce<AdminConfigSnapshot[]>((acc, s) => {
    if (!acc.some(x => x.revision === s.revision)) acc.push(s);
    return acc;
  }, []).slice(0, 15);

  const nsCount = config ? Object.keys(config.namespaces).length : 0;

  // ─────────────────────────────────────────────────────────────
  return (
    <Page subtitle="Manage global settings, namespaces, and revision history.">
      {/* Status banners */}
      {error   && <div className="cfg-banner cfg-banner--error">{error}</div>}
      {message && <div className="cfg-banner cfg-banner--info">{message}</div>}
      {validation && !validation.valid && (
        <div className="cfg-banner cfg-banner--error">
          {validation.errors.length} error{validation.errors.length !== 1 ? 's' : ''} · {validation.warnings.length} warning{validation.warnings.length !== 1 ? 's' : ''}
          {' — '}{validation.errors.concat(validation.warnings).slice(0, 2).map(i => i.message).join('; ')}
        </div>
      )}

      {/* Tab bar */}
      <div className="cfg-tabs">
        <button className={`cfg-tab${tab === 'global' ? ' active' : ''}`}     onClick={() => setTab('global')}>Global</button>
        <button className={`cfg-tab${tab === 'namespaces' ? ' active' : ''}`} onClick={() => setTab('namespaces')}>
          Namespaces {nsCount > 0 && <span style={{ marginLeft: 4, fontSize: '0.75em', opacity: 0.7 }}>({nsCount})</span>}
        </button>
        <button className={`cfg-tab${tab === 'history' ? ' active' : ''}`}    onClick={() => setTab('history')}>History</button>
        <div className="cfg-tabs__right">
          {hasUnsavedChanges && <span className="cfg-dirty-badge">Unsaved changes</span>}
          {config && <button className="button button-secondary" onClick={() => setPreviewOpen(true)}>Preview</button>}
        </div>
      </div>

      {!config && <div className="cfg-banner cfg-banner--warn">Loading config…</div>}

      {/* ── Global tab ── */}
      {config && tab === 'global' && (
        <div>
          <div className="revision-info">
            <div className="revision-info__item">Revision <strong>{config.meta.revision}</strong></div>
            <div className="revision-info__item">Source <strong>{config.meta.source}</strong></div>
            <div className="revision-info__item">Loaded <strong>{new Date(config.meta.lastLoadedAt).toLocaleString()}</strong></div>
            <div className="revision-info__item">Applied <strong>{config.meta.lastAppliedAt ? new Date(config.meta.lastAppliedAt).toLocaleString() : '—'}</strong></div>
            <div className="revision-info__item">Draft <strong style={{ color: hasUnsavedChanges ? 'var(--warn-text)' : 'var(--ok-text)' }}>{hasUnsavedChanges ? 'dirty' : 'clean'}</strong></div>
          </div>

          <div className="card" style={{ marginBottom: 'var(--sp-4)' }}>
            <h3>Version</h3>
            <label style={{ maxWidth: 280 }}>
              <input
                className={`input${issuesForGlobalField('version').length ? ' input-invalid' : ''}`}
                value={config.globalConfig.version}
                onChange={e => patchConfig(c => ({ ...c, globalConfig: { ...c.globalConfig, version: e.target.value } }))}
              />
              <FieldIssues issues={issuesForGlobalField('version')} />
            </label>
          </div>

          <div className="card">
            <h3>Features</h3>
            <div className="feature-grid">
              {([['health', 'Health'], ['metrics', 'Metrics'], ['purge', 'Purge'], ['xResponseTime', 'X-Response-Time'], ['changeOrigin', 'Change Origin']] as [string, string][]).map(([key, label]) => (
                <label key={key} className="feature-toggle">
                  <span className="feature-toggle__label">{label}</span>
                  <input
                    type="checkbox"
                    checked={Boolean(config.globalConfig[key as keyof typeof config.globalConfig])}
                    onChange={e => patchConfig(c => ({ ...c, globalConfig: { ...c.globalConfig, [key]: e.target.checked } }))}
                  />
                </label>
              ))}
            </div>
            <div style={{ marginTop: 'var(--sp-4)', fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
              <span>Metrics path: <strong style={{ color: 'var(--text-secondary)' }}>{config.globalConfig.metricsPath || '/__osham/metrics'}</strong></span>
              <span>Secure: <strong style={{ color: 'var(--text-secondary)' }}>{String(config.globalConfig.secure?.enabled || false)}</strong></span>
              <span>SSL key: <strong style={{ color: 'var(--text-secondary)' }}>{String(config.globalConfig.secure?.sslKeyConfigured || false)}</strong></span>
              <span>SSL cert: <strong style={{ color: 'var(--text-secondary)' }}>{String(config.globalConfig.secure?.sslCertConfigured || false)}</strong></span>
            </div>
          </div>

          <div className="cfg-footer">
            <button className="button" onClick={runValidate} disabled={busy !== null}>{busy === 'validate' ? 'Validating…' : 'Validate'}</button>
            <button className="button" onClick={runSave}     disabled={busy !== null}>{busy === 'save'     ? 'Saving…'     : 'Save'}</button>
            <button className="button" onClick={runReload}   disabled={busy !== null}>{busy === 'reload'   ? 'Reloading…'  : 'Reload'}</button>
            <div className="cfg-footer__sep" />
            <button className="button button-secondary" onClick={loadConfig}  disabled={busy !== null}>Refresh</button>
            <button className="button button-secondary" onClick={resetDraft}  disabled={!hasUnsavedChanges || busy !== null}>Reset Draft</button>
            <div className="cfg-footer__right">
              <button className="button button-secondary" onClick={exportDraft}                          disabled={!config || busy !== null}>Export</button>
              <button className="button button-secondary" onClick={() => importInputRef.current?.click()} disabled={busy !== null}>Import</button>
              <input ref={importInputRef} type="file" accept="application/json,.json,application/x-yaml,.yaml,.yml,text/yaml,text/x-yaml" style={{ display: 'none' }} onChange={e => { void importDraftFile(e); }} />
            </div>
          </div>
        </div>
      )}

      {/* ── Namespaces tab ── */}
      {config && tab === 'namespaces' && (
        <div>
          <div className="ns-split">
            {/* Left: namespace list */}
            <div className="ns-list-panel">
              <div className="ns-list-panel__header">Namespaces</div>
              <div className="ns-list-panel__items">
                {Object.keys(config.namespaces).map(name => (
                  <button
                    key={name}
                    className={`ns-list-item${selectedNamespace === name ? ' active' : ''}`}
                    onClick={() => setSelectedNamespace(name)}
                    title={name}
                  >
                    {name}
                  </button>
                ))}
                {Object.keys(config.namespaces).length === 0 && (
                  <div style={{ padding: 'var(--sp-3)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>No namespaces yet</div>
                )}
              </div>
              <div className="ns-list-panel__footer">
                <button className="button button-secondary" onClick={addNamespace} disabled={busy !== null}>+ Add</button>
              </div>
            </div>

            {/* Right: namespace form */}
            {namespace ? (
              <div className="ns-form-panel" key={selectedNamespace}>
                <div className="ns-form-panel__header">
                  <p className="ns-form-panel__title">{selectedNamespace}</p>
                  <div className="ns-form-panel__actions">
                    <button className="button button-secondary" onClick={cloneNamespace} disabled={busy !== null} title="Clone namespace">Clone</button>
                    <button className="button button-secondary" onClick={deleteNamespace} disabled={busy !== null} title="Delete namespace">Delete</button>
                  </div>
                </div>

                {/* Basic */}
                <div className="form-grid">
                  <label>
                    Expose path
                    <input className={`input${issuesForNamespaceField('expose').length ? ' input-invalid' : ''}`} value={namespace.expose} onChange={e => patchNamespace(ns => ({ ...ns, expose: e.target.value }))} />
                    <FieldIssues issues={issuesForNamespaceField('expose')} />
                  </label>
                  <label>
                    Target URL
                    <input className={`input${issuesForNamespaceField('target').length ? ' input-invalid' : ''}`} value={namespace.target} onChange={e => patchNamespace(ns => ({ ...ns, target: e.target.value }))} />
                    <FieldIssues issues={issuesForNamespaceField('target')} />
                  </label>
                </div>

                {/* Cache */}
                <CollapsibleSection title="Cache" badge={namespace.cache.enabled ? 'enabled' : undefined} defaultOpen={namespace.cache.enabled}>
                  <label className="checkbox-row">
                    <input type="checkbox" checked={namespace.cache.enabled} onChange={e => patchNamespace(ns => ({ ...ns, cache: { ...ns.cache, enabled: e.target.checked } }))} />
                    Enable caching
                  </label>
                  {namespace.cache.enabled && (
                    <>
                      <div className="form-grid">
                        <label>
                          Expires
                          <input className={`input${issuesForNamespaceField('cache').length ? ' input-invalid' : ''}`} value={namespace.cache.expires} onChange={e => patchNamespace(ns => ({ ...ns, cache: { ...ns.cache, expires: e.target.value } }))} />
                          <FieldIssues issues={issuesForNamespaceField('cache')} />
                        </label>
                        <label className="checkbox-row" style={{ alignSelf: 'end' }}>
                          <input type="checkbox" checked={namespace.cache.pool} onChange={e => patchNamespace(ns => ({ ...ns, cache: { ...ns.cache, pool: e.target.checked } }))} />
                          Request pooling
                        </label>
                      </div>
                      <div className="form-grid">
                        <label>
                          Query keys <span style={{ fontSize: '0.75em', color: 'var(--text-muted)' }}>(one per line)</span>
                          <textarea className="textarea" rows={4} value={fromLines(namespace.cache.query)} onChange={e => patchNamespace(ns => ({ ...ns, cache: { ...ns.cache, query: toLines(e.target.value) } }))} />
                        </label>
                        <label>
                          Header keys <span style={{ fontSize: '0.75em', color: 'var(--text-muted)' }}>(one per line)</span>
                          <textarea className="textarea" rows={4} value={fromLines(namespace.cache.headers)} onChange={e => patchNamespace(ns => ({ ...ns, cache: { ...ns.cache, headers: toLines(e.target.value) } }))} />
                        </label>
                      </div>
                    </>
                  )}
                </CollapsibleSection>

                {/* Access Control */}
                <CollapsibleSection
                  title="Access Control"
                  badge={namespace.allow.length || namespace.deny.length ? `${namespace.allow.length + namespace.deny.length} pattern${namespace.allow.length + namespace.deny.length !== 1 ? 's' : ''}` : undefined}
                  defaultOpen={namespace.allow.length > 0 || namespace.deny.length > 0}
                >
                  <div className="form-grid">
                    <label>
                      Allow patterns <span style={{ fontSize: '0.75em', color: 'var(--text-muted)' }}>(one per line)</span>
                      <textarea className={`textarea${issuesForNamespaceField('allow').length ? ' input-invalid' : ''}`} rows={5} value={allowText} onChange={e => setAllowText(e.target.value)} />
                      <FieldIssues issues={issuesForNamespaceField('allow')} />
                    </label>
                    <label>
                      Deny patterns <span style={{ fontSize: '0.75em', color: 'var(--text-muted)' }}>(one per line)</span>
                      <textarea className={`textarea${issuesForNamespaceField('deny').length ? ' input-invalid' : ''}`} rows={5} value={denyText} onChange={e => setDenyText(e.target.value)} />
                      <FieldIssues issues={issuesForNamespaceField('deny')} />
                    </label>
                  </div>
                </CollapsibleSection>

                {/* Rules */}
                <CollapsibleSection
                  title="Rules"
                  badge={namespace.rules.length ? `${namespace.rules.length} rule${namespace.rules.length !== 1 ? 's' : ''}` : undefined}
                  defaultOpen={namespace.rules.length > 0}
                >
                  <label>
                    Rules JSON <span style={{ fontSize: '0.75em', color: 'var(--text-muted)' }}>(array of {`{ pattern, cache }`})</span>
                    <textarea className={`textarea${issuesForNamespaceField('rules').length ? ' input-invalid' : ''}`} rows={12} value={rulesText} onChange={e => setRulesText(e.target.value)} style={{ fontFamily: 'var(--font-mono, ui-monospace)', fontSize: '0.8rem' }} />
                    <FieldIssues issues={issuesForNamespaceField('rules')} />
                  </label>
                </CollapsibleSection>

                {/* Advanced */}
                <CollapsibleSection
                  title="Advanced"
                  defaultOpen={!!(namespace.port || namespace.timeout || namespace.followRedirects || namespace.changeOrigin)}
                >
                  <div className="form-grid">
                    <label>
                      Port
                      <input className={`input${issuesForNamespaceField('port').length ? ' input-invalid' : ''}`} value={namespace.port} onChange={e => patchNamespace(ns => ({ ...ns, port: e.target.value }))} />
                      <FieldIssues issues={issuesForNamespaceField('port')} />
                    </label>
                    <label>
                      Timeout (ms)
                      <input className={`input${issuesForNamespaceField('timeout').length ? ' input-invalid' : ''}`} value={namespace.timeout} onChange={e => patchNamespace(ns => ({ ...ns, timeout: e.target.value }))} />
                      <FieldIssues issues={issuesForNamespaceField('timeout')} />
                    </label>
                    <label className="checkbox-row">
                      <input type="checkbox" checked={namespace.followRedirects} onChange={e => patchNamespace(ns => ({ ...ns, followRedirects: e.target.checked }))} />
                      Follow redirects
                    </label>
                    <label className="checkbox-row">
                      <input type="checkbox" checked={namespace.changeOrigin} onChange={e => patchNamespace(ns => ({ ...ns, changeOrigin: e.target.checked }))} />
                      Change origin
                    </label>
                  </div>
                </CollapsibleSection>

                <div className="cfg-footer">
                  <button className="button" onClick={runValidate} disabled={busy !== null}>{busy === 'validate' ? 'Validating…' : 'Validate'}</button>
                  <button className="button" onClick={runSave}     disabled={busy !== null}>{busy === 'save'     ? 'Saving…'     : 'Save'}</button>
                </div>
              </div>
            ) : (
              <div className="ns-empty">Select a namespace or add one to get started.</div>
            )}
          </div>
        </div>
      )}

      {/* ── History tab ── */}
      {config && tab === 'history' && (
        <div>
          <div className="revision-info">
            <div className="revision-info__item">Current revision <strong>{config.meta.revision}</strong></div>
            <div className="revision-info__item">Draft <strong style={{ color: hasUnsavedChanges ? 'var(--warn-text)' : 'var(--ok-text)' }}>{hasUnsavedChanges ? 'dirty' : 'clean'}</strong></div>
          </div>

          {deduplicatedHistory.length === 0 ? (
            <div className="empty-state">
              <p className="empty-state__title">No snapshots yet</p>
              <p className="empty-state__body">Snapshots are created each time you save or rollback the config.</p>
            </div>
          ) : (
            <div className="history-list">
              {deduplicatedHistory.map(snapshot => {
                const isCurrent = snapshot.revision === config.meta.revision;
                const rollbackBusy = busy === `rollback:${snapshot.revision}`;
                return (
                  <div key={`${snapshot.revision}-${snapshot.createdAt}`} className={`history-item${isCurrent ? ' current' : ''}`}>
                    <div className="history-item__dot" />
                    <div className="history-item__rev">{snapshot.revision}</div>
                    <div className="history-item__date">{new Date(snapshot.createdAt).toLocaleString()}</div>
                    {isCurrent
                      ? <span className="history-item__badge history-item__badge--current">current</span>
                      : <span className={`history-item__badge history-item__badge--${snapshot.reason}`}>{snapshot.reason}</span>
                    }
                    <button
                      className="button button-secondary"
                      style={{ fontSize: '0.78rem', padding: '4px 12px' }}
                      onClick={() => runRollback(snapshot)}
                      disabled={isCurrent || busy !== null || hasUnsavedChanges}
                    >
                      {rollbackBusy ? 'Rolling back…' : 'Roll back'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="cfg-footer">
            <button className="button button-secondary" onClick={loadConfig} disabled={busy !== null}>Refresh</button>
            {hasUnsavedChanges && <span className="cfg-dirty-badge">Reset draft to enable rollback</span>}
          </div>
        </div>
      )}

      {/* ── Preview drawer ── */}
      {previewOpen && (
        <>
          <div className="preview-overlay" onClick={() => setPreviewOpen(false)} />
          <div className="preview-drawer">
            <div className="preview-drawer__header">
              <p className="preview-drawer__title">Config Preview</p>
              <button className="button button-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => setPreviewFormat(f => f === 'yaml' ? 'json' : 'yaml')}>
                {previewFormat.toUpperCase()} ⇄
              </button>
              <button className="button button-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={() => void copyPreview()} disabled={!previewState}>
                Copy
              </button>
              <button className="topbar__icon-btn" onClick={() => setPreviewOpen(false)} aria-label="Close preview">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="preview-drawer__body">
              {previewState?.error && <div className="cfg-banner cfg-banner--warn">{previewState.error}</div>}
              <textarea
                className="textarea"
                style={{ flex: 1, minHeight: '60vh', fontFamily: 'var(--font-mono, ui-monospace)', fontSize: '0.8rem', resize: 'none' }}
                readOnly
                value={previewFormat === 'yaml' ? previewState?.rawYaml || '' : previewState?.rawJson || ''}
              />
            </div>
          </div>
        </>
      )}
    </Page>
  );
}
