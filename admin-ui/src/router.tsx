import React from 'react';
import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { DashboardPage } from './screens/DashboardPage';
import { ConfigPage } from './screens/ConfigPage';
import { MetricsPage } from './screens/MetricsPage';
import { HealthPage } from './screens/HealthPage';
import { PurgePage } from './screens/PurgePage';
import { AuditPage } from './screens/AuditPage';
import { NotFoundPage } from './screens/NotFoundPage';
import { Sidebar } from './ui/Sidebar';
import { TopBar } from './ui/TopBar';
import { AuthGate } from './ui/AuthGate';

const SIDEBAR_STORAGE_KEY = 'osham-sidebar-collapsed';

function AdminLayout() {
  const [collapsed, setCollapsed] = React.useState<boolean>(
    () => localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true',
  );

  function toggle() {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
      return next;
    });
  }

  return (
    <AuthGate>
      <div className="app-shell">
        <TopBar collapsed={collapsed} onToggle={toggle} />
        <Sidebar collapsed={collapsed} onToggle={toggle} />
        <main className={`content-shell${collapsed ? ' collapsed' : ''}`}>
          <Outlet />
        </main>
      </div>
    </AuthGate>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AdminLayout />,
    children: [
      { index: true, element: <Navigate to="/admin/dashboard" replace /> },
      { path: '/admin/dashboard', element: <DashboardPage /> },
      { path: '/admin/config',    element: <ConfigPage /> },
      { path: '/admin/metrics',   element: <MetricsPage /> },
      { path: '/admin/health',    element: <HealthPage /> },
      { path: '/admin/purge',     element: <PurgePage /> },
      { path: '/admin/audit',     element: <AuditPage /> },
      { path: '*',                element: <NotFoundPage /> },
    ],
  },
]);
