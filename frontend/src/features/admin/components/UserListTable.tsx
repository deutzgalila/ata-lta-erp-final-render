import { useState, useMemo } from 'react';
import {
  Search,
  UserPlus,
  Edit2,
  UserX,
  Eye,
  RotateCcw,
  ShieldAlert,
  AlertTriangle,
} from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ConflictResolutionModal,
  isConcurrencyConflictError,
} from '@/components/common/ConflictResolutionModal';
import { useBlockingModalStore } from '@/features/operations/components/BlockingActionModal';
import { useUsersList, useUserMutations } from '../api/useUsers';
import { useSessionStore } from '@/lib/session';
import { usePermission } from '@/lib/permissions';
import { UserCreateModal } from './UserCreateModal';
import { UserEditModal } from './UserEditModal';
import { UserDisableModal } from './UserDisableModal';
import { UserDetailModal } from './UserDetailModal';
import type { AdminUser, DepartmentName, EntityCode } from '../api/types';

export interface UserListTableProps {
  onAddUser?: () => void;
  onEditUser?: (user: AdminUser) => void;
  onDisableUser?: (user: AdminUser) => void;
  onViewDetails?: (user: AdminUser) => void;
}

const ROLE_BADGE_COLORS: Record<string, string> = {
  Admin: 'bg-[#0F172A] text-white border-[#0F172A]',
  Manager: 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]',
  Accounting: 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]',
  Operations: 'bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]',
  Documentation: 'bg-[#F8FAFC] text-[#334155] border-[#CBD5E1]',
  HR: 'bg-[#FFF1F2] text-[#BE123C] border-[#FECDD3]',
};

const DEPARTMENT_BADGE_COLORS: Record<string, string> = {
  Management: 'bg-[#EFF6FF] text-[#1D4ED8] border-[#BFDBFE]',
  Accounting: 'bg-[#ECFDF5] text-[#047857] border-[#A7F3D0]',
  Operations: 'bg-[#FFFBEB] text-[#B45309] border-[#FDE68A]',
  Documentation: 'bg-[#F8FAFC] text-[#334155] border-[#CBD5E1]',
  HR: 'bg-[#FFF1F2] text-[#BE123C] border-[#FECDD3]',
};

