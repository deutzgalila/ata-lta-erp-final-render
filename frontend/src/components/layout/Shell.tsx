import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

export function Shell() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#f4f6fb]" data-testid="app-shell">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Topbar */}
        <Topbar />

        {/* Dynamic Route Outlet */}
        <main className="flex-1 overflow-y-auto px-8 py-7" data-testid="main-content">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
