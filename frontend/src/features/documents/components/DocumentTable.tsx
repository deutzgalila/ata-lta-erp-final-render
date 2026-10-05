/**
 * Document Table Component
 *
 * Tabular layout displaying documents with search, category badges, lifecycle status pills,
 * pagination controls, and row action triggers.
 */

import {
  FileText,
  Eye,
  Download,
  ExternalLink,
  RefreshCw,
  Archive,
  ArchiveRestore,
  Trash2,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  MoreHorizontal,
} from 'lucide-react';

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { DmsDocument } from '../api/types';
import {
  CATEGORY_LABELS,
  LIFECYCLE_LABELS,
  LIFECYCLE_BADGE_STYLES,
  CATEGORY_BADGE_STYLES,
} from '../constants';
import { formatFileSize } from '../utils/formatters';

export interface DocumentTableProps {
  documents: DmsDocument[];
  isLoading?: boolean;
  total?: number;
  page?: number;
  limit?: number;
  onPageChange?: (page: number) => void;
  onView: (doc: DmsDocument) => void;
  onDownload?: (doc: DmsDocument) => void;
  onTransition?: (doc: DmsDocument) => void;
  onArchive?: (doc: DmsDocument) => void;
  onUnarchive?: (doc: DmsDocument) => void;
  onDelete?: (doc: DmsDocument) => void;
  canHandover?: boolean;
  canEdit?: boolean;
  canDelete?: boolean;
}

