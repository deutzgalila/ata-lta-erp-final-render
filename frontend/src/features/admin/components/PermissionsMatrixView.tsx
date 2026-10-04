import { useState, useMemo } from 'react';
import {
  Check,
  Search,
  Layers,
  Calculator,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  PERMISSION_KEYS,
  ALL_DEPARTMENTS,
  DEPARTMENT_PERMISSIONS,
  ADMIN_EXCLUSIVE_PERMISSIONS,
  getPermissionModule,
  testPermission,
} from '../utils/permissionsMatrix';
import type { DepartmentName } from '../api/types';

export function PermissionsMatrixView() {
  const [search, setSearch] = useState('');
  const [selectedDepts, setSelectedDepts] = useState<DepartmentName[]>([
    'Operations',
    'Documentation',
  ]);

  // Precompute permission sets for standard departments and admin
  const deptSets = useMemo(() => {
    const map: Record<DepartmentName, Set<string>> = {
      Management: new Set(DEPARTMENT_PERMISSIONS.Management),
      Accounting: new Set(DEPARTMENT_PERMISSIONS.Accounting),
      Operations: new Set(DEPARTMENT_PERMISSIONS.Operations),
      Documentation: new Set(DEPARTMENT_PERMISSIONS.Documentation),
      HR: new Set(DEPARTMENT_PERMISSIONS.HR),
    };
    return map;
  }, []);

  const adminSet = useMemo(() => {
    const all = new Set<string>();
    for (const d of ALL_DEPARTMENTS) {
      for (const p of DEPARTMENT_PERMISSIONS[d] || []) {
        all.add(p);
      }
    }
    for (const p of ADMIN_EXCLUSIVE_PERMISSIONS) {
      all.add(p);
    }
    return all;
  }, []);

  // Compute union for interactive calculator
  const unionSet = useMemo(() => {
    const union = new Set<string>();
    for (const d of selectedDepts) {
      for (const p of DEPARTMENT_PERMISSIONS[d] || []) {
        union.add(p);
      }
    }
    return union;
  }, [selectedDepts]);

  const toggleCalculatorDept = (dept: DepartmentName) => {
    if (selectedDepts.includes(dept)) {
      setSelectedDepts(selectedDepts.filter((d) => d !== dept));
    } else {
      setSelectedDepts([...selectedDepts, dept]);
    }
  };

  // Filter keys
  const filteredKeys = useMemo(() => {
    if (!search.trim()) return PERMISSION_KEYS;
    const query = search.toLowerCase();
    return PERMISSION_KEYS.filter((k) => k.toLowerCase().includes(query));
  }, [search]);

  return (
    <div className="space-y-6" data-testid="permissions-matrix-view">
      {/* Top Controls & Union Calculator */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Calculator className="h-4 w-4 text-blue-600" />
              Interactive Department Union Calculator
            </h3>
            <p className="text-xs text-slate-500 pt-0.5">
              Select assigned departments to compute effective permission grant unions in real time.
            </p>
          </div>

          <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 font-semibold self-start sm:self-center">
            {unionSet.size} / 52 Permissions Granted
          </Badge>
        </div>

        {/* Department Selection Checkboxes */}
        <div className="flex flex-wrap gap-3 pt-1 border-t border-slate-100">
          {ALL_DEPARTMENTS.map((dept) => {
            const isChecked = selectedDepts.includes(dept);
            return (
              <label
                key={dept}
                className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs cursor-pointer transition-all ${
                  isChecked
                    ? 'border-blue-400 bg-blue-50/70 text-blue-900 font-medium shadow-xs'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
                data-testid={`calculator-toggle-${dept}`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleCalculatorDept(dept)}
                  className="rounded-xs border-slate-300 text-blue-600 focus:ring-blue-500 h-3.5 w-3.5"
                />
                <span>{dept}</span>
                <span className="text-[10px] text-slate-400">
                  ({(DEPARTMENT_PERMISSIONS[dept] || []).length})
                </span>
              </label>
            );
          })}
        </div>

        {/* Security Invariant Note */}
        <div className="flex items-center gap-2 rounded-md bg-slate-50 p-2.5 text-[11px] text-slate-600 border border-slate-200">
          <Layers className="h-4 w-4 text-slate-400 shrink-0" />
          <span>
            <strong>RBAC Isolation Principle:</strong> Department unions expand operational capabilities but never grant the 8 administrative exclusive keys (e.g. <code className="font-mono text-slate-800">users:manage</code>, <code className="font-mono text-slate-800">retainers:edit</code>), which are strictly reserved for Administrator roles.
          </span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            type="text"
            placeholder="Search 52 permission keys..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-xs h-9 bg-white"
            data-testid="matrix-search-input"
          />
        </div>

        <span className="text-xs text-slate-500">
          Showing {filteredKeys.length} of {PERMISSION_KEYS.length} keys
        </span>
      </div>

      {/* Master 52-Key Grid Table */}
      <div className="rounded-lg border border-slate-200 bg-white shadow-xs overflow-hidden">
        <Table data-testid="master-permissions-table">
          <TableHeader className="bg-slate-50/75">
            <TableRow>
              <TableHead className="w-[40px] text-xs font-semibold text-slate-700">#</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">Permission Key</TableHead>
              <TableHead className="text-xs font-semibold text-slate-700">Module</TableHead>
              <TableHead className="text-center text-xs font-semibold text-red-700">Admin</TableHead>
              <TableHead className="text-center text-xs font-semibold text-purple-700">Management</TableHead>
              <TableHead className="text-center text-xs font-semibold text-emerald-700">Accounting</TableHead>
              <TableHead className="text-center text-xs font-semibold text-blue-700">Operations</TableHead>
              <TableHead className="text-center text-xs font-semibold text-amber-700">Docs</TableHead>
              <TableHead className="text-center text-xs font-semibold text-rose-700">HR</TableHead>
              <TableHead className="text-center text-xs font-bold text-blue-900 bg-blue-50/50">
                Union ({selectedDepts.length})
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredKeys.map((key, idx) => {
              const isAdminGranted = testPermission(adminSet, key);
              const isMgmtGranted = testPermission(deptSets.Management, key);
              const isAcctGranted = testPermission(deptSets.Accounting, key);
              const isOpsGranted = testPermission(deptSets.Operations, key);
              const isDocsGranted = testPermission(deptSets.Documentation, key);
              const isHrGranted = testPermission(deptSets.HR, key);
              const isUnionGranted = testPermission(unionSet, key);

              const mod = getPermissionModule(key);

              return (
                <TableRow
                  key={key}
                  data-testid={`matrix-row-${key}`}
                  className="hover:bg-slate-50/50 transition-colors"
                >
                  {/* Row Index */}
                  <TableCell className="font-mono text-[11px] text-slate-400">
                    {idx + 1}
                  </TableCell>

                  {/* Permission Key */}
                  <TableCell>
                    <span className="font-mono text-xs font-semibold text-slate-900">
                      {key}
                    </span>
                  </TableCell>

                  {/* Module Tag */}
                  <TableCell>
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 text-slate-600 bg-slate-50 border-slate-200">
                      {mod}
                    </Badge>
                  </TableCell>

                  {/* Admin */}
                  <TableCell className="text-center">
                    {isAdminGranted ? (
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-50 text-red-700">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <span className="text-slate-300 font-bold">—</span>
                    )}
                  </TableCell>

                  {/* Management */}
                  <TableCell className="text-center">
                    {isMgmtGranted ? (
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-purple-50 text-purple-700">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <span className="text-slate-300 font-bold">—</span>
                    )}
                  </TableCell>

                  {/* Accounting */}
                  <TableCell className="text-center">
                    {isAcctGranted ? (
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <span className="text-slate-300 font-bold">—</span>
                    )}
                  </TableCell>

                  {/* Operations */}
                  <TableCell className="text-center">
                    {isOpsGranted ? (
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <span className="text-slate-300 font-bold">—</span>
                    )}
                  </TableCell>

                  {/* Documentation */}
                  <TableCell className="text-center">
                    {isDocsGranted ? (
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-amber-50 text-amber-700">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <span className="text-slate-300 font-bold">—</span>
                    )}
                  </TableCell>

                  {/* HR */}
                  <TableCell className="text-center">
                    {isHrGranted ? (
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-50 text-rose-700">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <span className="text-slate-300 font-bold">—</span>
                    )}
                  </TableCell>

                  {/* Union Calculator Column */}
                  <TableCell className="text-center bg-blue-50/30">
                    {isUnionGranted ? (
                      <span
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white font-bold"
                        data-testid={`union-granted-${key}`}
                      >
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    ) : (
                      <span className="text-slate-300 font-bold">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
