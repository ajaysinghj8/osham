import React from 'react';
import { ApiError, apiGet, apiPost, apiPut } from '../api';
import { AdminConfigView, CacheConfigView, NamespaceView, ValidationResult } from '../types';
import { Page } from '../ui/Page';
import { Card } from '../ui/Card';

function toLines(value: string): string[] {
  return value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function fromLines(value?: string[]): string {
  return (value || []).join('\n');
}

type CacheSource =
  | NamespaceView['cache']
  | {
      expires?: string | number;
      pool?: boolean;
      query?: string[] | false;
      headers?: string[] | false;
    }
  | false
  | undefined;

function toCacheView(cache: CacheSource): CacheConfigView {
  if (!cache) {
    return { enabled: false, expires: '', pool: false, query: [], headers: [] };
  }
  return {
    enabled: true,
    expires: cache.expires ? String(cache.expires) : '',
    pool: !!cache.pool,
    query: Array.isArray(cache.query) ? cache.query : [],
    headers: Array.isArray(cache.headers) ? cache.headers : [],
  };
}

function normalizeConfig(data: AdminConfigView): AdminConfigView {
  const namespaces = Object.fromEntries(
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
        rules: (ns.rules || []).map(rule => ({
          pattern: rule.pattern,
          cache: toCacheView(rule.cache),
        })),
      },
    ]),
  );

  return {
    ...data,
    namespaces,
  };
}

