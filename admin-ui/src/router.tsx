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
import { AdminSecretBar } from './ui/AdminSecretBar';

function Layout() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="content-shell">
        <AdminSecretBar />
        <Outlet />
      </main>
    </div>
  );
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/admin/dashboard" replace /> },
      { path: '/admin/dashboard', element: <DashboardPage /> },
      { path: '/admin/config', element: <ConfigPage /> },
      { path: '/admin/metrics', element: <MetricsPage /> },
      { path: '/admin/health', element: <HealthPage /> },
      { path: '/admin/purge', element: <PurgePage /> },
      { path: '/admin/audit', element: <AuditPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
