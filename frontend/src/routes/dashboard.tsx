import { useSessionStore } from '@/lib/session';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
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

  const totalTodayMinutes = summary?.totalMinutes ?? 0;
  const hours = Math.floor(totalTodayMinutes / 60);
  const mins = totalTodayMinutes % 60;
  const formattedTodayTime = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      {/* Welcome Banner */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1e293b]">
            Welcome back, {user?.name || 'User'}
          </h1>
          <p className="text-sm text-[#9494a0]">
            ATA &amp; LTA Accounting Firm ERP — Enterprise Architecture v2.0
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="ata" className="text-xs font-semibold">
            {activeEntity || 'ATA'} ACTIVE
          </Badge>
          <Badge variant="secondary" className="text-xs">
            Role: {user?.role || 'Staff'}
          </Badge>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-[#9494a0]">Current Role</CardTitle>
            <ShieldCheck className="h-4 w-4 text-[#2563eb]" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-[#1e293b]" data-testid="stat-role">{user?.role}</div>
            <p className="text-[11px] text-[#9494a0] mt-1">
              {permissions.size} active permissions granted
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-[#9494a0]">Active Entity</CardTitle>
            <Building2 className="h-4 w-4 text-[#475569]" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-[#1e293b]" data-testid="stat-entity">{activeEntity}</div>
            <p className="text-[11px] text-[#9494a0] mt-1">
              Entities: {(user?.entities || []).join(', ') || 'None'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-[#9494a0]">Notifications</CardTitle>
            <Bell className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-[#1e293b]" data-testid="stat-unread-count">{unreadCount}</div>
            <p className="text-[11px] text-[#9494a0] mt-1">Unread alerts requiring attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-[#9494a0]">Today's Time Logged</CardTitle>
            <Clock className="h-4 w-4 text-[#10b981]" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-[#10b981]" data-testid="stat-today-hours">
              {formattedTodayTime}
            </div>
            <p className="text-[11px] text-[#9494a0] mt-1">
              {summary?.byTask.length ?? 0} tasks logged today
            </p>
          </CardContent>
        </Card>
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
