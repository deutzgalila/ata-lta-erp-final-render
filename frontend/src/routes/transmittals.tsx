/**
 * Transmittals Route Page (Module #5)
 *
 * Citation: Frozen API Contract transmittals@2.0.0 (docs/api-contracts/modules/transmittals.md)
 * Gated by transmittal:view permission and 'Transmittals' feature flag.
 * Mounts BlockingActionModal at root.
 */

import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Send,
  Plus,
  Layers,
  Clock,
  CheckCircle2,
  Archive,
  LayoutGrid,
  Table as TableIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Forbidden } from '@/components/common/Forbidden';
import { ModulePlaceholder } from '@/components/common/ModulePlaceholder';
import { isModuleEnabled } from '@/lib/flags';
import { useSessionStore } from '@/lib/session';
import { hasPermission } from '@/lib/permissions';
import { BlockingActionModal } from '@/features/operations/components/BlockingActionModal';
import {
  TransmittalKanbanBoard,
  TransmittalTable,
  TransmittalFormModal,
  TransmittalDetailModal,
  TransmittalPrintModal,
  ApproveDialog,
  SendDialog,
  AcknowledgeDialog,
  DeleteDialog,
  ArchiveDialog,
} from '@/features/transmittals/components';
import {
  useTransmittalsList,
  useTransmittalCounts,
} from '@/features/transmittals/api/useTransmittals';
import type { Transmittal, EntityCode } from '@/features/transmittals/api/types';

