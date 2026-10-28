import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Users, History, Shield } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useUsersList } from '../api/useUsers';
import { useAuditCount } from '../api/useAuditLogs';
import { useEntityRealtimeSync } from '@/lib/realtime';
import { UserListTable } from './UserListTable';
import { UserCreateModal } from './UserCreateModal';
import { UserEditModal } from './UserEditModal';
import { UserDisableModal } from './UserDisableModal';
import { UserDetailModal } from './UserDetailModal';
import { AuditLogView } from './AuditLogView';
import type { AdminUser } from '../api/types';

export interface AdminTabsProps {
  defaultTab?: 'users' | 'audit';
}

export function AdminTabs({ defaultTab }: AdminTabsProps = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const currentTab =
    urlTab === 'audit' || urlTab === 'users'
      ? urlTab
      : defaultTab || 'users';

  // Realtime CDC Subscriptions for Admin Domain
  useEntityRealtimeSync({
    table: 'users',
    queryKey: ['admin', 'users'],
  });
  useEntityRealtimeSync({
    table: 'user_departments',
    queryKey: ['admin', 'users'],
  });
  useEntityRealtimeSync({
    table: 'audit_logs',
    queryKey: ['admin', 'audit'],
    countQueryKey: ['admin', 'audit', 'count'],
  });

  // Tab Counts
  const { data: users = [] } = useUsersList();
  const { data: auditCountData } = useAuditCount();

  const activeUsersCount = users.filter((u) => u.isActive).length;
  const auditCount = auditCountData?.total ?? 0;

  // User Modal States
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [disablingUser, setDisablingUser] = useState<AdminUser | null>(null);
  const [inspectingUser, setInspectingUser] = useState<AdminUser | null>(null);

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  return (
    <div className="space-y-5" data-testid="admin-tabs-container">
      {/* Page Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-[#E2E8F0] pb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-[4px] bg-[#0F172A] text-white">
              <Shield className="h-4 w-4" />
            </div>
            <h1 className="text-xl font-bold text-[#0F172A] tracking-tight">
              Enterprise Administration
            </h1>
          </div>
          <p className="text-xs text-[#475569]">
            Manage user accounts, role assignments, entity scopes, and inspect the immutable system audit ledger.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="text-[11px] bg-[#F8FAFC] text-[#0F172A] border-[#CBD5E1] rounded-[4px] py-1 px-2.5 font-mono"
          >
            Admin Access: users:manage
          </Badge>
        </div>
      </div>

      {/* Main 2-Tab Navigation: Users & Audit Log */}
      <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full space-y-4">
        <TabsList
          className="h-9 bg-[#F8FAFC] p-0.5 rounded-[4px] border border-[#CBD5E1]"
          data-testid="admin-tabs-list"
        >
          {/* Tab 1: User Management */}
          <TabsTrigger
            value="users"
            className="gap-1.5 rounded-[3px] px-3 py-1 text-xs font-semibold text-[#475569] data-[state=active]:bg-[#0F172A] data-[state=active]:text-white data-[state=active]:shadow-none"
            data-testid="tab-trigger-users"
          >
            <Users className="h-3.5 w-3.5" />
            <span>User Management</span>
            <Badge
              variant="secondary"
              className="ml-1 text-[10px] py-0 px-1.5 h-4 rounded-[3px] bg-[#E2E8F0] text-[#0F172A] font-mono tabular-nums"
              data-testid="tab-users-count"
            >
              {users.length}
            </Badge>
          </TabsTrigger>

          {/* Tab 2: Audit Log */}
          <TabsTrigger
            value="audit"
            className="gap-1.5 rounded-[3px] px-3 py-1 text-xs font-semibold text-[#475569] data-[state=active]:bg-[#0F172A] data-[state=active]:text-white data-[state=active]:shadow-none"
            data-testid="tab-trigger-audit"
          >
            <History className="h-3.5 w-3.5" />
            <span>Audit Log</span>
            <Badge
              variant="secondary"
              className="ml-1 text-[10px] py-0 px-1.5 h-4 rounded-[3px] bg-[#E2E8F0] text-[#0F172A] font-mono tabular-nums"
              data-testid="tab-audit-count"
            >
              {auditCount}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {/* Tab Content 1: Users */}
        <TabsContent value="users" className="mt-0 outline-none" data-testid="tab-content-users">
          <UserListTable
            onAddUser={() => setIsCreateUserOpen(true)}
            onEditUser={(u) => setEditingUser(u)}
            onDisableUser={(u) => setDisablingUser(u)}
            onViewDetails={(u) => setInspectingUser(u)}
          />
        </TabsContent>

        {/* Tab Content 2: Audit Log */}
        <TabsContent value="audit" className="mt-0 outline-none" data-testid="tab-content-audit">
          <AuditLogView />
        </TabsContent>
      </Tabs>

      {/* Modals for User Management */}
      <UserCreateModal
        isOpen={isCreateUserOpen}
        onClose={() => setIsCreateUserOpen(false)}
        activeUsersCount={activeUsersCount}
      />

      <UserEditModal
        user={editingUser}
        isOpen={Boolean(editingUser)}
        onClose={() => setEditingUser(null)}
      />

      <UserDisableModal
        user={disablingUser}
        isOpen={Boolean(disablingUser)}
        onClose={() => setDisablingUser(null)}
      />

      <UserDetailModal
        user={inspectingUser}
        isOpen={Boolean(inspectingUser)}
        onClose={() => setInspectingUser(null)}
      />
    </div>
  );
}
