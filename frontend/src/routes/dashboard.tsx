import { useSessionStore } from '@/lib/session';
import { useEntityRealtimeSync } from '@/lib/realtime';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Building2, Bell, Clock } from 'lucide-react';
import { LogTimeWidget } from '@/features/dashboard/components/LogTimeWidget';
import { PendingTasksCard } from '@/features/dashboard/components/PendingTasksCard';
import { useTimeSummary } from '@/features/dashboard/api/useTimeEntries';
import { BlockingActionModal } from '@/features/operations/components/BlockingActionModal';

export default function DashboardPage() {
  const { user, permissions, activeEntity, unreadCount } = useSessionStore();
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
      {/* 1. Blueprint Module Header */}
      <div className="border-b-2 border-[#0A0A0A] pb-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <nav
            aria-label="Breadcrumb"
            className="font-mono text-xs uppercase tracking-wider text-[#4A4945] flex items-center gap-1.5 pb-1"
          >
            <span>Modules</span>
            <span aria-hidden="true">/</span>
            <span className="text-[#0A0A0A] font-semibold">Dashboard</span>
          </nav>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#0A0A0A]">
            Welcome back, {user?.name || 'User'}
          </h1>
          <p className="text-xs sm:text-sm text-[#4A4945] pt-0.5">
            ATA &amp; LTA Accounting Firm ERP — Enterprise Architecture v2.0
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          <Badge variant="ata" className="text-xs font-mono font-semibold rounded-none border border-[#0A0A0A]">
            {activeEntity || 'ATA'} ACTIVE
          </Badge>
          <Badge variant="secondary" className="text-xs font-mono rounded-none border border-[#C8C5BC] bg-[#EAE8E3] text-[#0A0A0A]">
            Role: {user?.role || 'Staff'}
          </Badge>
        </div>
      </div>

      {/* 2. Overview Stat Cards (Blueprint Telemetry Matrix) */}
      <div className="grid gap-px bg-[#0A0A0A] border border-[#0A0A0A] sm:grid-cols-2 lg:grid-cols-4">
        <div className="p-4 bg-[#FAF9F5] space-y-2">
          <div className="flex flex-row items-center justify-between pb-1">
            <span className="text-xs font-mono uppercase tracking-wider text-[#4A4945]">Current Role</span>
            <ShieldCheck className="h-4 w-4 text-[#0A0A0A]" />
          </div>
          <div>
            <div className="text-xl font-bold font-mono tabular-nums text-[#0A0A0A]" data-testid="stat-role">{user?.role}</div>
            <p className="text-xs text-[#4A4945] mt-1 font-mono">
              {permissions.size} active permissions granted
            </p>
          </div>
        </div>

        <div className="p-4 bg-[#FAF9F5] space-y-2">
          <div className="flex flex-row items-center justify-between pb-1">
            <span className="text-xs font-mono uppercase tracking-wider text-[#4A4945]">Active Entity</span>
            <Building2 className="h-4 w-4 text-[#0A0A0A]" />
          </div>
          <div>
            <div className="text-xl font-bold font-mono tabular-nums text-[#0A0A0A]" data-testid="stat-entity">{activeEntity}</div>
            <p className="text-xs text-[#4A4945] mt-1 font-mono">
              Entities: {(user?.entities || []).join(', ') || 'None'}
            </p>
          </div>
        </div>

        <div className="p-4 bg-[#FAF9F5] space-y-2">
          <div className="flex flex-row items-center justify-between pb-1">
            <span className="text-xs font-mono uppercase tracking-wider text-[#4A4945]">Notifications</span>
            <Bell className="h-4 w-4 text-[#0A0A0A]" />
          </div>
          <div>
            <div className="text-xl font-bold font-mono tabular-nums text-[#0A0A0A]" data-testid="stat-unread-count">{unreadCount}</div>
            <p className="text-xs text-[#4A4945] mt-1 font-mono">Unread alerts requiring attention</p>
          </div>
        </div>

        <div className="p-4 bg-[#FAF9F5] space-y-2">
          <div className="flex flex-row items-center justify-between pb-1">
            <span className="text-xs font-mono uppercase tracking-wider text-[#4A4945]">Today's Time Logged</span>
            <Clock className="h-4 w-4 text-[#0A0A0A]" />
          </div>
          <div>
            <div className="text-xl font-bold font-mono tabular-nums text-[#0A0A0A]" data-testid="stat-today-hours">
              {formattedTodayTime}
            </div>
            <p className="text-xs text-[#4A4945] mt-1 font-mono">
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
