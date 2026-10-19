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
    <div className="w-full space-y-6" data-testid="disbursements-page">
      {/* 1. Unified Module Header */}
      <div className="border-b border-[#CBD5E1] pb-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <nav
            aria-label="Breadcrumb"
            className="text-xs font-medium text-[#475569] flex items-center gap-1.5 pb-1"
          >
            <span>Modules</span>
            <span aria-hidden="true">/</span>
            <span className="text-[#0F172A] font-semibold">Disbursements</span>
          </nav>
          <h1 className="text-2xl font-semibold tracking-tight text-[#0F172A] flex items-center gap-2">
            <Wallet className="h-6 w-6 text-[#1D4ED8]" />
            Disbursements &amp; Expenses
          </h1>
          <p className="text-xs sm:text-sm text-[#475569] pt-0.5">
            Manage firm &amp; client expense vouchers, petty cash entries, approval workflows, and funds reconciliation.
          </p>
        </div>

        {/* Header Controls: Soft Segmented Entity Switcher & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {/* Active Entity Toggle */}
          <div
            className="flex items-center bg-[#F1F5F9] p-1 rounded-[8px] border border-[#CBD5E1]"
            data-testid="disbursements-entity-toggle"
          >
            {(['ATA', 'LTA', 'ALL'] as const).map((ent) => (
              <button
                key={ent}
                type="button"
                onClick={() => setActiveEntity(ent as EntityCode)}
                className={`px-3 py-1 rounded-[6px] text-xs font-semibold transition-colors cursor-pointer ${
                  activeEntity === ent
                    ? 'bg-[#1D4ED8] text-[#FFFFFF] shadow-2xs font-semibold'
                    : 'text-[#475569] hover:text-[#0F172A] hover:bg-[#E2E8F0]/60'
                }`}
                data-testid={`entity-btn-${ent.toLowerCase()}`}
              >
                {ent}
              </button>
            ))}
          </div>

          {/* New Disbursement Action */}
          {canCreate && (
            <Button
              type="button"
              size="sm"
              onClick={() => setIsCreateModalOpen(true)}
              className="text-xs font-medium gap-1.5 bg-[#1D4ED8] hover:bg-[#1E40AF] text-[#FFFFFF] rounded-[6px] h-9 shadow-2xs cursor-pointer"
              data-testid="page-new-disbursement-btn"
            >
              <Plus className="h-4 w-4" /> New Disbursement
            </Button>
          )}
        </div>
      </div>

      {/* 2. Metric Summary KPI Cards (Unified Structured KPI Band) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 bg-[#FFFFFF] border border-[#CBD5E1] rounded-[8px] shadow-card space-y-1">
          <div className="flex items-center justify-between text-xs font-medium text-[#475569]">
            <span>Active Vouchers</span>
            <Layers className="h-4 w-4 text-[#1D4ED8]" />
          </div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-[#0F172A]" data-testid="kpi-active-count">
            {activeCount}
          </div>
        </div>

        <div className="p-4 bg-[#FFFFFF] border border-[#CBD5E1] rounded-[8px] shadow-card space-y-1">
          <div className="flex items-center justify-between text-xs font-medium text-[#475569]">
            <span>Awaiting Release</span>
            <DollarSign className="h-4 w-4 text-[#1D4ED8]" />
          </div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-[#0F172A]" data-testid="kpi-awaiting-release-count">
            {awaitingReleaseCount}
          </div>
        </div>

        <div className="p-4 bg-[#FFFFFF] border border-[#CBD5E1] border-t-2 border-t-[#DC2626] rounded-[8px] shadow-card space-y-1">
          <div className="flex items-center justify-between text-xs font-medium text-[#991B1B]">
            <span>Rejected</span>
            <XCircle className="h-4 w-4 text-[#DC2626]" />
          </div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-[#991B1B]" data-testid="kpi-rejected-count">
            {rejectedCount}
          </div>
        </div>

        <div className="p-4 bg-[#FFFFFF] border border-[#CBD5E1] rounded-[8px] shadow-card space-y-1">
          <div className="flex items-center justify-between text-xs font-medium text-[#475569]">
            <span>Archived</span>
            <Archive className="h-4 w-4 text-[#475569]" />
          </div>
          <div className="text-2xl font-semibold font-mono tabular-nums text-[#475569]" data-testid="kpi-archived-count">
            {archivedCount}
          </div>
        </div>
      </div>

      {/* 3. Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-4">
        <TabsList className="w-full justify-start rounded-[8px] bg-[#F1F5F9] p-1 border border-[#CBD5E1] gap-1 h-auto overflow-x-auto scrollbar-none flex flex-nowrap">
          <TabsTrigger
            value="all"
            className="rounded-[6px] px-3.5 py-2 text-xs sm:text-sm font-medium text-[#475569] hover:bg-[#E2E8F0]/70 hover:text-[#0F172A] data-[state=active]:bg-[#FFFFFF] data-[state=active]:text-[#1E40AF] data-[state=active]:font-semibold data-[state=active]:shadow-2xs data-[state=active]:border-b-2 data-[state=active]:border-[#1D4ED8] transition-colors cursor-pointer shrink-0"
            data-testid="tab-all"
          >
            All Disbursements
          </TabsTrigger>

          <TabsTrigger
            value="drafts"
            className="rounded-[6px] px-3.5 py-2 text-xs sm:text-sm font-medium text-[#475569] hover:bg-[#E2E8F0]/70 hover:text-[#0F172A] data-[state=active]:bg-[#FFFFFF] data-[state=active]:text-[#1E40AF] data-[state=active]:font-semibold data-[state=active]:shadow-2xs data-[state=active]:border-b-2 data-[state=active]:border-[#1D4ED8] transition-colors cursor-pointer shrink-0"
            data-testid="tab-drafts"
          >
            Drafts
          </TabsTrigger>

          <TabsTrigger
            value="pending-approvals"
            className="rounded-[6px] px-3.5 py-2 text-xs sm:text-sm font-medium text-[#475569] hover:bg-[#E2E8F0]/70 hover:text-[#0F172A] data-[state=active]:bg-[#FFFFFF] data-[state=active]:text-[#1E40AF] data-[state=active]:font-semibold data-[state=active]:shadow-2xs data-[state=active]:border-b-2 data-[state=active]:border-[#1D4ED8] transition-colors cursor-pointer shrink-0 flex items-center gap-1.5"
            data-testid="tab-pending-approvals"
          >
            <Clock className="h-3.5 w-3.5" />
            <span>{canApprove ? 'Pending Approvals' : 'Pending Submissions'}</span>
            {canApprove && (
              <Badge variant="secondary" className="text-xs font-mono px-1.5 py-0 rounded-[4px] border border-[#CBD5E1] bg-[#E2E8F0]/70 text-[#0F172A]">
                Admin
              </Badge>
            )}
          </TabsTrigger>

          <TabsTrigger
            value="approved"
            className="rounded-[6px] px-3.5 py-2 text-xs sm:text-sm font-medium text-[#475569] hover:bg-[#E2E8F0]/70 hover:text-[#0F172A] data-[state=active]:bg-[#FFFFFF] data-[state=active]:text-[#1E40AF] data-[state=active]:font-semibold data-[state=active]:shadow-2xs data-[state=active]:border-b-2 data-[state=active]:border-[#1D4ED8] transition-colors cursor-pointer shrink-0 flex items-center gap-1.5"
            data-testid="tab-approved"
          >
            <FileCheck2 className="h-3.5 w-3.5" />
            <span>Approved</span>
            {awaitingReleaseCount > 0 && (
              <Badge variant="secondary" className="text-xs font-mono px-1.5 py-0 rounded-[4px] border border-[#CBD5E1] bg-[#E2E8F0]/70 text-[#0F172A]">
                {awaitingReleaseCount}
              </Badge>
            )}
          </TabsTrigger>

          <TabsTrigger
            value="released"
            className="rounded-[6px] px-3.5 py-2 text-xs sm:text-sm font-medium text-[#475569] hover:bg-[#E2E8F0]/70 hover:text-[#0F172A] data-[state=active]:bg-[#FFFFFF] data-[state=active]:text-[#1E40AF] data-[state=active]:font-semibold data-[state=active]:shadow-2xs data-[state=active]:border-b-2 data-[state=active]:border-[#1D4ED8] transition-colors cursor-pointer shrink-0 flex items-center gap-1.5"
            data-testid="tab-released"
          >
            <DollarSign className="h-3.5 w-3.5" />
            <span>Released</span>
          </TabsTrigger>

          <TabsTrigger
            value="funded"
            className="rounded-[6px] px-3.5 py-2 text-xs sm:text-sm font-medium text-[#475569] hover:bg-[#E2E8F0]/70 hover:text-[#0F172A] data-[state=active]:bg-[#FFFFFF] data-[state=active]:text-[#1E40AF] data-[state=active]:font-semibold data-[state=active]:shadow-2xs data-[state=active]:border-b-2 data-[state=active]:border-[#1D4ED8] transition-colors cursor-pointer shrink-0 flex items-center gap-1.5"
            data-testid="tab-funded"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>Funded</span>
          </TabsTrigger>

          <TabsTrigger
            value="rejected"
            className="rounded-[6px] px-3.5 py-2 text-xs sm:text-sm font-medium text-[#475569] hover:bg-[#E2E8F0]/70 hover:text-[#0F172A] data-[state=active]:bg-[#FFFFFF] data-[state=active]:text-[#1E40AF] data-[state=active]:font-semibold data-[state=active]:shadow-2xs data-[state=active]:border-b-2 data-[state=active]:border-[#1D4ED8] transition-colors cursor-pointer shrink-0 flex items-center gap-1.5"
            data-testid="tab-rejected"
          >
            <XCircle className="h-3.5 w-3.5 text-[#DC2626]" />
            <span>Rejected</span>
          </TabsTrigger>

          <TabsTrigger
            value="archive"
            className="rounded-[6px] px-3.5 py-2 text-xs sm:text-sm font-medium text-[#475569] hover:bg-[#E2E8F0]/70 hover:text-[#0F172A] data-[state=active]:bg-[#FFFFFF] data-[state=active]:text-[#1E40AF] data-[state=active]:font-semibold data-[state=active]:shadow-2xs data-[state=active]:border-b-2 data-[state=active]:border-[#1D4ED8] transition-colors cursor-pointer shrink-0 flex items-center gap-1.5"
            data-testid="tab-archive"
          >
            <Archive className="h-3.5 w-3.5" />
            <span>Archive</span>
            {archivedCount > 0 && (
              <Badge
                variant="secondary"
                className="text-xs font-mono px-1.5 py-0 rounded-[4px] border border-[#CBD5E1] bg-[#E2E8F0]/70 text-[#0F172A] font-medium"
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
