import { useSessionStore } from '@/lib/session';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, Building2, Bell, Sparkles } from 'lucide-react';

export default function DashboardPage() {
  const { user, permissions, activeEntity, unreadCount } = useSessionStore();

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
            <div className="text-xl font-bold text-[#1e293b]">{user?.role}</div>
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
            <div className="text-xl font-bold text-[#1e293b]">{activeEntity}</div>
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
            <div className="text-xl font-bold text-[#1e293b]">{unreadCount}</div>
            <p className="text-[11px] text-[#9494a0] mt-1">Unread alerts requiring attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-[#9494a0]">System Mode</CardTitle>
            <Sparkles className="h-4 w-4 text-[#10b981]" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-[#10b981]">Phase 1 Active</div>
            <p className="text-[11px] text-[#9494a0] mt-1">React 19 scaffold + frozen tokens</p>
          </CardContent>
        </Card>
      </div>

      {/* Migration Notice */}
      <Card className="border-l-4 border-l-[#2563eb]">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-[#1e293b]">
            Enterprise Migration Program — Phase 1 React Scaffold
          </CardTitle>
          <CardDescription className="text-xs text-[#9494a0]">
            The frontend shell is authenticated against the staging API and strictly enforces role-based
            access control via <code>usePermission</code>. All module routes are rendered as placeholders
            under rule R1 / R5 until Phase 2 module implementations commence.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
