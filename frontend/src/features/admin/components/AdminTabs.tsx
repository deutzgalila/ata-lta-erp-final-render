import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Users,
  ShieldCheck,
  FileSpreadsheet,
  History,
  Lock,
} from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { UserListTable } from './UserListTable';
import { UserCreateModal } from './UserCreateModal';
import { UserEditModal } from './UserEditModal';
import { UserDisableModal } from './UserDisableModal';
import { UserDetailModal } from './UserDetailModal';
import { PermissionsMatrixView } from './PermissionsMatrixView';
import { RetainerTemplateList } from './RetainerTemplateList';
import { RetainerTemplateModal } from './RetainerTemplateModal';
import { RetainerGenerationLogs } from './RetainerGenerationLogs';
import { useUsersList } from '../api/useUsers';
import { useRetainerTemplatesList } from '../api/useRetainerTemplates';
import { useAuditCount } from '../api/useRetainerGenerations';
import { usePermission } from '@/lib/permissions';
import { PERMISSION_KEYS } from '../utils/permissionsMatrix';
import type { AdminUser, RetainerTemplate } from '../api/types';

export function AdminTabs() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'users';

  const canManageUsers = usePermission('users:manage');
  const canEditRetainers = usePermission('retainers:edit');

  // Query counts for badges
  const { data: users = [] } = useUsersList();
  const { data: templates = [] } = useRetainerTemplatesList();
  const { data: auditCountData } = useAuditCount();

  const activeUsersCount = users.filter((u) => u.isActive).length;

  // Modal States
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [disablingUser, setDisablingUser] = useState<AdminUser | null>(null);
  const [inspectingUser, setInspectingUser] = useState<AdminUser | null>(null);

  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<RetainerTemplate | null>(null);

  const handleTabChange = (tab: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', tab);
      return next;
    });
  };

  return (
    <div className="space-y-6" data-testid="admin-tabs-container">
      {/* Header Profile & Security Notice */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-[#2563eb]" />
            Enterprise Administration
          </h1>
          <p className="text-xs text-slate-500 pt-0.5">
            User provisioning, RBAC matrix governance, and recurring retainer template blueprints.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs bg-slate-50 text-slate-700 border-slate-200">
            <Lock className="h-3 w-3 mr-1 text-slate-400" />
            Admin Gated (<code className="font-mono text-[11px]">users:manage</code>)
          </Badge>
        </div>
      </div>

      {/* Tabs Layout */}
      <Tabs value={currentTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="bg-slate-100 p-1 rounded-lg border border-slate-200">
          {/* Tab: Users */}
          <TabsTrigger
            value="users"
            className="gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-xs"
            data-testid="tab-trigger-users"
          >
            <Users className="h-3.5 w-3.5" />
            <span>Team Members</span>
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-blue-50 text-blue-700 border-blue-200">
              {activeUsersCount}
            </Badge>
          </TabsTrigger>

          {/* Tab: Permissions Matrix */}
          <TabsTrigger
            value="permissions"
            className="gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-xs"
            data-testid="tab-trigger-permissions"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Permissions Matrix</span>
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-slate-50 text-slate-700">
              {PERMISSION_KEYS.length}
            </Badge>
          </TabsTrigger>

          {/* Tab: Retainer Templates */}
          <TabsTrigger
            value="retainers"
            className="gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-xs"
            data-testid="tab-trigger-retainers"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            <span>Retainer Templates</span>
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-purple-50 text-purple-700 border-purple-200">
              {templates.length}
            </Badge>
          </TabsTrigger>

          {/* Tab: Generation Logs */}
          <TabsTrigger
            value="generations"
            className="gap-2 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-xs"
            data-testid="tab-trigger-generations"
          >
            <History className="h-3.5 w-3.5" />
            <span>Generation Logs</span>
            {auditCountData?.total !== undefined && (
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 bg-slate-50 text-slate-600">
                {auditCountData.total}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Users */}
        <TabsContent value="users" className="space-y-4 pt-1" data-testid="tab-content-users">
          <UserListTable
            onAddUser={() => setIsCreateUserOpen(true)}
            onEditUser={(u) => setEditingUser(u)}
            onDisableUser={(u) => setDisablingUser(u)}
            onViewDetails={(u) => setInspectingUser(u)}
          />
        </TabsContent>

        {/* Tab 2: Permissions Matrix */}
        <TabsContent value="permissions" className="space-y-4 pt-1" data-testid="tab-content-permissions">
          <PermissionsMatrixView />
        </TabsContent>

        {/* Tab 3: Retainer Templates */}
        <TabsContent value="retainers" className="space-y-4 pt-1" data-testid="tab-content-retainers">
          <RetainerTemplateList
            onNewTemplate={() => {
              setEditingTemplate(null);
              setIsTemplateModalOpen(true);
            }}
            onEditTemplate={(tpl) => {
              setEditingTemplate(tpl);
              setIsTemplateModalOpen(true);
            }}
          />
        </TabsContent>

        {/* Tab 4: Generation Logs */}
        <TabsContent value="generations" className="space-y-4 pt-1" data-testid="tab-content-generations">
          <RetainerGenerationLogs />
        </TabsContent>
      </Tabs>

      {/* User Modals */}
      {canManageUsers && (
        <>
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
        </>
      )}

      {/* User Details Inspector Modal */}
      <UserDetailModal
        user={inspectingUser}
        isOpen={Boolean(inspectingUser)}
        onClose={() => setInspectingUser(null)}
      />

      {/* Retainer Template Builder Modal */}
      {canEditRetainers && (
        <RetainerTemplateModal
          template={editingTemplate}
          isOpen={isTemplateModalOpen}
          onClose={() => {
            setIsTemplateModalOpen(false);
            setEditingTemplate(null);
          }}
        />
      )}
    </div>
  );
}
