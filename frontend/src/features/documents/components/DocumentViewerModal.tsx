/**
 * Document Viewer Modal Component
 *
 * Canonical DMS viewer supporting:
 * - Direct native DmsDocument typing
 * - Enlarged windowed modal sizing (max-w-6xl w-[95vw] h-[88vh])
 * - Full-page view mode (full-viewport overlay) with toggle button
 * - Native DMS query hooks (useDocumentDownloadUrl, useUpdateDocument, useUploadDocument)
 * - PDF inline iframe, image preview, text preview, fallback download cards
 * - Comments pane (view, add, edit, delete)
 * - File replace/upload with 50 MB limit guard
 * - Shared design tokens (#f0f0f5, #f0f1f3, #2563eb, #1e293b, #9494a0)
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Download,
  Upload,
  MessageSquare,
  Trash2,
  Edit2,
  FileText,
  AlertCircle,
  FileQuestion,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import {
  useDocumentDownloadUrl,
  useUpdateDocument,
  useUploadDocument,
} from '../api/useDocuments';
import { MAX_FILE_SIZE_BYTES } from '../api/schemas';
import type { DmsDocument, DmsDocumentComment } from '../api/types';
import { useSessionStore } from '@/lib/session';

export interface ViewerWorkRequest {
  id: string;
  clientId?: string | null;
  status?: string;
  archived?: boolean;
}

export interface DocumentViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: DmsDocument | null;
  workRequest?: ViewerWorkRequest | null;
  onUploadSuccess?: (doc: DmsDocument) => void;
  readOnly?: boolean;
}

export function DocumentViewerModal({
  isOpen,
  onClose,
  document: initialDoc,
  workRequest,
  onUploadSuccess,
  readOnly = false,
}: DocumentViewerModalProps) {
  const [doc, setDoc] = useState<DmsDocument | null>(initialDoc);
  const [isFullPage, setIsFullPage] = useState(false);
  const [newCommentText, setNewCommentText] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const currentUserId = useSessionStore((state) => state.user?.id);
  const currentUserName = useSessionStore((state) => state.user?.name || 'User');

  // Keep doc synced with initialDoc
  useEffect(() => {
    setDoc(initialDoc);
    setUploadError(null);
    setEditingCommentId(null);
    setEditingCommentText('');
    setNewCommentText('');
  }, [initialDoc]);

  // Reset full page view when modal closes
  useEffect(() => {
    if (!isOpen) {
      setIsFullPage(false);
    }
  }, [isOpen]);

  // Handle ESC in full-page mode to return to windowed mode first
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullPage) {
        e.stopPropagation();
        setIsFullPage(false);
      }
    };
    if (isFullPage) {
      window.addEventListener('keydown', handleKeyDown, true);
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isFullPage]);

  const documentId = doc?.id;
  const { data: downloadData, isLoading: isDownloadLoading } =
    useDocumentDownloadUrl(documentId, { enabled: Boolean(documentId) });

  const updateMutation = useUpdateDocument();
  const uploadMutation = useUploadDocument();

  const isReadOnly =
    readOnly ||
    workRequest?.status === 'Cancelled' ||
    Boolean(workRequest?.archived) ||
    Boolean(doc?.archived);

  // File attributes (original name takes precedence for user display)
  const fileName =
    doc?.original_name ||
    doc?.originalName ||
    doc?.file_name ||
    doc?.fileName ||
    'Document';
  const contentType = doc?.contentType || doc?.content_type || '';
  const downloadUrl = downloadData?.url || doc?.external_url || null;

  // File Upload Handler (3-step signed upload)
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 50 MB file size limit check
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setUploadError('File size exceeds maximum allowed limit of 50 MB.');
      return;
    }
    setUploadError(null);

    try {
      const uploadedDoc = await uploadMutation.mutateAsync({
        file,
        metadata: {
          workRequestId: workRequest?.id || doc?.work_request_id || undefined,
          clientId: workRequest?.clientId || doc?.client_id || undefined,
          category: doc?.category || 'OTHER',
          fileName: file.name,
          originalName: file.name,
        },
      });
      if (uploadedDoc) {
        setDoc(uploadedDoc);
        if (onUploadSuccess) onUploadSuccess(uploadedDoc);
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to upload document');
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Add Comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doc || !newCommentText.trim() || isReadOnly) return;

    const existingComments: DmsDocumentComment[] = doc.comments || [];
    const newComment: DmsDocumentComment = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `comm-${Date.now()}`,
      userId: currentUserId || 'system',
      userName: currentUserName,
      date: new Date().toISOString(),
      text: newCommentText.trim(),
    };

    const updatedComments = [...existingComments, newComment];

    try {
      const updated = await updateMutation.mutateAsync({
        id: doc.id,
        data: {
          comments: updatedComments,
        },
      });
      if (updated) setDoc(updated);
      setNewCommentText('');
    } catch {
      // Handled by updateMutation
    }
  };

  // Edit Comment
  const handleSaveEditComment = async (commentId: string) => {
    if (!doc || !editingCommentText.trim() || isReadOnly) return;

    const existingComments: DmsDocumentComment[] = doc.comments || [];
    const updatedComments = existingComments.map((c) =>
      c.id === commentId ? { ...c, text: editingCommentText.trim() } : c
    );

    try {
      const updated = await updateMutation.mutateAsync({
        id: doc.id,
        data: {
          comments: updatedComments,
        },
      });
      if (updated) setDoc(updated);
      setEditingCommentId(null);
      setEditingCommentText('');
    } catch {
      // Handled by updateMutation
    }
  };

  // Delete Comment
  const handleDeleteComment = async (commentId: string) => {
    if (!doc || isReadOnly) return;
    if (typeof window !== 'undefined' && !window.confirm('Are you sure you want to delete this comment?')) return;

    const existingComments: DmsDocumentComment[] = doc.comments || [];
    const updatedComments = existingComments.filter((c) => c.id !== commentId);

    try {
      const updated = await updateMutation.mutateAsync({
        id: doc.id,
        data: {
          comments: updatedComments,
        },
      });
      if (updated) setDoc(updated);
    } catch {
      // Handled by updateMutation
    }
  };

  // Determine Preview Component
  const renderPreview = () => {
    if (!doc) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-[#9494a0] p-8 space-y-3">
          <Upload className="h-12 w-12 text-[#9494a0]" />
          <p className="text-sm">No document selected. Upload a file to preview.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="border-[#f0f0f5] text-[#1e293b]"
          >
            Select Document
          </Button>
        </div>
      );
    }

    if (isDownloadLoading) {
      return (
        <div className="h-full flex items-center justify-center text-[#9494a0] text-sm">
          Loading document preview...
        </div>
      );
    }

    const isPdf =
      contentType.includes('pdf') || fileName.toLowerCase().endsWith('.pdf');
    const isImage =
      contentType.startsWith('image/') ||
      /\.(png|jpe?g|gif|webp|svg)$/i.test(fileName);
    const isText =
      contentType.startsWith('text/') ||
      /\.(txt|csv|json|md)$/i.test(fileName);
    const isDocx =
      contentType.includes('wordprocessingml') ||
      fileName.toLowerCase().endsWith('.docx');
    const isLegacyDoc = fileName.toLowerCase().endsWith('.doc');

    if (downloadUrl && isPdf) {
      return (
        <iframe
          src={downloadUrl}
          className="w-full h-full border-0 rounded-md"
          title={fileName}
          data-testid="doc-preview-pdf"
        />
      );
    }

    if (downloadUrl && isImage) {
      return (
        <div className="w-full h-full flex items-center justify-center p-4">
          <img
            src={downloadUrl}
            alt={fileName}
            className="max-w-full max-h-full object-contain shadow-xs rounded"
            data-testid="doc-preview-image"
          />
        </div>
      );
    }

    if (isText && downloadUrl) {
      return (
        <iframe
          src={downloadUrl}
          className="w-full h-full border-0 p-4 font-mono text-xs bg-white rounded"
          title={fileName}
          data-testid="doc-preview-text"
        />
      );
    }

    if (isDocx || isLegacyDoc) {
      return (
        <div className="h-full flex flex-col items-center justify-center p-8 space-y-4 text-center">
          <FileText className="h-16 w-16 text-[#2563eb]" />
          <div className="space-y-1">
            <h4 className="font-semibold text-[#1e293b] text-sm">{fileName}</h4>
            <p className="text-xs text-[#9494a0] max-w-sm">
              {isLegacyDoc
                ? 'Legacy Word document (.doc) cannot be previewed inline. Please download to view.'
                : 'Word Document (.docx) preview is ready for download.'}
            </p>
          </div>
          {downloadUrl && (
            <a
              href={downloadUrl}
              download={fileName}
              target="_blank"
              rel="noreferrer"
            >
              <Button type="button" size="sm" className="gap-2 bg-[#2563eb] hover:bg-[#1d4ed8] text-white">
                <Download className="h-4 w-4" /> Download to View
              </Button>
            </a>
          )}
        </div>
      );
    }

    // Generic / Fallback
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 space-y-4 text-center">
        <FileQuestion className="h-16 w-16 text-[#9494a0]" />
        <div className="space-y-1">
          <h4 className="font-semibold text-[#1e293b] text-sm">{fileName}</h4>
          <p className="text-xs text-[#9494a0] max-w-sm">
            This file type does not support inline preview. You can download the file to inspect its contents.
          </p>
        </div>
        {downloadUrl && (
          <a
            href={downloadUrl}
            download={fileName}
            target="_blank"
            rel="noreferrer"
          >
            <Button type="button" size="sm" variant="outline" className="gap-2 border-[#f0f0f5] text-[#1e293b]">
              <Download className="h-4 w-4" /> Download File
            </Button>
          </a>
        )}
      </div>
    );
  };

  const contentClasses = isFullPage
    ? 'fixed inset-0 left-0 top-0 translate-x-0 translate-y-0 w-screen h-screen max-w-none max-h-none rounded-none border-0 p-0 flex flex-col overflow-hidden z-50 bg-white gap-0'
    : 'max-w-6xl w-[95vw] h-[88vh] max-h-[92vh] flex flex-col p-0 overflow-hidden border border-[#f0f0f5] bg-white gap-0';

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={contentClasses}
        data-testid="document-viewer-modal"
      >
        {/* Header */}
        <DialogHeader className="px-6 py-3 border-b border-[#f0f0f5] flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2 min-w-0">
            <DialogTitle className="text-base font-bold text-[#1e293b] truncate max-w-md">
              {fileName}
            </DialogTitle>
            {doc?.category && (
              <Badge variant="outline" size="compact" className="text-[10px]">
                {doc.category}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 pr-6">
            {/* Full-Page Toggle Button */}
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setIsFullPage(!isFullPage)}
              className="gap-1.5 text-xs text-[#1e293b] border-[#f0f0f5] hover:bg-[#f0f1f3]"
              title={isFullPage ? 'Exit full-page view' : 'Full-page preview'}
              data-testid="toggle-fullpage-preview"
            >
              {isFullPage ? (
                <>
                  <Minimize2 className="h-3.5 w-3.5" />
                  <span>Exit Full Page</span>
                </>
              ) : (
                <>
                  <Maximize2 className="h-3.5 w-3.5" />
                  <span>Full Page</span>
                </>
              )}
            </Button>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              className="hidden"
              data-testid="viewer-file-input"
            />
            {!isReadOnly && (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => fileInputRef.current?.click()}
                className="gap-1 text-xs text-[#1e293b] border-[#f0f0f5] hover:bg-[#f0f1f3]"
                data-testid="upload-doc-btn"
              >
                <Upload className="h-3.5 w-3.5" /> Replace / Upload
              </Button>
            )}
            {downloadUrl && (
              <a href={downloadUrl} download={fileName} target="_blank" rel="noreferrer">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  className="gap-1 text-xs text-[#1e293b] border-[#f0f0f5] hover:bg-[#f0f1f3]"
                  data-testid="download-doc-btn"
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </Button>
              </a>
            )}
          </div>
        </DialogHeader>

        {/* Upload Error Banner */}
        {uploadError && (
          <div className="px-6 py-2 bg-rose-50 border-b border-rose-200 text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{uploadError}</span>
          </div>
        )}

        {/* 2-Column Viewer & Comments Body */}
        <div className="flex-1 flex overflow-hidden min-h-[520px]">
          {/* Left: Document Preview */}
          <div className="flex-1 bg-[#f8fafc] border-r border-[#f0f0f5] p-2 overflow-auto flex flex-col items-center justify-center">
            {renderPreview()}
          </div>

          {/* Right: Threaded Comments */}
          <div className="w-80 sm:w-96 flex flex-col bg-white">
            <div className="p-3 border-b border-[#f0f0f5] flex items-center gap-1.5 text-xs font-semibold text-[#1e293b]">
              <MessageSquare className="h-3.5 w-3.5 text-[#2563eb]" />
              <span>Comments ({doc?.comments?.length || 0})</span>
            </div>

            {/* Comments List */}
            <div className="flex-1 p-3 overflow-y-auto space-y-3">
              {doc?.comments && doc.comments.length > 0 ? (
                doc.comments.map((comment, index) => {
                  const commentId = comment.id || `comm-${index}`;
                  const isEditing = editingCommentId === commentId;

                  return (
                    <div
                      key={commentId}
                      className="p-2.5 rounded-md bg-[#f8fafc] border border-[#f0f0f5] text-xs space-y-1.5"
                      data-testid={`comment-item-${commentId}`}
                    >
                      <div className="flex items-center justify-between text-[11px] text-[#9494a0]">
                        <span className="font-semibold text-[#1e293b]">
                          {comment.userName || comment.user_name || comment.author || 'Author'}
                        </span>
                        <span>
                          {comment.date || comment.created_at
                            ? new Date(comment.date || comment.created_at || '').toLocaleDateString()
                            : ''}
                        </span>
                      </div>

                      {isEditing ? (
                        <div className="space-y-1.5">
                          <textarea
                            value={editingCommentText}
                            onChange={(e) => setEditingCommentText(e.target.value)}
                            rows={2}
                            className="w-full text-xs p-1.5 border border-[#f0f0f5] rounded bg-white text-[#1e293b] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
                          />
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="xs"
                              onClick={() => setEditingCommentId(null)}
                              className="h-5 text-[10px]"
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              size="xs"
                              onClick={() => handleSaveEditComment(commentId)}
                              className="h-5 text-[10px] bg-[#2563eb] hover:bg-[#1d4ed8] text-white"
                            >
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-[#1e293b] whitespace-pre-wrap">
                          {comment.text}
                        </p>
                      )}

                      {!isReadOnly && !isEditing && (
                        <div className="flex justify-end gap-2 pt-1 border-t border-[#f0f0f5] text-[10px] text-[#9494a0]">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCommentId(commentId);
                              setEditingCommentText(comment.text);
                            }}
                            className="hover:text-[#2563eb] flex items-center gap-0.5 cursor-pointer"
                          >
                            <Edit2 className="h-2.5 w-2.5" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteComment(commentId)}
                            className="hover:text-rose-600 flex items-center gap-0.5 cursor-pointer"
                          >
                            <Trash2 className="h-2.5 w-2.5" /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-xs text-[#9494a0] italic py-4 text-center">
                  No comments yet. Start the conversation below.
                </div>
              )}
            </div>

            {/* Add Comment Box */}
            {!isReadOnly && (
              <form onSubmit={handleAddComment} className="p-3 border-t border-[#f0f0f5] space-y-2">
                <textarea
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  placeholder="Add a comment or review note..."
                  rows={2}
                  className="w-full text-xs p-2 border border-[#f0f0f5] rounded-md bg-white text-[#1e293b] placeholder:text-[#9494a0] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
                  data-testid="new-comment-textarea"
                />
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    size="xs"
                    disabled={!newCommentText.trim() || updateMutation.isPending}
                    data-testid="post-comment-btn"
                    className="text-xs bg-[#2563eb] hover:bg-[#1d4ed8] text-white"
                  >
                    Post Comment
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-2.5 border-t border-[#f0f0f5] bg-[#f8fafc] flex items-center justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-xs text-[#1e293b] hover:bg-[#f0f1f3]"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
