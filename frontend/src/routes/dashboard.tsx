import { useSessionStore } from '@/lib/session';
import { useEntityRealtimeSync } from '@/lib/realtime';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Building2, Bell, Clock } from 'lucide-react';
import { LogTimeWidget } from '@/features/dashboard/components/LogTimeWidget';
import { PendingTasksCard } from '@/features/dashboard/components/PendingTasksCard';
import { useTimeSummary } from '@/features/dashboard/api/useTimeEntries';
import { BlockingActionModal } from '@/features/operations/components/BlockingActionModal';

export default function DashboardPage() {
  const { user, permissions, activeEntity, setActiveEntity, unreadCount } = useSessionStore();
  const todayStr = new Date().toISOString().slice(0, 10);
  const { data: summary } = useTimeSummary(todayStr);

  // Collaborative Realtime CDC Subscriptions for Dashboard Live Sync (SPEC-DASHBOARD-ASSIGNED-TASKS-REALTIME-001 §R3 & SPEC-REALTIME-TIME-LOGGING-001)
  useEntityRealtimeSync({ table: 'tasks' });
  useEntityRealtimeSync({ table: 'task_assignees' });
  useEntityRealtimeSync({ table: 'work_requests' });
  useEntityRealtimeSync({ table: 'time_entries' });
  useEntityRealtimeSync({ table: 'task_time_logs' });

  const totalTodayMinutes = summary?.totalMinutes ?? 0;
  const hours = Math.floor(totalTodayMinutes / 60);
  const mins = totalTodayMinutes % 60;
  const formattedTodayTime = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  return (
    <div className="w-full space-y-6" data-testid="dashboard-page">
      {/* 1. Unified Module Header */}
      <div className="border-b border-[#CBD5E1] pb-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <nav
            aria-label="Breadcrumb"
            className="text-xs font-medium text-[#475569] flex items-center gap-1.5 pb-1"
          >
            <span>Modules</span>
            <span aria-hidden="true">/</span>
            <span className="text-[#0F172A] font-semibold">Dashboard</span>
          </nav>
          <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A]">
            Welcome back, {user?.name || 'User'}
          </h1>
          <p className="text-xs sm:text-sm text-[#475569] pt-0.5">
            ATA &amp; LTA Accounting Firm ERP — Enterprise Architecture v2.0
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {/* Soft Segmented Entity Switcher */}
          <div
            className="flex items-center bg-[#F1F5F9] p-1 rounded-[8px] border border-[#CBD5E1]"
            data-testid="entity-switcher"
          >
            {(['ATA', 'LTA', 'ALL'] as const).map((ent) => (
              <button
                key={ent}
                type="button"
                onClick={() => setActiveEntity(ent)}
                className={`px-3 py-1 rounded-[6px] text-xs font-semibold transition-colors cursor-pointer ${
                  activeEntity === ent
                    ? 'bg-[#1D4ED8] text-[#FFFFFF] shadow-2xs font-semibold'
                    : 'text-[#475569] hover:text-[#0F172A] hover:bg-[#E2E8F0]/60'
                }`}
                data-testid={`entity-btn-${ent.toLowerCase()}`}
              >
                {ent}
              </button>
            ))}
          </div>
          <Badge variant="secondary" className="text-xs font-medium rounded-[6px] border border-[#CBD5E1] bg-[#F1F5F9] text-[#0F172A] px-2.5 py-1">
            Role: {user?.role || 'Staff'}
          </Badge>
        </div>
      </div>

      {/* 2. Overview Stat Cards (Unified Structured KPI Band) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-[#FFFFFF] border border-[#CBD5E1] rounded-[8px] shadow-card space-y-2">
          <div className="flex flex-row items-center justify-between pb-1">
            <span className="text-xs font-medium text-[#475569]">Current Role</span>
            <ShieldCheck className="h-4 w-4 text-[#1D4ED8]" />
          </div>
          <div>
            <div className="text-2xl font-semibold font-mono tabular-nums text-[#0F172A]" data-testid="stat-role">{user?.role}</div>
            <p className="text-xs text-[#475569] mt-1">
              {permissions.size} active permissions granted
            </p>
          </div>
        </div>

        <div className="p-4 bg-[#FFFFFF] border border-[#CBD5E1] rounded-[8px] shadow-card space-y-2">
          <div className="flex flex-row items-center justify-between pb-1">
            <span className="text-xs font-medium text-[#475569]">Active Entity</span>
            <Building2 className="h-4 w-4 text-[#1D4ED8]" />
          </div>
          <div>
            <div className="text-2xl font-semibold font-mono tabular-nums text-[#0F172A]" data-testid="stat-entity">{activeEntity}</div>
            <p className="text-xs text-[#475569] mt-1">
              Entities: {(user?.entities || []).join(', ') || 'None'}
            </p>
          </div>
        </div>

        <div className="p-4 bg-[#FFFFFF] border border-[#CBD5E1] rounded-[8px] shadow-card space-y-2">
          <div className="flex flex-row items-center justify-between pb-1">
            <span className="text-xs font-medium text-[#475569]">Notifications</span>
            <Bell className="h-4 w-4 text-[#1D4ED8]" />
          </div>
          <div>
            <div className="text-2xl font-semibold font-mono tabular-nums text-[#0F172A]" data-testid="stat-unread-count">{unreadCount}</div>
            <p className="text-xs text-[#475569] mt-1">Unread alerts requiring attention</p>
          </div>
        </div>

        <div className="p-4 bg-[#FFFFFF] border border-[#CBD5E1] rounded-[8px] shadow-card space-y-2">
          <div className="flex flex-row items-center justify-between pb-1">
            <span className="text-xs font-medium text-[#475569]">Today's Time Logged</span>
            <Clock className="h-4 w-4 text-[#1D4ED8]" />
          </div>
          <div>
            <div className="text-2xl font-semibold font-mono tabular-nums text-[#0F172A]" data-testid="stat-today-hours">
              {formattedTodayTime}
            </div>
            <p className="text-xs text-[#475569] mt-1">
              {summary?.byTask.length ?? 0} tasks logged today
            </p>
          </div>
        </div>
      </div>

      {/* Dashboard Pending Tasks Card */}
      <PendingTasksCard />

      {/* Module #2: Log-Time Widget & Daily Breakdown */}
      <LogTimeWidget />

      {/* Blocking Action Modal for RFC 7807 Error Discipline and Mutation States */}
      <BlockingActionModal />
    </div>
  );
}
