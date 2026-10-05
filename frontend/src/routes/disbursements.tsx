import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Wallet,
  Clock,
  CheckCircle2,
  DollarSign,
  Plus,
  Layers,
  FileCheck2,
  XCircle,
  Archive,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Forbidden } from '@/components/common/Forbidden';
import { ModulePlaceholder } from '@/components/common/ModulePlaceholder';
import { isModuleEnabled } from '@/lib/flags';
import { useSessionStore } from '@/lib/session';
import { hasPermission } from '@/lib/permissions';
import { BlockingActionModal } from '@/features/operations/components/BlockingActionModal';
import {
  DisbursementsTable,
  CreateDisbursementModal,
  AdminApprovalQueue,
  DisbursementDetailDrawer,
  DisbursementArchiveTab,
} from '@/features/disbursements/components';
import { useDisbursementCounts } from '@/features/disbursements/api/useDisbursements';
import type { EntityCode } from '@/features/disbursements/api/types';

export default function DisbursementsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'all';

  // Modal Visibility
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedDisbursementId, setSelectedDisbursementId] = useState<string | null>(null);

  // Session & RBAC
  const permissions = useSessionStore((state) => state.permissions);
  const activeEntity = useSessionStore((state) => state.activeEntity);
  const setActiveEntity = useSessionStore((state) => state.setActiveEntity);

  const canView = hasPermission(permissions, 'disbursement:view');
  const canCreate = hasPermission(permissions, 'disbursement:create');
  const canApprove = hasPermission(permissions, 'disbursement:approve');

  // Badge Counts Query
  const { data: counts } = useDisbursementCounts({ enabled: canView });

  // 1. Feature Flag Guard
  if (!isModuleEnabled('Disbursements')) {
    return (
      <ModulePlaceholder
        name="Disbursements"
        description="Disbursement vouchers, petty cash entries, and payment authorizations."
      />
    );
  }

  // 2. Permission Guard
  if (!canView) {
    return <Forbidden requiredPermission="disbursement:view" />;
  }

  const handleTabChange = (val: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', val);
      return next;
    });
  };

  const activeCount = counts?.active ?? 0;
  const awaitingReleaseCount = counts?.awaitingRelease ?? 0;
  const rejectedCount = counts?.rejected ?? 0;
  const archivedCount = counts?.archived ?? 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="disbursements-page">
      {/* 1. Page Header & Breadcrumbs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-slate-500 flex items-center gap-1.5 pb-1">
            <span>Modules</span>
            <span>/</span>
            <span className="text-slate-900 font-semibold">Disbursements</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Wallet className="h-6 w-6 text-blue-600" />
            Disbursements & Expenses
          </h1>
          <p className="text-xs text-slate-500 pt-0.5">
            Manage firm & client expense vouchers, petty cash entries, approval workflows, and funds reconciliation.
          </p>
        </div>

        {/* Header Controls: Entity Switcher & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Active Entity Toggle */}
          <div
            className="flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200"
            data-testid="disbursements-entity-toggle"
          >
            {(['ATA', 'LTA', 'ALL'] as const).map((ent) => (
              <button
                key={ent}
                type="button"
                onClick={() => setActiveEntity(ent as EntityCode)}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  activeEntity === ent
                    ? ent === 'ATA'
                      ? 'bg-blue-600 text-white shadow-xs'
                      : ent === 'LTA'
                        ? 'bg-slate-700 text-white shadow-xs'
                        : 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                data-testid={`entity-btn-${ent.toLowerCase()}`}
              >
                {ent}
              </button>
            ))}
          </div>

          {/* New Disbursement Action (accessible to all authenticated users) */}
          {canCreate && (
            <Button
              type="button"
              size="sm"
              onClick={() => setIsCreateModalOpen(true)}
              className="text-xs font-semibold gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="page-new-disbursement-btn"
            >
              <Plus className="h-4 w-4" /> New Disbursement
            </Button>
          )}
        </div>
      </div>

      {/* 2. Metric Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-white rounded-lg border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Active Vouchers</span>
            <Layers className="h-4 w-4 text-slate-400" />
          </div>
          <div className="text-xl font-bold text-slate-900" data-testid="kpi-active-count">
            {activeCount}
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-lg border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Awaiting Release</span>
            <DollarSign className="h-4 w-4 text-purple-500" />
          </div>
          <div className="text-xl font-bold text-purple-700" data-testid="kpi-awaiting-release-count">
            {awaitingReleaseCount}
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-lg border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Rejected</span>
            <XCircle className="h-4 w-4 text-rose-500" />
          </div>
          <div className="text-xl font-bold text-rose-600" data-testid="kpi-rejected-count">
            {rejectedCount}
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-lg border border-slate-200 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Archived</span>
            <Archive className="h-4 w-4 text-slate-400" />
          </div>
          <div className="text-xl font-bold text-slate-600" data-testid="kpi-archived-count">
            {archivedCount}
          </div>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="bg-slate-100 p-1 rounded-lg border border-slate-200 flex flex-wrap h-auto gap-1">
          <TabsTrigger
            value="all"
            className="text-xs px-3 py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-xs"
            data-testid="tab-all"
          >
            All Disbursements
          </TabsTrigger>

          <TabsTrigger
            value="drafts"
            className="text-xs px-3 py-1.5 data-[state=active]:bg-white data-[state=active]:shadow-xs"
            data-testid="tab-drafts"
          >
            Drafts
          </TabsTrigger>

          <TabsTrigger
            value="pending-approvals"
            className="text-xs px-3 py-1.5 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-xs"
            data-testid="tab-pending-approvals"
          >
            <Clock className="h-3.5 w-3.5 text-amber-600" />
            <span>Pending Approvals</span>
            {canApprove && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-800">
                Admin
              </Badge>
            )}
          </TabsTrigger>

          <TabsTrigger
            value="approved"
            className="text-xs px-3 py-1.5 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-xs"
            data-testid="tab-approved"
          >
            <FileCheck2 className="h-3.5 w-3.5 text-blue-600" />
            <span>Approved</span>
            {awaitingReleaseCount > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-purple-100 text-purple-800">
                {awaitingReleaseCount}
              </Badge>
            )}
          </TabsTrigger>

          <TabsTrigger
            value="released"
            className="text-xs px-3 py-1.5 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-xs"
            data-testid="tab-released"
          >
            <DollarSign className="h-3.5 w-3.5 text-purple-600" />
            <span>Released</span>
          </TabsTrigger>

          <TabsTrigger
            value="funded"
            className="text-xs px-3 py-1.5 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-xs"
            data-testid="tab-funded"
          >
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            <span>Funded</span>
          </TabsTrigger>

          <TabsTrigger
            value="rejected"
            className="text-xs px-3 py-1.5 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-xs"
            data-testid="tab-rejected"
          >
            <XCircle className="h-3.5 w-3.5 text-rose-500" />
            <span>Rejected</span>
          </TabsTrigger>

          <TabsTrigger
            value="archive"
            className="text-xs px-3 py-1.5 gap-1.5 data-[state=active]:bg-white data-[state=active]:shadow-xs"
            data-testid="tab-archive"
          >
            <Archive className="h-3.5 w-3.5 text-slate-500" />
            <span>Archive</span>
            {archivedCount > 0 && (
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 bg-slate-200 text-slate-700 font-bold"
                data-testid="badge-archived-count"
              >
                {archivedCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: All */}
        <TabsContent value="all" className="space-y-4">
          <DisbursementsTable
            onSelectDisbursement={(id) => setSelectedDisbursementId(id)}
          />
        </TabsContent>

        {/* Tab 2: Drafts */}
        <TabsContent value="drafts" className="space-y-4">
          <DisbursementsTable
            statusFilter="Draft"
            onSelectDisbursement={(id) => setSelectedDisbursementId(id)}
          />
        </TabsContent>

        {/* Tab 3: Pending Approvals (Dedicated Admin Queue) */}
        <TabsContent value="pending-approvals" className="space-y-4">
          <AdminApprovalQueue
            onSelectDisbursement={(id) => setSelectedDisbursementId(id)}
          />
        </TabsContent>

        {/* Tab 4: Approved */}
        <TabsContent value="approved" className="space-y-4">
          <DisbursementsTable
            statusFilter="Approved"
            onSelectDisbursement={(id) => setSelectedDisbursementId(id)}
          />
        </TabsContent>

        {/* Tab 5: Released */}
        <TabsContent value="released" className="space-y-4">
          <DisbursementsTable
            statusFilter="Released"
            onSelectDisbursement={(id) => setSelectedDisbursementId(id)}
          />
        </TabsContent>

        {/* Tab 6: Funded */}
        <TabsContent value="funded" className="space-y-4">
          <DisbursementsTable
            statusFilter="Funded"
            onSelectDisbursement={(id) => setSelectedDisbursementId(id)}
          />
        </TabsContent>

        {/* Tab 7: Rejected */}
        <TabsContent value="rejected" className="space-y-4">
          <DisbursementsTable
            statusFilter="Rejected"
            onSelectDisbursement={(id) => setSelectedDisbursementId(id)}
          />
        </TabsContent>

        {/* Tab 8: Archive */}
        <TabsContent value="archive" className="space-y-4">
          <DisbursementArchiveTab
            onSelectDisbursement={(id) => setSelectedDisbursementId(id)}
          />
        </TabsContent>
      </Tabs>

      {/* 4. Modals and Drawers Mounted at Root */}
      <CreateDisbursementModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />

      <DisbursementDetailDrawer
        id={selectedDisbursementId}
        isOpen={Boolean(selectedDisbursementId)}
        onClose={() => setSelectedDisbursementId(null)}
      />

      {/* Headless Blocking Action Modal for Zero Optimistic Updates */}
      <BlockingActionModal />
    </div>
  );
}
