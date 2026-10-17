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
    <div className="space-y-6 p-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FolderOpen className="h-6 w-6 text-[#2563eb]" />
            <h1 className="text-2xl font-bold tracking-tight text-[#1e293b]">
              Document Management System
            </h1>
          </div>
          <p className="text-sm text-[#9494a0] mt-1">
            Secure digital records, compliance classifications, and physical lifecycle tracking.
          </p>
        </div>

        {canEdit && (
          <Button
            onClick={() => setIsUploadModalOpen(true)}
            className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white"
            data-testid="header-upload-button"
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload Document
          </Button>
        )}
      </div>

      {/* Tabs: Active vs. Archived */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <div className="flex items-center justify-between border-b border-[#f0f0f5] pb-2">
          <TabsList className="bg-[#f0f1f3] p-1 border border-[#f0f0f5] rounded-lg">
            <TabsTrigger
              value="active"
              className="gap-2 data-[state=active]:bg-white data-[state=active]:text-[#1e293b] data-[state=active]:shadow-xs text-[#9494a0] cursor-pointer"
              data-testid="tab-active-documents"
            >
              <FolderOpen className="h-4 w-4" />
              <span>Active Documents</span>
              <Badge
                variant="secondary"
                className="ml-1 text-xs px-1.5 py-0 bg-white text-[#1e293b] border border-[#f0f0f5]"
                data-testid="badge-active-count"
              >
                {countsData?.active ?? 0}
              </Badge>
            </TabsTrigger>

            <TabsTrigger
              value="archived"
              className="gap-2 data-[state=active]:bg-white data-[state=active]:text-[#1e293b] data-[state=active]:shadow-xs text-[#9494a0] cursor-pointer"
              data-testid="tab-archived-documents"
            >
              <Archive className="h-4 w-4" />
              <span>Archived</span>
              <Badge
                variant="secondary"
                className="ml-1 text-xs px-1.5 py-0 bg-white text-[#1e293b] border border-[#f0f0f5]"
                data-testid="badge-archived-count"
              >
                {countsData?.archived ?? 0}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </div>
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
