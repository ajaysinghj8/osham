import React from 'react';
import { NavLink } from 'react-router-dom';

const links = [
  ['/admin/dashboard', 'Dashboard'],
  ['/admin/config', 'Config'],
  ['/admin/metrics', 'Metrics'],
  ['/admin/health', 'Health'],
  ['/admin/purge', 'Purge'],
  ['/admin/audit', 'Audit'],
] as const;

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">Osham Admin</div>
      <nav className="nav-list">
        {links.map(([to, label]) => (
          <NavLink key={to} to={to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
