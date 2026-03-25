import React from 'react';
import {
  ADMIN_AUTH_REQUIRED_EVENT,
  ADMIN_SECRET_CHANGED_EVENT,
  clearAdminSecret,
  getStoredAdminSecret,
  markAdminAuthOptional,
  requiresAdminAuth,
  saveAdminSecret,
} from '../api';

export function AuthGate(props: React.PropsWithChildren<{}>) {
  const [value, setValue] = React.useState(() => getStoredAdminSecret());
  const [saved, setSaved] = React.useState(() => !!getStoredAdminSecret());
  const [authOptional, setAuthOptional] = React.useState(() => !requiresAdminAuth());
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    function sync() {
      const secret = getStoredAdminSecret();
      setValue(secret);
      setSaved(!!secret);
      setAuthOptional(!requiresAdminAuth());
    }

    function handleAuthRequired(event: Event) {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      setMessage(detail?.message || 'Admin API authentication is required. Save a valid x-osham-admin-secret to continue.');
      setAuthOptional(false);
      setValue(getStoredAdminSecret());
      setSaved(!!getStoredAdminSecret());
    }

    window.addEventListener(ADMIN_SECRET_CHANGED_EVENT, sync);
    window.addEventListener(ADMIN_AUTH_REQUIRED_EVENT, handleAuthRequired as EventListener);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(ADMIN_SECRET_CHANGED_EVENT, sync);
      window.removeEventListener(ADMIN_AUTH_REQUIRED_EVENT, handleAuthRequired as EventListener);
      window.removeEventListener('storage', sync);
    };
  }, []);

  function save() {
    saveAdminSecret(value);
    setSaved(!!value.trim());
    setAuthOptional(true);
    setMessage(null);
  }

  function clear() {
    clearAdminSecret();
    setValue('');
    setSaved(false);
    setAuthOptional(false);
  }

  function continueWithoutSecret() {
    markAdminAuthOptional();
    setAuthOptional(true);
    setMessage(null);
  }

  if (saved || authOptional) {
    return <>{props.children}</>;
  }

  return (
    <section className="auth-gate-shell">
      <div className="auth-gate-card">
        <h1>Connect to Osham Admin</h1>
        <p>
          Save the <code>x-osham-admin-secret</code> for this browser session to unlock protected admin endpoints.
        </p>
        {message ? <div className="code-block">{message}</div> : null}
        <div className="toolbar auth-gate-toolbar">
          <input
            className="input"
            type="password"
            placeholder="x-osham-admin-secret"
            value={value}
            onChange={e => setValue(e.target.value)}
          />
          <button className="button" onClick={save} disabled={!value.trim()}>
            Save Secret
          </button>
          <button className="button button-secondary" onClick={continueWithoutSecret}>
            Continue Without Secret
          </button>
          <button className="button button-secondary" onClick={clear} disabled={!value && !saved}>
            Clear
          </button>
        </div>
        <p>
          Use “Continue Without Secret” only when Osham is explicitly configured for insecure local admin access.
        </p>
      </div>
    </section>
  );
}
