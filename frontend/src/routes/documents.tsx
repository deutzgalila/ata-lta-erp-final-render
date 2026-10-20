/**
 * Documents (DMS) Route Page (Module #7)
 *
 * Citation: Frozen API Contract documents@2.0.0 (docs/api-contracts/modules/documents.md)
 * Gated by dms:view permission and 'Documents' feature flag.
 * Mounts BlockingActionModal at root.
 * Reuses DocumentViewerModal from Operations.
 */

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  FolderOpen,
  Archive,
  Upload,
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
  DocumentFilterBar,
  DocumentTable,
  DocumentUploadModal,
  DocumentLifecycleModal,
  DocumentViewerModal,
} from '@/features/documents';
import {
  useDocumentsList,
  useDocumentCounts,
  useLifecycleTransition,
  useArchiveDocument,
  useUnarchiveDocument,
  useDeleteDocument,
} from '@/features/documents/api/useDocuments';
import { apiRequest } from '@/lib/api';
import type { DmsDocument, DocumentLifecycle } from '@/features/documents/api/types';

export default function DocumentsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'active';
  const isArchived = activeTab === 'archived';

  // Filters state
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [category, setCategory] = useState(searchParams.get('category') || '');
  const [lifecycle, setLifecycle] = useState(searchParams.get('lifecycle') || '');
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1', 10));
  const limit = 50;

  // Modals state
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [viewerDoc, setViewerDoc] = useState<DmsDocument | null>(null);
  const [lifecycleDoc, setLifecycleDoc] = useState<DmsDocument | null>(null);

  // RBAC permissions
  const permissions = useSessionStore((state) => state.permissions);
  const canView = hasPermission(permissions, 'dms:view');
  const canEdit = hasPermission(permissions, 'dms:edit');
  const canDelete = hasPermission(permissions, 'dms:delete');
  const canHandover = hasPermission(permissions, 'dms:handover');

  // Mutation hooks
  const lifecycleMutation = useLifecycleTransition();
  const archiveMutation = useArchiveDocument();
  const unarchiveMutation = useUnarchiveDocument();
  const deleteMutation = useDeleteDocument();

  // Queries
  const { data: countsData } = useDocumentCounts({ enabled: canView });
  const { data: listResponse, isLoading: isListLoading } = useDocumentsList(
    {
      archived: isArchived,
      search: search || undefined,
      category: category || undefined,
      lifecycle: lifecycle || undefined,
      page,
      limit,
    },
    { enabled: canView }
  );

  // Tab change handler
  const handleTabChange = (newTab: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('tab', newTab);
      next.delete('page');
      return next;
    });
    setPage(1);
  };

  // Reset filters
  const handleResetFilters = () => {
    setSearch('');
    setCategory('');
    setLifecycle('');
    setPage(1);
  };

  // Download handler
  const handleDownload = async (doc: DmsDocument) => {
    if (doc.external_url) {
      window.open(doc.external_url, '_blank', 'noopener,noreferrer');
      return;
    }

    try {
      const res = await apiRequest<{ data: { url: string; fileName: string } }>(
        `/documents/${doc.id}/download-url`
      );
      if (res.data?.url) {
        window.open(res.data.url, '_blank', 'noopener,noreferrer');
      }
    } catch {
      // Handled by apiRequest or notifications
    }
  };

  // Lifecycle transition confirmation
  const handleLifecycleConfirm = async (newLifecycle: DocumentLifecycle) => {
    if (!lifecycleDoc) return;
    await lifecycleMutation.mutateAsync({
      id: lifecycleDoc.id,
      lifecycle: newLifecycle,
    });
    setLifecycleDoc(null);
  };

  // Archive confirmation
  const handleArchive = async (doc: DmsDocument) => {
    await archiveMutation.mutateAsync(doc.id);
  };

  // Unarchive confirmation
  const handleUnarchive = async (doc: DmsDocument) => {
    await unarchiveMutation.mutateAsync(doc.id);
  };

  // Delete confirmation
  const handleDelete = async (doc: DmsDocument) => {
    if (window.confirm(`Are you sure you want to delete "${doc.original_name || doc.file_name}"?`)) {
      await deleteMutation.mutateAsync(doc.id);
    }
  };

  // Feature Flag Guard
  if (!isModuleEnabled('Documents')) {
    return (
      <ModulePlaceholder
        name="Documents"
        description="Document Management System (DMS), client files, and secure digital records."
      />
    );
  }

  // Permission Guard
  if (!canView) {
    return <Forbidden requiredPermission="dms:view" />;
  }

  const documents = listResponse?.data ?? [];
  const total = listResponse?.meta?.total ?? 0;

  return (
    <div className="w-full space-y-6" data-testid="documents-page">
      {/* 1. Blueprint Module Header */}
      <div className="border-b-2 border-[#0A0A0A] pb-4 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <nav
            aria-label="Breadcrumb"
            className="font-mono text-xs uppercase tracking-wider text-[#4A4945] flex items-center gap-1.5 pb-1"
          >
            <span>Modules</span>
            <span aria-hidden="true">/</span>
            <span className="text-[#0A0A0A] font-semibold">Documents</span>
          </nav>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#0A0A0A] flex items-center gap-2">
            <FolderOpen className="h-6 w-6 text-[#0A0A0A]" />
            <span>Document Management System</span>
          </h1>
          <p className="text-xs sm:text-sm text-[#4A4945] pt-0.5">
            Secure digital records, compliance classifications, and physical lifecycle tracking.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          {canEdit && (
            <Button
              onClick={() => setIsUploadModalOpen(true)}
              className="bg-[#0A0A0A] hover:bg-[#222220] text-[#FAF9F5] text-xs font-mono font-semibold uppercase tracking-wider rounded-none border border-[#0A0A0A] h-9 gap-1.5 shadow-none cursor-pointer"
              data-testid="header-upload-button"
            >
              <Upload className="h-4 w-4 mr-1.5" />
              Upload Document
            </Button>
          )}
        </div>
      </div>

      {/* 2. Tabs: Active vs. Archived */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full space-y-4">
        <TabsList className="w-full justify-start rounded-none bg-[#EAE8E3] p-0 border border-[#0A0A0A] border-b-2 gap-0 h-auto overflow-x-auto scrollbar-none flex flex-nowrap">
          <TabsTrigger
            value="active"
            className="rounded-none border-r border-[#C8C5BC] font-mono text-xs font-semibold px-4 py-2.5 text-[#4A4945] hover:bg-[#E4E2DC] hover:text-[#0A0A0A] data-[state=active]:bg-[#0A0A0A] data-[state=active]:text-[#FAF9F5] data-[state=active]:shadow-[inset_0_-3px_0_0_#E61919] transition-colors cursor-pointer shrink-0 flex items-center gap-1.5"
            data-testid="tab-active-documents"
          >
            <FolderOpen className="h-4 w-4" />
            <span>Active Documents</span>
            <Badge
              variant="secondary"
              className="ml-1.5 text-xs font-mono px-1.5 py-0 rounded-none border border-[#C8C5BC] bg-[#EAE8E3] text-[#0A0A0A]"
              data-testid="badge-active-count"
            >
              {countsData?.active ?? 0}
            </Badge>
          </TabsTrigger>

          <TabsTrigger
            value="archived"
            className="rounded-none border-r border-[#C8C5BC] font-mono text-xs font-semibold px-4 py-2.5 text-[#4A4945] hover:bg-[#E4E2DC] hover:text-[#0A0A0A] data-[state=active]:bg-[#0A0A0A] data-[state=active]:text-[#FAF9F5] data-[state=active]:shadow-[inset_0_-3px_0_0_#E61919] transition-colors cursor-pointer shrink-0 flex items-center gap-1.5"
            data-testid="tab-archived-documents"
          >
            <Archive className="h-4 w-4" />
            <span>Archived</span>
            <Badge
              variant="secondary"
              className="ml-1.5 text-xs font-mono px-1.5 py-0 rounded-none border border-[#C8C5BC] bg-[#EAE8E3] text-[#0A0A0A]"
              data-testid="badge-archived-count"
            >
              {countsData?.archived ?? 0}
            </Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Filter Bar */}
      <DocumentFilterBar
        search={search}
        onSearchChange={setSearch}
        category={category}
        onCategoryChange={setCategory}
        lifecycle={lifecycle}
        onLifecycleChange={setLifecycle}
        onReset={handleResetFilters}
      />

      {/* Document Table */}
      <DocumentTable
        documents={documents}
        isLoading={isListLoading}
        total={total}
        page={page}
        limit={limit}
        onPageChange={setPage}
        onView={(doc) => setViewerDoc(doc)}
        onDownload={handleDownload}
        onTransition={(doc) => setLifecycleDoc(doc)}
        onArchive={handleArchive}
        onUnarchive={handleUnarchive}
        onDelete={handleDelete}
        canHandover={canHandover}
        canEdit={canEdit}
        canDelete={canDelete}
      />

      {/* Canonical DMS Document Viewer Modal */}
      <DocumentViewerModal
        isOpen={Boolean(viewerDoc)}
        onClose={() => setViewerDoc(null)}
        document={viewerDoc}
      />

      {/* Upload Modal */}
      <DocumentUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
      />

      {/* Lifecycle Transition Modal */}
      <DocumentLifecycleModal
        isOpen={Boolean(lifecycleDoc)}
        onClose={() => setLifecycleDoc(null)}
        document={lifecycleDoc}
        onConfirm={handleLifecycleConfirm}
      />

      {/* Root Blocking Action Modal (Zero Optimistic Updates Doctrine) */}
      <BlockingActionModal />
    </div>
  );
}