export function UserListTable({
  onAddUser,
  onEditUser,
  onDisableUser,
  onViewDetails,
}: UserListTableProps = {}) {
  const currentUser = useSessionStore((state) => state.user);
  const canManageUsers = usePermission('users:manage');
  const { updateUser } = useUserMutations();

  // Filter States
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('ALL');
  const [roleFilter, setRoleFilter] = useState<string>('ALL');
  const [entityFilter, setEntityFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Standalone fallback modal states when parent callbacks are omitted
  const [internalCreateOpen, setInternalCreateOpen] = useState(false);
  const [internalEditUser, setInternalEditUser] = useState<AdminUser | null>(null);
  const [internalDisableUser, setInternalDisableUser] = useState<AdminUser | null>(null);
  const [internalDetailUser, setInternalDetailUser] = useState<AdminUser | null>(null);
  const [conflictOpen, setConflictOpen] = useState(false);

  const { data: users = [], isLoading, error, refetch } = useUsersList();

  // Active users count
  const activeCount = useMemo(() => users.filter((u) => u.isActive).length, [users]);
  const isAtOrAboveCap = activeCount >= 15;

  // Filtered users
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesName = u.name.toLowerCase().includes(query);
        const matchesEmail = u.email.toLowerCase().includes(query);
        if (!matchesName && !matchesEmail) return false;
      }

      if (departmentFilter !== 'ALL') {
        if (!u.departments.includes(departmentFilter as DepartmentName)) {
          return false;
        }
      }

      if (roleFilter !== 'ALL') {
        if (u.role !== roleFilter) return false;
      }

      if (entityFilter !== 'ALL') {
        if (!u.entities.includes(entityFilter as EntityCode)) return false;
      }

      if (statusFilter === 'active' && !u.isActive) return false;
      if (statusFilter === 'disabled' && u.isActive) return false;

      return true;
    });
  }, [users, search, departmentFilter, roleFilter, entityFilter, statusFilter]);

  const handleAddClick = () => {
    if (onAddUser) {
      onAddUser();
    } else {
      setInternalCreateOpen(true);
    }
  };

  const handleEditClick = (user: AdminUser) => {
    if (onEditUser) {
      onEditUser(user);
    } else {
      setInternalEditUser(user);
    }
  };

  const handleDisableClick = (user: AdminUser) => {
    if (onDisableUser) {
      onDisableUser(user);
    } else {
      setInternalDisableUser(user);
    }
  };

  const handleViewDetailsClick = (user: AdminUser) => {
    if (onViewDetails) {
      onViewDetails(user);
    } else {
      setInternalDetailUser(user);
    }
  };

  const handleReEnableUser = async (user: AdminUser) => {
    try {
      await updateUser(user.id, {
        status: 'Active',
        isActive: true,
        expectedVersion: user.version ?? 1,
      });
    } catch (err) {
      if (isConcurrencyConflictError(err)) {
        useBlockingModalStore.getState().reset();
        setConflictOpen(true);
      }
    }
  };

  return (
    <div className="space-y-4" data-testid="user-list-table-container">
      {/* Active User Cap Notification Banner */}
      {isAtOrAboveCap && (
        <div
          className="flex items-center gap-2 rounded-[4px] border border-[#F59E0B] bg-[#FFFBEB] p-3 text-xs text-[#92400E]"
          data-testid="user-cap-banner"
        >
          <AlertTriangle className="h-4 w-4 shrink-0 text-[#D97706]" />
          <span>
            <strong>User Account Cap Alert:</strong> System currently has {activeCount} active user accounts (maximum recommended cap is 15). Adding new accounts may be restricted until an inactive account is disabled.
          </span>
        </div>
      )}

      {/* Filter Toolbar & Actions */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-[4px] border border-[#CBD5E1] bg-[#F8FAFC] p-3">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {/* Search Input */}
          <div className="relative min-w-[200px] flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#64748B]" />
            <Input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-xs h-8 rounded-[4px] border-[#CBD5E1] bg-white text-[#0F172A]"
              data-testid="user-search-input"
            />
          </div>

          {/* Department Filter */}
          <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
            <SelectTrigger
              className="h-8 w-[140px] rounded-[4px] border-[#CBD5E1] text-xs bg-white text-[#0F172A]"
              data-testid="filter-department-select"
            >
              <SelectValue placeholder="Department" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Departments</SelectItem>
              <SelectItem value="Management">Management</SelectItem>
              <SelectItem value="Accounting">Accounting</SelectItem>
              <SelectItem value="Operations">Operations</SelectItem>
              <SelectItem value="Documentation">Documentation</SelectItem>
              <SelectItem value="HR">HR</SelectItem>
            </SelectContent>
          </Select>

          {/* Role Filter */}
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger
              className="h-8 w-[120px] rounded-[4px] border-[#CBD5E1] text-xs bg-white text-[#0F172A]"
              data-testid="filter-role-select"
            >
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Roles</SelectItem>
              <SelectItem value="Admin">Admin</SelectItem>
              <SelectItem value="Manager">Manager</SelectItem>
              <SelectItem value="Accounting">Accounting</SelectItem>
              <SelectItem value="Operations">Operations</SelectItem>
              <SelectItem value="Documentation">Documentation</SelectItem>
              <SelectItem value="HR">HR</SelectItem>
            </SelectContent>
          </Select>

          {/* Entity Filter */}
          <Select value={entityFilter} onValueChange={setEntityFilter}>
            <SelectTrigger
              className="h-8 w-[110px] rounded-[4px] border-[#CBD5E1] text-xs bg-white text-[#0F172A]"
              data-testid="filter-entity-select"
            >
              <SelectValue placeholder="Entity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Entities</SelectItem>
              <SelectItem value="ATA">ATA</SelectItem>
              <SelectItem value="LTA">LTA</SelectItem>
            </SelectContent>
          </Select>

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger
              className="h-8 w-[110px] rounded-[4px] border-[#CBD5E1] text-xs bg-white text-[#0F172A]"
              data-testid="filter-status-select"
            >
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="disabled">Disabled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Action Button: Add User */}
        {canManageUsers && (
          <Button
            onClick={handleAddClick}
            size="sm"
            className="h-8 gap-1.5 rounded-[4px] text-xs font-semibold bg-[#0F172A] text-white hover:bg-[#1E293B] shadow-none shrink-0"
            data-testid="add-user-button"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add User
          </Button>
        )}
      </div>

      {/* Users Table */}
      <div className="rounded-[4px] border border-[#CBD5E1] bg-white overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-[#475569] space-y-2">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-[#E2E8F0] border-t-[#0F172A]" />
            <p>Loading enterprise user accounts...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-xs text-[#DC2626] space-y-2">
            <ShieldAlert className="h-6 w-6 mx-auto" />
            <p>Failed to load user accounts: {error.message}</p>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-8 text-center text-xs text-[#475569] space-y-1">
            <p className="font-semibold text-[#0F172A]">No users found</p>
            <p>Try adjusting your search criteria or filters.</p>
          </div>
        ) : (
          <Table data-testid="user-table">
            <TableHeader className="bg-[#F8FAFC] border-b border-[#CBD5E1]">
              <TableRow className="hover:bg-[#F8FAFC]">
                <TableHead className="w-[70px] text-[11px] font-semibold uppercase tracking-[0.05em] text-[#475569]">
                  #
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#475569]">
                  User / Name
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#475569]">
                  Role
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#475569]">
                  Departments
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#475569]">
                  Email
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#475569]">
                  Entities
                </TableHead>
                <TableHead className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#475569]">
                  Status
                </TableHead>
                <TableHead className="text-right text-[11px] font-semibold uppercase tracking-[0.05em] text-[#475569]">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.map((user, idx) => {
                const isSelf = user.id === currentUser?.id;
                const rowKey = `USR-${String(idx + 1).padStart(2, '0')}`;

                return (
                  <TableRow
                    key={user.id}
                    data-testid={`user-row-${user.id}`}
                    className="border-b border-[#E2E8F0] hover:bg-[#F1F5F9] transition-colors"
                  >
                    {/* Index / Key Tag */}
                    <TableCell className="text-xs text-[#475569] font-mono tabular-nums font-medium">
                      {rowKey}
                    </TableCell>

                    {/* Name + Self Indicator */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-[4px] bg-[#0F172A] text-xs font-bold text-white font-mono">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span
                              className="font-semibold text-xs text-[#0F172A]"
                              data-testid={`user-name-${user.id}`}
                            >
                              {user.name}
                            </span>
                            {isSelf && (
                              <Badge
                                variant="outline"
                                className="text-[10px] py-0 px-1 rounded-[3px] border-[#CBD5E1] bg-[#F8FAFC] text-[#0F172A] font-mono"
                              >
                                You
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </TableCell>

                    {/* Role */}
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[11px] rounded-[3px] py-0.5 px-2 font-semibold ${
                          ROLE_BADGE_COLORS[user.role] ??
                          'bg-[#F8FAFC] text-[#0F172A] border-[#CBD5E1]'
                        }`}
                        data-testid={`user-role-${user.id}`}
                      >
                        {user.role}
                      </Badge>
                    </TableCell>

                    {/* Departments */}
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[220px]">
                        {user.departments.length > 0 ? (
                          user.departments.map((dept) => {
                            const isAdminUser =
                              user.role === 'Admin' || user.email === 'lorein@ata-lta.ph';
                            const displayDept =
                              isAdminUser && dept === 'Management' ? 'Admin' : dept;
                            return (
                              <Badge
                                key={dept}
                                variant="outline"
                                className={`text-[10px] rounded-[3px] py-0 px-1.5 font-medium ${
                                  displayDept === 'Admin'
                                    ? 'bg-[#FEF2F2] text-[#DC2626] border-[#FECACA]'
                                    : DEPARTMENT_BADGE_COLORS[dept] ??
                                      'bg-[#F8FAFC] text-[#0F172A] border-[#CBD5E1]'
                                }`}
                              >
                                {displayDept}
                              </Badge>
                            );
                          })
                        ) : (
                          <span className="text-[#64748B] text-xs">—</span>
                        )}
                      </div>
                    </TableCell>

                    {/* Email */}
                    <TableCell className="text-xs text-[#475569] font-mono tabular-nums">
                      {user.email}
                    </TableCell>

                    {/* Entities */}
                    <TableCell>
                      <div className="flex gap-1">
                        {user.entities.map((ent) => (
                          <Badge
                            key={ent}
                            variant="outline"
                            className="text-[10px] rounded-[3px] py-0 px-1.5 border-[#CBD5E1] bg-[#F8FAFC] text-[#0F172A] font-mono font-semibold"
                          >
                            {ent}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>

                    {/* Status Pill */}
                    <TableCell>
                      {user.isActive ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-[3px] border border-[#A7F3D0] bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-semibold text-[#047857]"
                          data-testid={`user-status-${user.id}`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                          Active
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 rounded-[3px] border border-[#CBD5E1] bg-[#F1F5F9] px-2 py-0.5 text-[11px] font-semibold text-[#475569]"
                          data-testid={`user-status-${user.id}`}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-[#94A3B8]" />
                          Disabled
                        </span>
                      )}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* View User Profile */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewDetailsClick(user)}
                          className="h-7 w-7 p-0 rounded-[4px] text-[#475569] hover:text-[#0F172A] hover:bg-[#E2E8F0]"
                          title="View User Profile"
                          data-testid={`user-detail-btn-${user.id}`}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>

                        {/* Edit User */}
                        {canManageUsers && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditClick(user)}
                            className="h-7 w-7 p-0 rounded-[4px] text-[#475569] hover:text-[#0F172A] hover:bg-[#E2E8F0]"
                            title="Edit User"
                            data-testid={`user-edit-btn-${user.id}`}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                        )}

                        {/* Disable User with Self-Protection OR Re-enable Disabled User */}
                        {canManageUsers &&
                          (user.isActive ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDisableClick(user)}
                              disabled={isSelf}
                              className={`h-7 w-7 p-0 rounded-[4px] ${
                                isSelf
                                  ? 'text-[#CBD5E1] cursor-not-allowed'
                                  : 'text-[#475569] hover:text-[#DC2626] hover:bg-[#FEF2F2]'
                              }`}
                              title={
                                isSelf
                                  ? 'Cannot disable your own account'
                                  : 'Disable User Account'
                              }
                              data-testid={`user-disable-btn-${user.id}`}
                            >
                              <UserX className="h-3.5 w-3.5" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleReEnableUser(user)}
                              className="h-7 w-7 p-0 rounded-[4px] text-[#047857] hover:text-[#065F46] hover:bg-[#ECFDF5]"
                              title="Re-enable user account"
                              data-testid={`user-enable-btn-${user.id}`}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                          ))}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Standalone Fallback Modals when rendered outside AdminTabs */}
      {!onAddUser && (
        <UserCreateModal
          isOpen={internalCreateOpen}
          onClose={() => setInternalCreateOpen(false)}
          activeUsersCount={activeCount}
        />
      )}
      {!onEditUser && (
        <UserEditModal
          user={internalEditUser}
          isOpen={Boolean(internalEditUser)}
          onClose={() => setInternalEditUser(null)}
        />
      )}
      {!onDisableUser && (
        <UserDisableModal
          user={internalDisableUser}
          isOpen={Boolean(internalDisableUser)}
          onClose={() => setInternalDisableUser(null)}
        />
      )}
      {!onViewDetails && (
        <UserDetailModal
          user={internalDetailUser}
          isOpen={Boolean(internalDetailUser)}
          onClose={() => setInternalDetailUser(null)}
        />
      )}

      <ConflictResolutionModal
        open={conflictOpen}
        onOpenChange={setConflictOpen}
        entityLabel="user account"
        onReload={() => {
          setConflictOpen(false);
          void refetch();
        }}
      />
    </div>
  );
}
