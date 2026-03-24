import React from 'react';

export function AdminSecretBar() {
  const [value, setValue] = React.useState(
    () => window.sessionStorage.getItem('osham-admin-secret') || window.localStorage.getItem('osham-admin-secret') || '',
  );

  function save() {
    window.sessionStorage.setItem('osham-admin-secret', value);
    window.localStorage.removeItem('osham-admin-secret');
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
