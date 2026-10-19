import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

export function Shell() {
  return (
    <div className="flex h-dvh min-h-screen w-full overflow-hidden bg-[#F4F4F0] text-[#0A0A0A]" data-testid="app-shell">
      {/* Sidebar: Desktop fixed rail */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Topbar: Includes responsive drawer for mobile/tablet */}
        <Topbar />

        {/* Dynamic Route Outlet */}
        <main className="flex-1 min-w-0 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6" data-testid="main-content">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