export default function TransmittalsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'active';
  const viewMode = (searchParams.get('view') || 'kanban') as 'kanban' | 'table';

  // Modal Visibility States
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [formEditTarget, setFormEditTarget] = useState<Transmittal | null>(null);

  const [detailModalId, setDetailModalId] = useState<string | null>(null);
  const [printTarget, setPrintTarget] = useState<Transmittal | null>(null);

  // Workflow Dialog States
  const [approveTargetId, setApproveTargetId] = useState<string | null>(null);
  const [sendTarget, setSendTarget] = useState<Transmittal | null>(null);
  const [acknowledgeTarget, setAcknowledgeTarget] = useState<Transmittal | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [archiveTargetId, setArchiveTargetId] = useState<string | null>(null);
  const [isArchiveMode, setIsArchiveMode] = useState<boolean>(false);

  // Session & RBAC
  const permissions = useSessionStore((state) => state.permissions);
  const activeEntity = useSessionStore((state) => state.activeEntity);
  const setActiveEntity = useSessionStore((state) => state.setActiveEntity);

  const canView = hasPermission(permissions, 'transmittal:view');
  const canCreate = hasPermission(permissions, 'transmittal:create');

  // Queries
  const isArchivedTab = activeTab === 'archived';
  const { data: listResponse, isLoading: isListLoading } = useTransmittalsList(
    {
      archived: isArchivedTab,
      limit: 100,
    },
    { enabled: canView }
  );

  const { data: counts } = useTransmittalCounts({ enabled: canView });

  const transmittals = useMemo(() => {
    return listResponse?.data || [];
  }, [listResponse]);

  // Derive counts
  const activeCount = counts?.active ?? 0;
  const archivedCount = counts?.archived ?? 0;

  const draftCount = useMemo(
    () => transmittals.filter((t) => t.status === 'Draft').length,
    [transmittals]
  );
  const sentCount = useMemo(
    () => transmittals.filter((t) => t.status === 'Sent').length,
    [transmittals]
  );
  const ackCount = useMemo(
    () => transmittals.filter((t) => t.status === 'Acknowledged').length,
    [transmittals]
  );

  // 1. Feature Flag Guard
  if (!isModuleEnabled('Transmittals')) {
    return (
      <ModulePlaceholder
        name="Transmittals"
        description="Document transmittal tracking, client receipts, and acknowledgement receipts."
      />
    );
  }

  // 2. Permission Guard
  if (!canView) {
    return <Forbidden requiredPermission="transmittal:view" />;
  }

  const handleTabChange = (val: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', val);
      return next;
    });
  };

  const handleViewChange = (mode: 'kanban' | 'table') => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('view', mode);
      return next;
    });
  };

  // Find target objects for dialogs
  const approveTargetTransmittal = transmittals.find((t) => t.id === approveTargetId) || null;
  const deleteTargetTransmittal = transmittals.find((t) => t.id === deleteTargetId) || null;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="transmittals-page">
      {/* 1. Page Header & Breadcrumbs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-slate-500 flex items-center gap-1.5 pb-1">
            <span>Modules</span>
            <span>/</span>
            <span className="text-slate-900 font-semibold">Transmittals</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
            <Send className="h-6 w-6 text-blue-600" />
            Document Transmittals
          </h1>
          <p className="text-xs text-slate-500 pt-0.5">
            Document manifests, courier dispatch manifests, dual-path approval, and receipt tracking.
          </p>
        </div>

        {/* Header Controls: Entity Switcher & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Active Entity Toggle */}
          <div
            className="flex items-center p-0.5 bg-slate-100 rounded-lg border border-slate-200"
            data-testid="transmittals-entity-toggle"
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

          {/* New Transmittal Action */}
          {canCreate && (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setFormEditTarget(null);
                setIsFormModalOpen(true);
              }}
              className="text-xs font-semibold gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="new-transmittal-btn"
            >
              <Plus className="h-4 w-4" /> New Transmittal
            </Button>
          )}
        </div>
      </div>

      {/* 2. Metric Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 bg-white rounded-lg border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Active Manifests</span>
            <Layers className="h-4 w-4 text-slate-400" />
          </div>
          <div className="text-xl font-bold text-slate-900" data-testid="kpi-active-count">
            {activeCount}
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-lg border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Drafts</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-xl font-bold text-slate-800" data-testid="kpi-draft-count">
            {draftCount}
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-lg border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>In Transit / Sent</span>
            <Send className="h-4 w-4 text-blue-500" />
          </div>
          <div className="text-xl font-bold text-blue-700" data-testid="kpi-sent-count">
            {sentCount}
          </div>
        </div>

        <div className="p-3.5 bg-white rounded-lg border border-slate-200 shadow-xs space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Acknowledged</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-xl font-bold text-emerald-700" data-testid="kpi-acknowledged-count">
            {ackCount}
          </div>
        </div>
      </div>

      {/* 3. Navigation Tabs and View Switcher Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full sm:w-auto">
          <TabsList className="bg-slate-100 p-1 rounded-lg" data-testid="transmittal-tabs">
            <TabsTrigger
              value="active"
              className="text-xs font-semibold gap-1.5 data-[state=active]:bg-white"
              data-testid="tab-active"
            >
              <Layers className="h-3.5 w-3.5" />
              Active Transmittals
              <Badge variant="secondary" className="text-[10px] py-0 px-1 font-bold ml-1">
                {activeCount}
              </Badge>
            </TabsTrigger>

            <TabsTrigger
              value="archived"
              className="text-xs font-semibold gap-1.5 data-[state=active]:bg-white"
              data-testid="tab-archived"
            >
              <Archive className="h-3.5 w-3.5" />
              Archived
              <Badge variant="secondary" className="text-[10px] py-0 px-1 font-bold ml-1">
                {archivedCount}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* View mode toggle: Kanban vs Table */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 self-end sm:self-auto">
          <Button
            size="sm"
            variant={viewMode === 'kanban' ? 'default' : 'ghost'}
            className={`h-7 px-2.5 text-xs gap-1 font-medium ${
              viewMode === 'kanban' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
            onClick={() => handleViewChange('kanban')}
            data-testid="view-toggle-kanban"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Kanban
          </Button>

          <Button
            size="sm"
            variant={viewMode === 'table' ? 'default' : 'ghost'}
            className={`h-7 px-2.5 text-xs gap-1 font-medium ${
              viewMode === 'table' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
            onClick={() => handleViewChange('table')}
            data-testid="view-toggle-table"
          >
            <TableIcon className="h-3.5 w-3.5" />
            Table
          </Button>
        </div>
      </div>

      {/* 4. Main Body: Kanban Board vs Table View */}
      {viewMode === 'kanban' && !isArchivedTab ? (
        <TransmittalKanbanBoard
          transmittals={transmittals}
          isLoading={isListLoading}
          onView={(id) => setDetailModalId(id)}
          onEdit={(t) => {
            setFormEditTarget(t);
            setIsFormModalOpen(true);
          }}
          onPrint={(t) => setPrintTarget(t)}
          onApprove={(id) => setApproveTargetId(id)}
          onSend={(t) => setSendTarget(t)}
          onAcknowledge={(t) => setAcknowledgeTarget(t)}
          onDelete={(id) => setDeleteTargetId(id)}
        />
      ) : (
        <TransmittalTable
          transmittals={transmittals}
          isLoading={isListLoading}
          onView={(id) => setDetailModalId(id)}
          onEdit={(t) => {
            setFormEditTarget(t);
            setIsFormModalOpen(true);
          }}
          onPrint={(t) => setPrintTarget(t)}
          onApprove={(id) => setApproveTargetId(id)}
          onSend={(t) => setSendTarget(t)}
          onAcknowledge={(t) => setAcknowledgeTarget(t)}
          onArchive={(id) => {
            setArchiveTargetId(id);
            setIsArchiveMode(false);
          }}
          onUnarchive={(id) => {
            setArchiveTargetId(id);
            setIsArchiveMode(true);
          }}
          onDelete={(id) => setDeleteTargetId(id)}
        />
      )}

      {/* 5. Modals & Dialogs */}
      {/* Create / Edit Modal */}
      <TransmittalFormModal
        isOpen={isFormModalOpen}
        onClose={() => {
          setIsFormModalOpen(false);
          setFormEditTarget(null);
        }}
        transmittalToEdit={formEditTarget}
      />

      {/* Detail Modal */}
      <TransmittalDetailModal
        transmittalId={detailModalId}
        isOpen={Boolean(detailModalId)}
        onClose={() => setDetailModalId(null)}
        onEdit={(t) => {
          setDetailModalId(null);
          setFormEditTarget(t);
          setIsFormModalOpen(true);
        }}
        onPrint={(t) => setPrintTarget(t)}
        onApprove={(id) => setApproveTargetId(id)}
        onSend={(t) => setSendTarget(t)}
        onAcknowledge={(t) => setAcknowledgeTarget(t)}
        onDelete={(id) => setDeleteTargetId(id)}
      />

      {/* Print Preview Modal (Item-rows-only fix) */}
      <TransmittalPrintModal
        transmittal={printTarget}
        isOpen={Boolean(printTarget)}
        onClose={() => setPrintTarget(null)}
      />

      {/* Admin Approve Dialog */}
      <ApproveDialog
        transmittal={approveTargetTransmittal}
        isOpen={Boolean(approveTargetId)}
        onClose={() => setApproveTargetId(null)}
      />

      {/* Dual-Path Send Dialog */}
      <SendDialog
        transmittal={sendTarget}
        isOpen={Boolean(sendTarget)}
        onClose={() => setSendTarget(null)}
      />

      {/* Acknowledge Dialog */}
      <AcknowledgeDialog
        transmittal={acknowledgeTarget}
        isOpen={Boolean(acknowledgeTarget)}
        onClose={() => setAcknowledgeTarget(null)}
      />

      {/* Soft Delete Dialog */}
      <DeleteDialog
        transmittalId={deleteTargetId}
        trackingNumber={deleteTargetTransmittal?.tracking_number}
        isOpen={Boolean(deleteTargetId)}
        onClose={() => setDeleteTargetId(null)}
      />

      {/* Archive / Unarchive Dialog */}
      <ArchiveDialog
        transmittalId={archiveTargetId}
        isArchived={isArchiveMode}
        isOpen={Boolean(archiveTargetId)}
        onClose={() => setArchiveTargetId(null)}
      />

      {/* 6. Non-dismissible Blocking Action Modal (Root Mount) */}
      <BlockingActionModal />
    </div>
  );
}