export function DocumentTable({
  documents,
  isLoading = false,
  total = 0,
  page = 1,
  limit = 50,
  onPageChange,
  onView,
  onDownload,
  onTransition,
  onArchive,
  onUnarchive,
  onDelete,
  canHandover = false,
  canEdit = false,
  canDelete = false,
}: DocumentTableProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));

  if (isLoading) {
    return (
      <div className="rounded-lg border border-[#f0f0f5] bg-white p-8 text-center">
        <div className="flex flex-col items-center justify-center space-y-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#2563eb] border-t-transparent" />
          <p className="text-sm text-[#9494a0]">Loading documents...</p>
        </div>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div
        className="rounded-lg border border-[#f0f0f5] bg-white p-12 text-center"
        data-testid="documents-empty-state"
      >
        <div className="flex flex-col items-center justify-center max-w-sm mx-auto space-y-3">
          <div className="p-3 bg-[#f0f1f3] rounded-full text-[#9494a0]">
            <FolderOpen className="h-8 w-8" />
          </div>
          <h3 className="font-semibold text-[#1e293b]">No documents found</h3>
          <p className="text-sm text-[#9494a0]">
            No document records match your current filter parameters or tab selection.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[#f0f0f5] bg-white overflow-hidden">
        <Table data-testid="documents-table">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[38%]">Document</TableHead>
              <TableHead className="w-[14%]">Category</TableHead>
              <TableHead className="w-[18%]">Physical Lifecycle</TableHead>
              <TableHead className="w-[12%]">Status</TableHead>
              <TableHead className="w-[10%]">Date</TableHead>
              <TableHead className="w-[8%] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc) => {
              const displayName = doc.original_name || doc.file_name;
              const cat = doc.category || 'OTHER';
              const lifecycle = doc.document_lifecycle || 'collected';
              const isExternal = Boolean(doc.external_url);

              return (
                <TableRow key={doc.id} data-testid={`document-row-${doc.id}`}>
                  {/* Document Name & Meta */}
                  <TableCell>
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded bg-[#eef1ff] text-[#2563eb] shrink-0 mt-0.5">
                        {isExternal ? (
                          <ExternalLink className="h-4 w-4" />
                        ) : (
                          <FileText className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => onView(doc)}
                          className="font-medium text-sm text-[#1e293b] hover:text-[#2563eb] truncate block text-left"
                          title={displayName}
                          data-testid={`document-name-${doc.id}`}
                        >
                          {displayName}
                        </button>
                        <div className="flex items-center gap-2 text-xs text-[#9494a0] mt-0.5 truncate">
                          {isExternal ? (
                            <span className="text-[#2563eb]">External Link</span>
                          ) : (
                            <span>{formatFileSize(doc.file_size)}</span>
                          )}
                          {doc.document_type && (
                            <>
                              <span>•</span>
                              <span className="truncate">{doc.document_type}</span>
                            </>
                          )}
                        </div>
                        {doc.description && (
                          <p className="text-xs text-[#9494a0] mt-1 line-clamp-1">
                            {doc.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>

                  {/* Category */}
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-xs ${CATEGORY_BADGE_STYLES[cat] || CATEGORY_BADGE_STYLES.OTHER}`}
                      data-testid={`document-category-${doc.id}`}
                    >
                      {CATEGORY_LABELS[cat] || cat}
                    </Badge>
                  </TableCell>

                  {/* Physical Lifecycle Status Pill */}
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`text-xs ${LIFECYCLE_BADGE_STYLES[lifecycle] || LIFECYCLE_BADGE_STYLES.collected}`}
                      data-testid={`document-lifecycle-${doc.id}`}
                    >
                      {LIFECYCLE_LABELS[lifecycle] || lifecycle}
                    </Badge>
                  </TableCell>

                  {/* Document Status */}
                  <TableCell>
                    {doc.status === 'active' ? (
                      <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                        Active
                      </Badge>
                    ) : doc.status === 'pending_upload' ? (
                      <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                        Pending Upload
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs bg-rose-50 text-rose-700 border-rose-200">
                        Failed
                      </Badge>
                    )}
                  </TableCell>

                  {/* Date */}
                  <TableCell className="text-xs text-[#9494a0] whitespace-nowrap">
                    {new Date(doc.created_at).toLocaleDateString()}
                  </TableCell>

                  {/* Actions Dropdown / Quick Buttons */}
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          data-testid={`document-actions-${doc.id}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem onClick={() => onView(doc)} data-testid={`action-view-${doc.id}`}>
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </DropdownMenuItem>

                        {onDownload && (
                          <DropdownMenuItem onClick={() => onDownload(doc)} data-testid={`action-download-${doc.id}`}>
                            {isExternal ? (
                              <ExternalLink className="h-4 w-4 mr-2" />
                            ) : (
                              <Download className="h-4 w-4 mr-2" />
                            )}
                            {isExternal ? 'Open Link' : 'Download'}
                          </DropdownMenuItem>
                        )}

                        {canHandover && onTransition && (
                          <DropdownMenuItem onClick={() => onTransition(doc)} data-testid={`action-transition-${doc.id}`}>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Update Lifecycle
                          </DropdownMenuItem>
                        )}

                        <DropdownMenuSeparator />

                        {canEdit && (
                          doc.archived ? (
                            onUnarchive && (
                              <DropdownMenuItem
                                onClick={() => onUnarchive(doc)}
                                data-testid={`action-unarchive-${doc.id}`}
                              >
                                <ArchiveRestore className="h-4 w-4 mr-2" />
                                Unarchive
                              </DropdownMenuItem>
                            )
                          ) : (
                            onArchive && (
                              <DropdownMenuItem
                                onClick={() => onArchive(doc)}
                                data-testid={`action-archive-${doc.id}`}
                              >
                                <Archive className="h-4 w-4 mr-2" />
                                Archive
                              </DropdownMenuItem>
                            )
                          )
                        )}

                        {canDelete && onDelete && (
                          <DropdownMenuItem
                            onClick={() => onDelete(doc)}
                            className="text-rose-600 focus:text-rose-600"
                            data-testid={`action-delete-${doc.id}`}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination Controls */}
      {total > 0 && onPageChange && (
        <div className="flex items-center justify-between px-2 py-1 text-sm text-[#9494a0]">
          <div>
            Showing {Math.min((page - 1) * limit + 1, total)} to {Math.min(page * limit, total)} of {total} documents
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              data-testid="pagination-prev"
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Previous
            </Button>
            <span className="text-xs px-2">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              data-testid="pagination-next"
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
