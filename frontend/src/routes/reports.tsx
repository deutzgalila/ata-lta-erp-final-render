import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Forbidden } from '@/components/common/Forbidden';
import { BlockingActionModal } from '@/features/operations/components/BlockingActionModal';
import {
  AnalyticsOverviewTab,
  DailyActivityTab,
  WeeklySummaryTab,
  MonthlyPendingTab,
  AgingReportTab,
  ReportScopePrompt,
} from '@/features/reports';
import { useSessionStore } from '@/lib/session';
import { hasPermission } from '@/lib/permissions';

export default function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Session & RBAC
  const permissions = useSessionStore((state) => state.permissions);
  const user = useSessionStore((state) => state.user);
  const activeEntity = useSessionStore((state) => state.activeEntity);
  const setActiveEntity = useSessionStore((state) => state.setActiveEntity);

  const isAdmin = user?.role === 'Admin' || hasPermission(permissions, 'users:manage');
  const canViewReports = hasPermission(permissions, 'reports:view');
  const canViewBilling = hasPermission(permissions, 'billing:view');

  // Enforce admin-only access when user profile is loaded
  if (user && !isAdmin) {
    return <Forbidden requiredPermission="users:manage" />;
  }

  // Determine available tabs based on permissions
  const availableTabs = useMemo(() => {
    const tabs: string[] = [];
    if (canViewReports) {
      tabs.push('overview', 'daily', 'weekly', 'monthly');
    }
    if (canViewBilling) {
      tabs.push('aging');
    }
    return tabs;
  }, [canViewReports, canViewBilling]);

  // Normalize incoming tab parameter to support ?tab=analytics alias for overview
  const normalizeTab = (tab: string | null): string => {
    if (!tab) return '';
    if (tab === 'analytics' || tab === 'overview') return 'overview';
    return tab;
  };

  const requestedTab = searchParams.get('tab');
  const normalizedRequestedTab = normalizeTab(requestedTab);
  const defaultTab = canViewReports ? 'overview' : 'aging';
  const activeTab =
    normalizedRequestedTab && availableTabs.includes(normalizedRequestedTab)
      ? normalizedRequestedTab
      : defaultTab;

  // Sync URL if requested tab is invalid or missing
  useEffect(() => {
    if (!canViewReports && !canViewBilling) return;
    const isOverviewAlias = requestedTab === 'analytics' && canViewReports;
    if (!requestedTab || (!availableTabs.includes(requestedTab) && !isOverviewAlias)) {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set('tab', defaultTab);
          return next;
        },
        { replace: true }
      );
    }
  }, [canViewReports, canViewBilling, requestedTab, defaultTab, availableTabs, setSearchParams]);

  // If user has neither permission, show Forbidden screen
  if (!canViewReports && !canViewBilling) {
    return <Forbidden requiredPermission="reports:view" />;
  }

  const handleTabChange = (val: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', val);
      return next;
    });
  };

  const tabDisplayTitles: Record<string, string> = {
    overview: 'Overview',
    daily: 'Daily activity',
    weekly: 'Weekly summary',
    monthly: 'Monthly pending',
    aging: 'AR aging',
  };

  return (
    <div className="w-full space-y-6" data-testid="reports-page">
      {/* 1. Blueprint Module Header */}
      <div className="border-b-2 border-[#0A0A0A] pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <nav
            aria-label="Breadcrumb"
            className="font-mono text-xs uppercase tracking-wider text-[#4A4945] flex items-center gap-1.5 pb-1"
          >
            <span>Modules</span>
            <span aria-hidden="true">/</span>
            <span>Reports</span>
            <span aria-hidden="true">/</span>
            <span className="text-[#0A0A0A] font-semibold">
              {tabDisplayTitles[activeTab] || 'Overview'}
            </span>
          </nav>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#0A0A0A]">
            Reports
          </h1>
          <p className="text-xs sm:text-sm text-[#4A4945] pt-0.5">
            Review activity, balances, and pending items.
          </p>
        </div>

        {/* Header Controls: Mechanical Entity Switcher */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div
            className="flex items-center bg-[#EAE8E3] p-0 rounded-none border border-[#0A0A0A] divide-x divide-[#0A0A0A]"
            data-testid="entity-switcher"
          >
            {(['ATA', 'LTA', 'ALL'] as const).map((ent) => (
              <button
                key={ent}
                type="button"
                onClick={() => setActiveEntity(ent)}
                className={`px-3 py-1.5 rounded-none font-mono text-xs transition-colors cursor-pointer ${
                  activeEntity === ent
                    ? 'bg-[#0A0A0A] text-[#FAF9F5] font-semibold'
                    : 'text-[#4A4945] hover:bg-[#E4E2DC] hover:text-[#0A0A0A] font-medium'
                }`}
                data-testid={`entity-btn-${ent.toLowerCase()}`}
              >
                {ent}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. Unified Industrial Tabs Navigation Strip */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="w-full justify-start rounded-none bg-[#EAE8E3] p-0 border border-[#0A0A0A] border-b-2 gap-0 h-auto overflow-x-auto scrollbar-none">
          {canViewReports && (
            <>
              <TabsTrigger
                value="overview"
                className="rounded-none border-r border-[#C8C5BC] bg-transparent px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-[#4A4945] hover:bg-[#E4E2DC] hover:text-[#0A0A0A] shadow-none data-[state=active]:bg-[#0A0A0A] data-[state=active]:text-[#FAF9F5] data-[state=active]:border-b-2 data-[state=active]:border-[#E61919] data-[state=active]:shadow-none transition-colors cursor-pointer"
                data-testid="tab-trigger-overview"
              >
                Overview
              </TabsTrigger>

              <TabsTrigger
                value="daily"
                className="rounded-none border-r border-[#C8C5BC] bg-transparent px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-[#4A4945] hover:bg-[#E4E2DC] hover:text-[#0A0A0A] shadow-none data-[state=active]:bg-[#0A0A0A] data-[state=active]:text-[#FAF9F5] data-[state=active]:border-b-2 data-[state=active]:border-[#E61919] data-[state=active]:shadow-none transition-colors cursor-pointer"
                data-testid="tab-trigger-daily"
              >
                Daily activity
              </TabsTrigger>

              <TabsTrigger
                value="weekly"
                className="rounded-none border-r border-[#C8C5BC] bg-transparent px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-[#4A4945] hover:bg-[#E4E2DC] hover:text-[#0A0A0A] shadow-none data-[state=active]:bg-[#0A0A0A] data-[state=active]:text-[#FAF9F5] data-[state=active]:border-b-2 data-[state=active]:border-[#E61919] data-[state=active]:shadow-none transition-colors cursor-pointer"
                data-testid="tab-trigger-weekly"
              >
                Weekly summary
              </TabsTrigger>

              <TabsTrigger
                value="monthly"
                className="rounded-none border-r border-[#C8C5BC] bg-transparent px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-[#4A4945] hover:bg-[#E4E2DC] hover:text-[#0A0A0A] shadow-none data-[state=active]:bg-[#0A0A0A] data-[state=active]:text-[#FAF9F5] data-[state=active]:border-b-2 data-[state=active]:border-[#E61919] data-[state=active]:shadow-none transition-colors cursor-pointer"
                data-testid="tab-trigger-monthly"
              >
                Monthly pending
              </TabsTrigger>
            </>
          )}

          {canViewBilling && (
            <TabsTrigger
              value="aging"
              className="rounded-none border-r border-[#C8C5BC] bg-transparent px-4 py-2.5 font-mono text-xs font-semibold uppercase tracking-wider text-[#4A4945] hover:bg-[#E4E2DC] hover:text-[#0A0A0A] shadow-none data-[state=active]:bg-[#0A0A0A] data-[state=active]:text-[#FAF9F5] data-[state=active]:border-b-2 data-[state=active]:border-[#E61919] data-[state=active]:shadow-none transition-colors cursor-pointer"
              data-testid="tab-trigger-aging"
            >
              AR aging
            </TabsTrigger>
          )}
        </TabsList>

        {/* Tab Contents: Detail Tabs in ALL Scope Render ReportScopePrompt */}
        {canViewReports && (
          <>
            <TabsContent value="overview" className="mt-4 focus-visible:outline-hidden">
              <AnalyticsOverviewTab />
            </TabsContent>

            <TabsContent value="daily" className="mt-4 focus-visible:outline-hidden">
              {activeEntity === 'ALL' ? <ReportScopePrompt /> : <DailyActivityTab />}
            </TabsContent>

            <TabsContent value="weekly" className="mt-4 focus-visible:outline-hidden">
              {activeEntity === 'ALL' ? <ReportScopePrompt /> : <WeeklySummaryTab />}
            </TabsContent>

            <TabsContent value="monthly" className="mt-4 focus-visible:outline-hidden">
              {activeEntity === 'ALL' ? <ReportScopePrompt /> : <MonthlyPendingTab />}
            </TabsContent>
          </>
        )}

        {canViewBilling && (
          <TabsContent value="aging" className="mt-4 focus-visible:outline-hidden">
            {activeEntity === 'ALL' ? <ReportScopePrompt /> : <AgingReportTab />}
          </TabsContent>
        )}
      </Tabs>

      {/* Root Modal Mount */}
      <BlockingActionModal />
    </div>
  );
}
