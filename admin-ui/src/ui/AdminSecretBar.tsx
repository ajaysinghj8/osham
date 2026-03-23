import React from 'react';

export function AdminSecretBar() {
  const [value, setValue] = React.useState(() => window.localStorage.getItem('osham-admin-secret') || '');

  function save() {
    window.localStorage.setItem('osham-admin-secret', value);
  }

  return (
    <div className="toolbar">
      <input
        className="input"
        type="password"
        placeholder="x-osham-admin-secret"
        value={value}
        onChange={e => setValue(e.target.value)}
      />
      <button className="button" onClick={save}>
        Save Secret
      </button>
    </div>
  );
}