function buildPayload(config: AdminConfigView) {
  const namespaces = Object.fromEntries(
    Object.entries(config.namespaces).map(([name, ns]) => {
      const built: Record<string, unknown> = {
        expose: ns.expose,
        target: ns.target,
      };

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

      if (ns.rules.length) {
        built.rules = Object.fromEntries(
          ns.rules.map(rule => [
            rule.pattern,
            {
              cache: rule.cache.enabled
                ? {
                    ...(rule.cache.expires ? { expires: rule.cache.expires } : {}),
                    ...(rule.cache.pool ? { pool: true } : {}),
                    ...(rule.cache.query.length ? { query: rule.cache.query } : {}),
                    ...(rule.cache.headers.length ? { headers: rule.cache.headers } : {}),
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

function cloneNamespaceView(namespace: NamespaceView): NamespaceView {
  return {
    ...namespace,
    allow: [...namespace.allow],
    deny: [...namespace.deny],
    cache: {
      ...namespace.cache,
      query: [...namespace.cache.query],
      headers: [...namespace.cache.headers],
    },
    rules: namespace.rules.map(rule => ({
      pattern: rule.pattern,
      cache: {
        ...rule.cache,
        query: [...rule.cache.query],
        headers: [...rule.cache.headers],
      },
    })),
  };
}

export function ConfigPage() {
  const [config, setConfig] = React.useState<AdminConfigView | null>(null);
  const [selectedNamespace, setSelectedNamespace] = React.useState<string>('');
  const [allowText, setAllowText] = React.useState('');
  const [denyText, setDenyText] = React.useState('');
  const [rulesText, setRulesText] = React.useState('[]');
  const [validation, setValidation] = React.useState<ValidationResult | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [lastSavedSnapshot, setLastSavedSnapshot] = React.useState<string>('');

  const loadConfig = React.useCallback(async () => {
    try {
      const data = normalizeConfig(await apiGet<AdminConfigView>('/__osham/admin/config'));
      const firstNamespace = Object.keys(data.namespaces)[0] || '';
      setConfig(data);
      setSelectedNamespace(current => (current && data.namespaces[current] ? current : firstNamespace));
      setValidation(null);
      setError(null);
      setLastSavedSnapshot(JSON.stringify(buildPayload(data)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load config');
    }
  }, []);

  React.useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const namespace = config && selectedNamespace ? config.namespaces[selectedNamespace] : null;

  React.useEffect(() => {
    if (!namespace) return;
    setAllowText(fromLines(namespace.allow));
    setDenyText(fromLines(namespace.deny));
    setRulesText(JSON.stringify(namespace.rules, null, 2));
  }, [namespace, selectedNamespace]);

  function patchConfig(updater: (current: AdminConfigView) => AdminConfigView) {
    setConfig(current => (current ? updater(current) : current));
  }

  function patchNamespace(updater: (current: NamespaceView) => NamespaceView) {
    if (!config || !selectedNamespace) return;
    patchConfig(current => ({
      ...current,
      namespaces: {
        ...current.namespaces,
        [selectedNamespace]: updater(current.namespaces[selectedNamespace]),
      },
    }));
  }

  function syncTextAreas() {
    if (!namespace) return true;
    try {
      const parsedRules = JSON.parse(rulesText) as NamespaceView['rules'];
      if (!Array.isArray(parsedRules)) {
        throw new Error('Rules JSON must be an array');
      }

      patchNamespace(current => ({
        ...current,
        allow: toLines(allowText),
        deny: toLines(denyText),
        rules: parsedRules.map(rule => ({
          pattern: rule.pattern,
          cache: toCacheView(rule.cache),
        })),
      }));
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rules JSON is invalid');
      return false;
    }
  }

  const currentPayload = React.useMemo(() => (config ? JSON.stringify(buildPayload(config)) : ''), [config]);
  const hasUnsavedChanges = !!config && currentPayload !== lastSavedSnapshot;

  async function runValidate() {
    if (!config || !syncTextAreas()) return;
    setBusy('validate');
    setMessage(null);
    setError(null);
    try {
      const result = await apiPost<ValidationResult>('/__osham/admin/config/validate', {
        config: buildPayload(config),
      });
      setValidation(result);
      setMessage(result.valid ? 'Validation passed.' : 'Validation failed. Review the issues below.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Validation failed');
    } finally {
      setBusy(null);
    }
  }

  async function runSave() {
    if (!config || !syncTextAreas()) return;
    setBusy('save');
    setMessage(null);
    setError(null);
    try {
      const data = await apiPut<{ saved: boolean; revision: string; warnings: { message: string }[] }>(
        '/__osham/admin/config',
        {
          config: buildPayload(config),
          expectedRevision: config.meta.revision,
        },
      );
      setMessage(`Saved config revision ${data.revision}.`);
      await loadConfig();
      if (data.warnings?.length) {
        setValidation({
          valid: true,
          errors: [],
          warnings: data.warnings.map(warning => ({
            field: 'config',
            message: warning.message,
            severity: 'warning',
            code: 'SAVE_WARNING',
          })),
        });
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'REVISION_CONFLICT') {
        setError('Save blocked: the live config revision changed. Refresh, review the latest config, and re-apply your edits.');
      } else {
        setError(err instanceof Error ? err.message : 'Save failed');
      }
    } finally {
      setBusy(null);
    }
  }

  async function runReload() {
    if (hasUnsavedChanges) {
      setError('Reload blocked while there are unsaved editor changes. Save or refresh first so you do not lose your draft.');
      return;
    }
    setBusy('reload');
    setMessage(null);
    setError(null);
    try {
      const data = await apiPost<{ applied: boolean; revision: string; note?: string }>('/__osham/admin/config/reload', {
        expectedRevision: config?.meta.revision,
      });
      setMessage(data.note || `Reloaded admin state at revision ${data.revision}.`);
      await loadConfig();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'REVISION_CONFLICT') {
        setError('Reload blocked: another change landed first. Refresh to inspect the new revision before applying again.');
      } else {
        setError(err instanceof Error ? err.message : 'Reload failed');
      }
    } finally {
      setBusy(null);
    }
  }

  function addNamespace() {
    const name = window.prompt('Namespace name');
    if (!name || !config || config.namespaces[name]) return;
    patchConfig(current => ({
      ...current,
      namespaces: {
        ...current.namespaces,
        [name]: {
          expose: '/api/*',
          target: 'http://localhost:3000',
          port: '',
          timeout: '',
          followRedirects: false,
          changeOrigin: false,
          allow: [],
          deny: [],
          cache: { enabled: true, expires: '', pool: false, query: [], headers: [] },
          rules: [],
        },
      },
    }));
    setSelectedNamespace(name);
  }

  function cloneNamespace() {
    if (!config || !namespace || !selectedNamespace) return;
    const name = window.prompt('Clone namespace as', `${selectedNamespace}-copy`);
    if (!name || config.namespaces[name]) return;
    patchConfig(current => ({
      ...current,
      namespaces: {
        ...current.namespaces,
        [name]: cloneNamespaceView(current.namespaces[selectedNamespace]),
      },
    }));
    setSelectedNamespace(name);
    setMessage(`Cloned namespace ${selectedNamespace} to ${name}.`);
  }

  function deleteNamespace() {
    if (!config || !namespace || !selectedNamespace) return;
    if (!window.confirm(`Delete namespace ${selectedNamespace}? This only updates the draft until you save.`)) return;
    const names = Object.keys(config.namespaces).filter(name => name !== selectedNamespace);
    patchConfig(current => {
      const nextNamespaces = { ...current.namespaces };
      delete nextNamespaces[selectedNamespace];
      return {
        ...current,
        namespaces: nextNamespaces,
      };
    });
    setSelectedNamespace(names[0] || '');
    setMessage(`Removed namespace ${selectedNamespace} from the draft. Save to persist the change.`);
  }

  return (
    <Page title="Config" subtitle="Edit global settings and namespace config, then validate/save/reload against the live admin API.">
      <div className="toolbar">
        <button className="button" onClick={loadConfig} disabled={busy !== null}>
          Refresh
        </button>
        <button className="button" onClick={runValidate} disabled={!config || busy !== null}>
          {busy === 'validate' ? 'Validating…' : 'Validate'}
        </button>
        <button className="button" onClick={runSave} disabled={!config || busy !== null}>
          {busy === 'save' ? 'Saving…' : 'Save'}
        </button>
        <button className="button" onClick={runReload} disabled={!config || busy !== null}>
          {busy === 'reload' ? 'Reloading…' : 'Reload Admin State'}
        </button>
        <button className="button" onClick={addNamespace} disabled={!config || busy !== null}>
          Add Namespace
        </button>
        <button className="button" onClick={cloneNamespace} disabled={!namespace || busy !== null}>
          Clone Namespace
        </button>
        <button className="button" onClick={deleteNamespace} disabled={!namespace || busy !== null}>
          Delete Namespace
        </button>
      </div>

      {hasUnsavedChanges ? <div className="code-block">You have unsaved draft changes in the config editor.</div> : null}
      {message ? <div className="code-block">{message}</div> : null}
      {error ? <div className="code-block">{error}</div> : null}

      {config ? (
        <>
          <div className="card-grid">
            <Card title="Config Revision">
              <p>Revision: {config.meta.revision}</p>
              <p>Source: {config.meta.source}</p>
              <p>Last loaded: {config.meta.lastLoadedAt}</p>
              <p>Last applied: {config.meta.lastAppliedAt || 'Not yet applied'}</p>
              <p>Draft state: {hasUnsavedChanges ? 'dirty' : 'clean'}</p>
            </Card>
            <Card title="Global Settings">
              <div className="form-grid compact-grid">
                <label>
                  Version
                  <input
                    className="input"
                    value={config.globalConfig.version}
                    onChange={e =>
                      patchConfig(current => ({
                        ...current,
                        globalConfig: { ...current.globalConfig, version: e.target.value },
                      }))
                    }
                  />
                </label>
                {[
                  ['health', 'Health'],
                  ['metrics', 'Metrics'],
                  ['purge', 'Purge'],
                  ['xResponseTime', 'X-Response-Time'],
                  ['changeOrigin', 'Change Origin'],
                ].map(([key, label]) => (
                  <label key={key} className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={Boolean(config.globalConfig[key as keyof typeof config.globalConfig])}
                      onChange={e =>
                        patchConfig(current => ({
                          ...current,
                          globalConfig: { ...current.globalConfig, [key]: e.target.checked },
                        }))
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
              <p>Metrics path: {config.globalConfig.metricsPath || '/__osham/metrics'}</p>
              <p>
                Secure mode: {String(config.globalConfig.secure?.enabled || false)} · SSL key:{' '}
                {String(config.globalConfig.secure?.sslKeyConfigured || false)} · SSL cert:{' '}
                {String(config.globalConfig.secure?.sslCertConfigured || false)}
              </p>
            </Card>
          </div>

          <div className="config-layout">
            <Card title="Namespaces">
              <div className="namespace-list">
                {Object.keys(config.namespaces).map(name => (
                  <button
                    key={name}
                    className={`namespace-pill ${selectedNamespace === name ? 'active' : ''}`}
                    onClick={() => setSelectedNamespace(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </Card>

            {namespace ? (
              <Card title={`Namespace: ${selectedNamespace}`}>
                <div className="form-grid">
                  <label>
                    Expose
                    <input className="input" value={namespace.expose} onChange={e => patchNamespace(current => ({ ...current, expose: e.target.value }))} />
                  </label>
                  <label>
                    Target
                    <input className="input" value={namespace.target} onChange={e => patchNamespace(current => ({ ...current, target: e.target.value }))} />
                  </label>
                  <label>
                    Port
                    <input className="input" value={namespace.port} onChange={e => patchNamespace(current => ({ ...current, port: e.target.value }))} />
                  </label>
                  <label>
                    Timeout (ms)
                    <input className="input" value={namespace.timeout} onChange={e => patchNamespace(current => ({ ...current, timeout: e.target.value }))} />
                  </label>
                  <label className="checkbox-row">
                    <input type="checkbox" checked={namespace.followRedirects} onChange={e => patchNamespace(current => ({ ...current, followRedirects: e.target.checked }))} />
                    Follow redirects
                  </label>
                  <label className="checkbox-row">
                    <input type="checkbox" checked={namespace.changeOrigin} onChange={e => patchNamespace(current => ({ ...current, changeOrigin: e.target.checked }))} />
                    Change origin
                  </label>
                </div>

                <div className="card-grid section-grid">
                  <Card title="Default Cache">
                    <label className="checkbox-row">
                      <input type="checkbox" checked={namespace.cache.enabled} onChange={e => patchNamespace(current => ({ ...current, cache: { ...current.cache, enabled: e.target.checked } }))} />
                      Cache enabled
                    </label>
                    <label>
                      Expires
                      <input className="input" value={namespace.cache.expires} onChange={e => patchNamespace(current => ({ ...current, cache: { ...current.cache, expires: e.target.value } }))} />
                    </label>
                    <label className="checkbox-row">
                      <input type="checkbox" checked={namespace.cache.pool} onChange={e => patchNamespace(current => ({ ...current, cache: { ...current.cache, pool: e.target.checked } }))} />
                      Request pooling
                    </label>
                    <label>
                      Query keys (one per line)
                      <textarea className="textarea" value={fromLines(namespace.cache.query)} onChange={e => patchNamespace(current => ({ ...current, cache: { ...current.cache, query: toLines(e.target.value) } }))} rows={5} />
                    </label>
                    <label>
                      Header keys (one per line)
                      <textarea className="textarea" value={fromLines(namespace.cache.headers)} onChange={e => patchNamespace(current => ({ ...current, cache: { ...current.cache, headers: toLines(e.target.value) } }))} rows={5} />
                    </label>
                  </Card>

                  <Card title="Access Control">
                    <label>
                      Allow patterns
                      <textarea className="textarea" rows={6} value={allowText} onChange={e => setAllowText(e.target.value)} />
                    </label>
                    <label>
                      Deny patterns
                      <textarea className="textarea" rows={6} value={denyText} onChange={e => setDenyText(e.target.value)} />
                    </label>
                  </Card>
                </div>

                <label>
                  Rules JSON (array of {`{ pattern, cache }`})
                  <textarea className="textarea" rows={14} value={rulesText} onChange={e => setRulesText(e.target.value)} />
                </label>
              </Card>
            ) : null}
          </div>

          {validation ? (
            <Card title="Validation Results">
              <p>Valid: {String(validation.valid)}</p>
              {validation.errors.length ? (
                <div>
                  <strong>Errors</strong>
                  <ul>
                    {validation.errors.map((issue, index) => (
                      <li key={`${issue.code}-${index}`}>{issue.message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {validation.warnings.length ? (
                <div>
                  <strong>Warnings</strong>
                  <ul>
                    {validation.warnings.map((issue, index) => (
                      <li key={`${issue.code}-${index}`}>{issue.message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Card>
          ) : null}
        </>
      ) : (
        <div className="code-block">Loading config…</div>
      )}
    </Page>
  );
}
