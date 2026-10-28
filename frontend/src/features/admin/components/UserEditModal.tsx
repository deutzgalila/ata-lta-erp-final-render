import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { GuardedPasswordInput } from './GuardedPasswordInput';
import { useUserMutations } from '../api/useUsers';
import { adminKeys } from '../api/queryKeys';
import { useSessionStore } from '@/lib/session';
import type {
  AdminUser,
  DepartmentName,
  UserRole,
  EntityCode,
  UpdateUserInput,
} from '../api/types';

export interface UserEditModalProps {
  user: AdminUser | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const ALL_ROLES: UserRole[] = [
  'Admin',
  'Manager',
  'Accounting',
  'Operations',
  'Documentation',
  'HR',
];

const ALL_DEPARTMENTS: DepartmentName[] = [
  'Management',
  'Accounting',
  'Operations',
  'Documentation',
  'HR',
];

export function UserEditModal({
  user,
  isOpen,
  onClose,
  onSuccess,
}: UserEditModalProps) {
  const queryClient = useQueryClient();
  const currentUser = useSessionStore((state) => state.user);
  const { updateUser } = useUserMutations();

  const isSelf = user?.id === currentUser?.id;

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [changePassword, setChangePassword] = useState(false);
  const [role, setRole] = useState<UserRole>('Operations');
  const [departments, setDepartments] = useState<DepartmentName[]>([]);
  const [entities, setEntities] = useState<EntityCode[]>(['ATA']);
  const [isActive, setIsActive] = useState(true);
  const [conflictOpen, setConflictOpen] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
      setPassword('');
      setChangePassword(false);
      setRole(user.role);
      setDepartments(user.departments);
      setEntities(user.entities);
      setIsActive(user.isActive);
      setErrors({});
      setConflictOpen(false);
    }
  }, [user, isOpen]);

  const toggleDepartment = (dept: DepartmentName) => {
    if (departments.includes(dept)) {
      setDepartments(departments.filter((d) => d !== dept));
    } else {
      setDepartments([...departments, dept]);
    }
  };

  const toggleEntity = (ent: EntityCode) => {
    if (entities.includes(ent)) {
      if (entities.length > 1) {
        setEntities(entities.filter((e) => e !== ent));
      }
    } else {
      setEntities([...entities, ent]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setErrors({});

    if (!name.trim()) {
      setErrors({ name: 'Name is required.' });
      return;
    }

    if (!email.trim()) {
      setErrors({ email: 'Email is required.' });
      return;
    }

    if (role !== 'Admin' && departments.length === 0) {
      setErrors({ departments: 'At least one department must be assigned for non-admin users.' });
      return;
    }

    if (entities.length === 0) {
      setErrors({ entities: 'At least one entity (ATA/LTA) must be selected.' });
      return;
    }

    if (isSelf && !isActive) {
      setErrors({ isActive: 'You cannot disable your own active administrator account.' });
      return;
    }

    const payload: UpdateUserInput = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role,
      departments,
      entities,
      isActive,
      status: isActive ? 'Active' : 'Disabled',
      expectedVersion: user.version ?? 1,
    };

    if (changePassword && password.trim()) {
      payload.password = password.trim();
    }

    try {
      await updateUser(user.id, payload);
      if (onSuccess) onSuccess();
      onClose();
    } catch (err) {
      if (isConcurrencyConflictError(err)) {
        useBlockingModalStore.getState().reset();
        setConflictOpen(true);
        return;
      }
      // Other errors handled verbatim by runBlockingAction
    }
  };

  const handleConflictReload = async () => {
    setConflictOpen(false);
    await queryClient.invalidateQueries({ queryKey: adminKeys.allUsers() });
    if (user?.id) {
      await queryClient.invalidateQueries({ queryKey: adminKeys.userDetail(user.id) });
    }
    onClose();
  };

  return (
    <>
      <Dialog open={isOpen && !conflictOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className="max-w-lg border border-[#CBD5E1] rounded-[6px] p-6 bg-white max-h-[90vh] overflow-y-auto"
          data-testid="user-edit-modal"
        >
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-[#0F172A]">
              Edit User Account: {user?.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-[#475569]">
              Update user information, department memberships, and system access scopes.
            </DialogDescription>
          </DialogHeader>

          {isSelf && (
            <div className="rounded-[4px] bg-[#F8FAFC] border border-[#CBD5E1] p-2.5 text-xs text-[#0F172A]">
              <strong>Self-Account Notice:</strong> You are editing your currently active account. Self-deactivation is disabled for security.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {/* Full Name */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#0F172A]">
                Full Name <span className="text-[#DC2626]">*</span>
              </label>
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 text-xs rounded-[4px] border-[#CBD5E1]"
                data-testid="edit-user-name-input"
                required
              />
              {errors.name && <p className="text-xs text-[#DC2626]">{errors.name}</p>}
            </div>

            {/* Email Address */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#0F172A]">
                Email Address <span className="text-[#DC2626]">*</span>
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-9 text-xs rounded-[4px] border-[#CBD5E1] font-mono tabular-nums"
                data-testid="edit-user-email-input"
                required
              />
              {errors.email && <p className="text-xs text-[#DC2626]">{errors.email}</p>}
            </div>

            {/* Reset / Change Password Section */}
            <div className="space-y-2 rounded-[4px] border border-[#CBD5E1] bg-[#F8FAFC] p-2.5">
              <label className="flex items-center gap-2 text-xs font-semibold text-[#0F172A] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={changePassword}
                  onChange={(e) => setChangePassword(e.target.checked)}
                  className="rounded-[2px] border-[#CBD5E1] text-[#0F172A] h-3.5 w-3.5"
                  data-testid="edit-user-change-password-toggle"
                />
                <span>Reset User Password</span>
              </label>

              {changePassword && (
                <div className="pt-1 space-y-1">
                  <GuardedPasswordInput
                    value={password}
                    onChange={setPassword}
                    placeholder="Enter new password..."
                    required={changePassword}
                    data-testid="edit-user-password-input"
                  />
                  {errors.password && <p className="text-xs text-[#DC2626]">{errors.password}</p>}
                </div>
              )}
            </div>

            {/* Role Selection */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#0F172A]">
                Primary Role <span className="text-[#DC2626]">*</span>
              </label>
              <Select value={role} onValueChange={(val) => setRole(val as UserRole)}>
                <SelectTrigger
                  className="h-9 text-xs rounded-[4px] border-[#CBD5E1] bg-white"
                  data-testid="edit-user-role-select"
                >
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {ALL_ROLES.map((r) => (
                    <SelectItem key={r} value={r} className="text-xs">
                      {r} {r === 'Admin' ? '(Super-User)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.role && <p className="text-xs text-[#DC2626]">{errors.role}</p>}
            </div>

            {/* Department Checkboxes */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#0F172A]">
                Department Assignments {role !== 'Admin' && <span className="text-[#DC2626]">*</span>}
              </label>
              <div className="grid grid-cols-2 gap-2 rounded-[4px] border border-[#CBD5E1] bg-[#F8FAFC] p-2.5">
                {ALL_DEPARTMENTS.map((dept) => {
                  const checked = departments.includes(dept);
                  return (
                    <label
                      key={dept}
                      className="flex items-center gap-2 text-xs text-[#0F172A] cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleDepartment(dept)}
                        className="rounded-[2px] border-[#CBD5E1] text-[#0F172A] h-3.5 w-3.5"
                        data-testid={`edit-user-dept-${dept}`}
                      />
                      <span>{dept}</span>
                    </label>
                  );
                })}
              </div>
              {errors.departments && (
                <p className="text-xs text-[#DC2626]">{errors.departments}</p>
              )}
            </div>

            {/* Entity Access Checkboxes */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#0F172A]">
                Entity Access <span className="text-[#DC2626]">*</span>
              </label>
              <div className="flex gap-4 rounded-[4px] border border-[#CBD5E1] bg-[#F8FAFC] p-2.5">
                {(['ATA', 'LTA'] as EntityCode[]).map((ent) => {
                  const checked = entities.includes(ent);
                  return (
                    <label
                      key={ent}
                      className="flex items-center gap-2 text-xs text-[#0F172A] cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleEntity(ent)}
                        className="rounded-[2px] border-[#CBD5E1] text-[#0F172A] h-3.5 w-3.5"
                        data-testid={`edit-user-entity-${ent}`}
                      />
                      <span className="font-semibold font-mono">{ent}</span>
                    </label>
                  );
                })}
              </div>
              {errors.entities && <p className="text-xs text-[#DC2626]">{errors.entities}</p>}
            </div>

            {/* Active Status with Self-Protection */}
            <div className="flex items-center gap-2 pt-1">
              <label className="flex items-center gap-2 text-xs text-[#0F172A] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isActive}
                  disabled={isSelf}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="rounded-[2px] border-[#CBD5E1] text-[#0F172A] h-3.5 w-3.5 disabled:opacity-50"
                  data-testid="edit-user-active-checkbox"
                />
                <span className={`font-medium ${isSelf ? 'text-[#475569]' : ''}`}>
                  Active Account {isSelf && '(Cannot deactivate self)'}
                </span>
              </label>
              {errors.isActive && <p className="text-xs text-[#DC2626]">{errors.isActive}</p>}
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onClose}
                className="text-xs h-8 rounded-[4px] border-[#CBD5E1]"
                data-testid="edit-user-cancel-btn"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                className="text-xs h-8 rounded-[4px] bg-[#0F172A] text-white hover:bg-[#1E293B]"
                data-testid="edit-user-submit-btn"
              >
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConflictResolutionModal
        open={conflictOpen}
        onOpenChange={setConflictOpen}
        entityLabel="user account"
        onReload={() => {
          void handleConflictReload();
        }}
      />
    </>
  );
}
