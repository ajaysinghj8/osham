import React from 'react';
import { useLocation } from 'react-router-dom';
import { apiGet, ADMIN_SECRET_CHANGED_EVENT, getStoredAdminSecret, saveAdminSecret, clearAdminSecret } from '../api';
import { HealthResponse, MetricsSummary } from '../types';

// ─── Icons ───────────────────────────────────────────────────────
function IconMenu() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6"  x2="21" y2="6"  />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function IconKey() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="7.5" cy="15.5" r="5.5" />
      <path d="M21 2l-9.6 9.6" />
      <path d="M15.5 7.5l3 3L22 7l-3-3" />
    </svg>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────
function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

const PAGE_TITLES: Record<string, string> = {
  '/admin/dashboard': 'Dashboard',
  '/admin/config':    'Config',
  '/admin/metrics':   'Metrics',
  '/admin/health':    'Health',
  '/admin/purge':     'Purge',
  '/admin/audit':     'Audit',
};

// ─── Component ───────────────────────────────────────────────────
interface TopBarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function TopBar({ collapsed: _collapsed, onToggle }: TopBarProps) {
  const location = useLocation();
  const pageTitle = PAGE_TITLES[location.pathname] ?? 'Osham';

  const [health, setHealth]   = React.useState<HealthResponse | null>(null);
  const [metrics, setMetrics] = React.useState<MetricsSummary | null>(null);

  // Secret popover state
  const [secretOpen, setSecretOpen] = React.useState(false);
  const [secretValue, setSecretValue] = React.useState(() => getStoredAdminSecret());
  const [secretSaved, setSecretSaved] = React.useState(() => !!getStoredAdminSecret());
  const popoverRef = React.useRef<HTMLDivElement>(null);

  // Fetch health + metrics
  React.useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const [h, m] = await Promise.all([
          apiGet<HealthResponse>('/__osham/admin/health').catch(() => null),
          apiGet<MetricsSummary>('/__osham/admin/metrics/summary').catch(() => null),
        ]);
        if (!cancelled) { setHealth(h); setMetrics(m); }
      } catch { /* silent */ }
    }

    poll();
    const id = setInterval(poll, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Sync secret from storage events
  React.useEffect(() => {
    function sync() {
      const v = getStoredAdminSecret();
      setSecretValue(v);
      setSecretSaved(!!v);
    }
    window.addEventListener(ADMIN_SECRET_CHANGED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(ADMIN_SECRET_CHANGED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  // Close popover on outside click
  React.useEffect(() => {
    if (!secretOpen) return;
    function onDown(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setSecretOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [secretOpen]);

  function saveSecret() {
    saveAdminSecret(secretValue);
    setSecretSaved(!!secretValue.trim());
  }

  function clearSecret() {
    clearAdminSecret();
    setSecretValue('');
    setSecretSaved(false);
  }

  // ─── Health chip ───────────────────────────────────────────────
  let healthVariant = '';
  let healthLabel   = '—';
  if (health) {
    const ok = health.status === 'ok' || health.status === 'healthy';
    healthVariant = ok ? 'topbar__chip--ok' : 'topbar__chip--warn';
    healthLabel   = ok ? 'Online' : 'Degraded';
  }

  // ─── Cache chip ────────────────────────────────────────────────
  let cacheVariant = '';
  let cacheLabel   = '—';
  if (health) {
    const connected = health.cache?.status === 'connected' || health.cache?.status === 'ok';
    cacheVariant = connected ? 'topbar__chip--ok' : 'topbar__chip--err';
    cacheLabel   = connected
      ? `${health.cache.backend ?? 'Cache'} ●`
      : `${health.cache.backend ?? 'Cache'} ○`;
  }

  // ─── Hit ratio chip ────────────────────────────────────────────
  let ratioVariant = '';
  let ratioLabel   = '—';
  if (metrics) {
    const pct = Math.round(metrics.hitRatio * 100);
    ratioVariant = pct >= 70 ? 'topbar__chip--ok' : pct >= 40 ? 'topbar__chip--warn' : 'topbar__chip--err';
    ratioLabel   = `${pct}% hit`;
  }

  return (
    <header className="topbar">
      {/* Left: toggle + brand */}
      <button className="topbar__icon-btn" onClick={onToggle} title="Toggle sidebar" aria-label="Toggle sidebar">
        <IconMenu />
      </button>

      <div className="topbar__brand">
        <span className="topbar__brand-name">Osham</span>
      </div>

      {/* Center: page title */}
      <span className="topbar__title">{pageTitle}</span>

      {/* Right: chips */}
      <div className="topbar__chips">
        {health && (
          <span className={`topbar__chip ${healthVariant}`}>
            <span className="topbar__chip-dot" />
            {healthLabel}
          </span>
        )}

        {health && (
          <span className={`topbar__chip ${cacheVariant}`}>
            {cacheLabel}
          </span>
        )}

        {metrics && (
          <span className="topbar__chip">
            {formatCount(metrics.requests)} req
          </span>
        )}

        {metrics && (
          <span className={`topbar__chip ${ratioVariant}`}>
            {ratioLabel}
          </span>
        )}

        {/* Secret button + popover */}
        <div style={{ position: 'relative' }} ref={popoverRef}>
          <button
            className={`topbar__icon-btn${secretSaved ? ' topbar__icon-btn--active' : ''}`}
            onClick={() => setSecretOpen(o => !o)}
            title={secretSaved ? 'Admin secret saved' : 'Set admin secret'}
            aria-label="Admin secret"
          >
            <IconKey />
          </button>

          {secretOpen && (
            <div className="secret-popover">
              <p className="secret-popover__title">Admin Secret</p>
              <div className="secret-popover__row">
                <input
                  className="input"
                  type="password"
                  placeholder="x-osham-admin-secret"
                  value={secretValue}
                  style={{ minWidth: 0, flex: 1 }}
                  onChange={e => { setSecretValue(e.target.value); setSecretSaved(false); }}
                  onKeyDown={e => { if (e.key === 'Enter') saveSecret(); }}
                  autoFocus
                />
                <button className="button" onClick={saveSecret}>Save</button>
                <button className="button button-secondary" onClick={clearSecret} disabled={!secretValue && !secretSaved}>Clear</button>
              </div>
              <p className="secret-popover__note">
                {secretSaved
                  ? 'Saved — sent with every admin request this session.'
                  : 'Session-only. Clears on tab close.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
