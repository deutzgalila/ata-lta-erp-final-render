import { useState, useMemo } from 'react';
import {
  KeyRound,
  ShieldCheck,
  Check,
  Search,
  Building2,
  Mail,
  Calendar,
  Layers,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  computeUserEffectivePermissions,
  getPermissionModule,
  PERMISSION_KEYS,
  testPermission,
} from '../utils/permissionsMatrix';
import type { AdminUser } from '../api/types';

export interface UserDetailModalProps {
  user: AdminUser | null;
  isOpen: boolean;
  onClose: () => void;
}

export function UserDetailModal({ user, isOpen, onClose }: UserDetailModalProps) {
  const [filterQuery, setFilterQuery] = useState('');

  const effectiveInfo = useMemo(() => {
    if (!user) return null;
    return computeUserEffectivePermissions(user);
  }, [user]);

  const grantedSet = useMemo(() => {
    if (!effectiveInfo) return new Set<string>();
    return new Set(effectiveInfo.effectivePermissions);
  }, [effectiveInfo]);

  // Group the 52 permission keys by module
  const groupedKeys = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const key of PERMISSION_KEYS) {
      if (filterQuery.trim() && !key.toLowerCase().includes(filterQuery.toLowerCase())) {
        continue;
      }
      const mod = getPermissionModule(key);
      const list = map.get(mod) ?? [];
      list.push(key);
      map.set(mod, list);
    }
    return map;
  }, [filterQuery]);

  if (!user || !effectiveInfo) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-2xl p-6 max-h-[90vh] overflow-y-auto"
        data-testid="user-detail-modal"
      >
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold text-sm">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <span>{user.name}</span>
                <Badge variant="outline" className="text-xs">
                  {user.role}
                </Badge>
                {user.isActive ? (
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-200">
                    Active
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 border border-slate-200">
                    Disabled
                  </span>
                )}
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 pt-0.5">
                Profile details and effective permissions inspector
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Profile Card */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3.5 space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 text-slate-600">
              <Mail className="h-3.5 w-3.5 text-slate-400" />
              <span className="font-mono text-slate-800">{user.email}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <Building2 className="h-3.5 w-3.5 text-slate-400" />
              <span>Entities: {user.entities.join(', ')}</span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <Layers className="h-3.5 w-3.5 text-slate-400" />
              <span>
                Departments:{' '}
                {user.departments.length > 0 ? user.departments.join(', ') : 'None assigned'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-slate-600">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <span>Created: {new Date(user.createdAt).toLocaleDateString()}</span>
            </div>
          </div>

          {effectiveInfo.isAdminSuperUser && (
            <div className="flex items-center gap-1.5 rounded-md bg-amber-50 border border-amber-200 p-2 text-[11px] text-amber-800 font-medium">
              <ShieldCheck className="h-4 w-4 text-amber-600 shrink-0" />
              <span>
                <strong>Administrator Super-Privilege:</strong> Inherits all department permissions across all 5 departments plus all 8 exclusive administrative operations.
              </span>
            </div>
          )}
        </div>

        {/* Permissions Inspector Section */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
              <KeyRound className="h-4 w-4 text-blue-600" />
              <span>Effective Permissions Inspector</span>
              <Badge variant="outline" className="text-[10px] ml-1 bg-blue-50 text-blue-700">
                {effectiveInfo.effectivePermissions.length} / {PERMISSION_KEYS.length} granted
              </Badge>
            </div>

            <div className="relative w-48">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                type="text"
                placeholder="Filter permissions..."
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="pl-8 text-xs h-7 bg-white"
                data-testid="permissions-filter-input"
              />
            </div>
          </div>

          {/* Grouped Permission Keys Table */}
          <div className="rounded-lg border border-slate-200 divide-y divide-slate-200 max-h-72 overflow-y-auto bg-white text-xs">
            {Array.from(groupedKeys.entries()).map(([moduleName, keys]) => (
              <div key={moduleName} className="p-3 space-y-2">
                <h4 className="font-semibold text-slate-700 text-[11px] uppercase tracking-wider text-slate-500">
                  {moduleName}
                </h4>
                <div className="grid grid-cols-1 gap-1.5">
                  {keys.map((permKey) => {
                    const isGranted = testPermission(grantedSet, permKey);
                    const sources = effectiveInfo.departmentSources[permKey] ?? [];

                    return (
                      <div
                        key={permKey}
                        className={`flex items-center justify-between rounded-md p-1.5 text-xs ${
                          isGranted ? 'bg-emerald-50/50' : 'bg-slate-50/50 opacity-60'
                        }`}
                        data-testid={`user-perm-${permKey}`}
                        data-granted={isGranted ? 'true' : 'false'}
                      >
                        <div className="flex items-center gap-2">
                          {isGranted ? (
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                              <Check className="h-3 w-3" />
                            </span>
                          ) : (
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-slate-400 font-bold text-[10px]">
                              —
                            </span>
                          )}
                          <span
                            className={`font-mono text-[11px] ${
                              isGranted ? 'font-semibold text-slate-900' : 'text-slate-500'
                            }`}
                          >
                            {permKey}
                          </span>
                        </div>

                        {/* Grant Origin / Source Badges */}
                        <div className="flex items-center gap-1">
                          {effectiveInfo.isAdminSuperUser && isGranted ? (
                            <Badge variant="outline" className="text-[10px] py-0 px-1 border-amber-200 bg-amber-50 text-amber-700">
                              Admin
                            </Badge>
                          ) : (
                            sources.map((src) => (
                              <Badge
                                key={src}
                                variant="outline"
                                className="text-[10px] py-0 px-1 border-blue-200 bg-blue-50 text-blue-700"
                              >
                                {src}
                              </Badge>
                            ))
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
