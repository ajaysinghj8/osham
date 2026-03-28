import React from 'react';
import {
  ADMIN_SECRET_CHANGED_EVENT,
  clearAdminSecret,
  getStoredAdminSecret,
  saveAdminSecret,
} from '../api';

export function AdminSecretBar() {
  const [value, setValue] = React.useState(() => getStoredAdminSecret());
  const [saved, setSaved] = React.useState(() => !!getStoredAdminSecret());

  React.useEffect(() => {
    function syncFromStorage() {
      const current = getStoredAdminSecret();
      setValue(current);
      setSaved(!!current);
    }

    window.addEventListener(ADMIN_SECRET_CHANGED_EVENT, syncFromStorage);
    window.addEventListener('storage', syncFromStorage);
    return () => {
      window.removeEventListener(ADMIN_SECRET_CHANGED_EVENT, syncFromStorage);
      window.removeEventListener('storage', syncFromStorage);
    };
  }, []);

  function save() {
    saveAdminSecret(value);
    setSaved(!!value.trim());
  }

  function clear() {
    clearAdminSecret();
    setValue('');
    setSaved(false);
  }

  return (
    <div className="card admin-secret-card">
      <div className="toolbar admin-secret-toolbar">
        <input
          className="input"
          type="password"
          placeholder="x-osham-admin-secret"
          value={value}
          onChange={e => {
            setValue(e.target.value);
            setSaved(false);
          }}
        />
        <button className="button" onClick={save}>
          Save Secret
        </button>
        <button className="button button-secondary" onClick={clear} disabled={!value && !saved}>
          Clear
        </button>
      </div>
      <p>
        Secret storage is session-only. {saved ? 'Saved secret will be sent with admin API requests.' : 'Save the admin secret to unlock protected admin endpoints.'}
      </p>
    </div>
  );
}
