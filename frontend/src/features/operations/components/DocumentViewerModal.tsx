import React, { useState, useRef } from 'react';
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
} from 'lucide-react';
import {
  useDocumentDownloadUrl,
  useDocumentMutations,
} from '../api/useDocuments';
import { runBlockingAction } from './BlockingActionModal';
import { useSessionStore } from '@/lib/session';
import type { DmsDocument, DocumentComment, WorkRequest } from '../api/types';

export interface DocumentViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: DmsDocument | null;
  workRequest?: WorkRequest | null;
  onUploadSuccess?: (doc: DmsDocument) => void;
}

export function DocumentViewerModal({
  isOpen,
  onClose,
  document: initialDoc,
  workRequest,
  onUploadSuccess,
}: DocumentViewerModalProps) {
  const [doc, setDoc] = useState<DmsDocument | null>(initialDoc);
  const [newCommentText, setNewCommentText] = useState('');
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const currentUserId = useSessionStore((state) => state.user?.id);
  const currentUserName = useSessionStore((state) => state.user?.name || 'User');

  // Keep doc synced with initialDoc
  React.useEffect(() => {
    setDoc(initialDoc);
  }, [initialDoc]);

  const documentId = doc?.id;
  const { data: downloadData, isLoading: isDownloadLoading } =
    useDocumentDownloadUrl(documentId, { enabled: Boolean(documentId) });

  const { uploadDocument, updateComments } = useDocumentMutations();

  const isReadOnly =
    workRequest?.status === 'Cancelled' || Boolean(workRequest?.archived);

  // File attributes
  const fileName = doc?.fileName || doc?.file_name || doc?.originalName || 'Document';
  const contentType = doc?.contentType || doc?.content_type || '';
  const downloadUrl = downloadData?.url;

  // File Upload Handler (3-step signed upload)
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 50 MB file size limit check
    if (file.size > 50 * 1024 * 1024) {
      setUploadError('File size exceeds maximum allowed limit of 50 MB.');
      return;
    }
    setUploadError(null);

    await runBlockingAction({
      title: 'Uploading Document',
      message: `Uploading "${file.name}" (50 MB limit)...`,
      apiCall: async () => {
        return await uploadDocument({
          file,
          metadata: {
            workRequestId: workRequest?.id,
            clientId: workRequest?.clientId || undefined,
            category: 'OTHER',
          },
        });
      },
      successTitle: 'Document Uploaded',
      successMessage: `"${file.name}" was uploaded successfully.`,
      onSuccess: (uploadedDoc) => {
        if (uploadedDoc) {
          setDoc(uploadedDoc as DmsDocument);
          if (onUploadSuccess) onUploadSuccess(uploadedDoc as DmsDocument);
        }
      },
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Add Comment
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!doc || !newCommentText.trim() || isReadOnly) return;

    const existingComments: DocumentComment[] = doc.comments || [];
    const newComment: DocumentComment = {
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `comm-${Date.now()}`,
      userId: currentUserId || 'system',
      userName: currentUserName,
      date: new Date().toISOString(),
      text: newCommentText.trim(),
    };

    const updatedComments = [...existingComments, newComment];

    await runBlockingAction({
      title: 'Posting Comment',
      message: 'Saving your comment...',
      apiCall: async () => {
        return await updateComments({
          documentId: doc.id,
          comments: updatedComments,
        });
      },
      onSuccess: (updated) => {
        if (updated) setDoc(updated as DmsDocument);
        setNewCommentText('');
      },
    });
  };

  // Edit Comment
  const handleSaveEditComment = async (commentId: string) => {
    if (!doc || !editingCommentText.trim() || isReadOnly) return;

    const existingComments: DocumentComment[] = doc.comments || [];
    const updatedComments = existingComments.map((c) =>
      c.id === commentId ? { ...c, text: editingCommentText.trim() } : c
    );

    await runBlockingAction({
      title: 'Updating Comment',
      message: 'Saving updated comment...',
      apiCall: async () => {
        return await updateComments({
          documentId: doc.id,
          comments: updatedComments,
        });
      },
      onSuccess: (updated) => {
        if (updated) setDoc(updated as DmsDocument);
        setEditingCommentId(null);
        setEditingCommentText('');
      },
    });
  };

  // Delete Comment
  const handleDeleteComment = async (commentId: string) => {
    if (!doc || isReadOnly) return;
    if (!confirm('Are you sure you want to delete this comment?')) return;

    const existingComments: DocumentComment[] = doc.comments || [];
    const updatedComments = existingComments.filter((c) => c.id !== commentId);

    await runBlockingAction({
      title: 'Deleting Comment',
      message: 'Removing comment...',
      apiCall: async () => {
        return await updateComments({
          documentId: doc.id,
          comments: updatedComments,
        });
      },
      onSuccess: (updated) => {
        if (updated) setDoc(updated as DmsDocument);
      },
    });
  };

  // Determine Preview Component
  const renderPreview = () => {
    if (!doc) {
      return (
        <div className="h-full flex flex-col items-center justify-center text-slate-400 p-8 space-y-3">
          <Upload className="h-12 w-12 text-slate-300" />
          <p className="text-sm">No document selected. Upload a file to preview.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
          >
            Select Document
          </Button>
        </div>
      );
    }

    if (isDownloadLoading) {
      return (
        <div className="h-full flex items-center justify-center text-slate-400 text-sm">
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
        <div className="w-full h-full flex items-center justify-center p-4 bg-slate-100/50">
          <img
            src={downloadUrl}
            alt={fileName}
            className="max-w-full max-h-full object-contain shadow-sm rounded"
            data-testid="doc-preview-image"
          />
        </div>
      );
    }

    if (isText && downloadUrl) {
      return (
        <iframe
          src={downloadUrl}
          className="w-full h-full border-0 p-4 font-mono text-xs bg-slate-50"
          title={fileName}
          data-testid="doc-preview-text"
        />
      );
    }

    if (isDocx || isLegacyDoc) {
      return (
        <div className="h-full flex flex-col items-center justify-center p-8 space-y-4 text-center">
          <FileText className="h-16 w-16 text-blue-600" />
          <div className="space-y-1">
            <h4 className="font-semibold text-slate-800 text-sm">{fileName}</h4>
            <p className="text-xs text-slate-500 max-w-sm">
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
              <Button type="button" size="sm" className="gap-2">
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
        <FileQuestion className="h-16 w-16 text-slate-400" />
        <div className="space-y-1">
          <h4 className="font-semibold text-slate-800 text-sm">{fileName}</h4>
          <p className="text-xs text-slate-500 max-w-sm">
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
            <Button type="button" size="sm" variant="outline" className="gap-2">
              <Download className="h-4 w-4" /> Download File
            </Button>
          </a>
        )}
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden"
        data-testid="document-viewer-modal"
      >
        {/* Header */}
        <DialogHeader className="px-6 py-3 border-b border-slate-200 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <DialogTitle className="text-base font-bold text-slate-900 truncate max-w-md">
              {fileName}
            </DialogTitle>
            {doc?.category && (
              <Badge variant="outline" size="compact" className="text-[10px]">
                {doc.category}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2 pr-6">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              className="hidden"
            />
            {!isReadOnly && (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => fileInputRef.current?.click()}
                className="gap-1 text-xs"
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
                  className="gap-1 text-xs"
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
          <div className="px-6 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{uploadError}</span>
          </div>
        )}

        {/* 2-Column Viewer & Comments Body */}
        <div className="flex-1 flex overflow-hidden min-h-[460px]">
          {/* Left: Document Preview (65% width) */}
          <div className="flex-1 bg-slate-50 border-r border-slate-200 p-2 overflow-auto">
            {renderPreview()}
          </div>

          {/* Right: Threaded Comments (35% width) */}
          <div className="w-80 flex flex-col bg-white">
            <div className="p-3 border-b border-slate-200 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Comments ({doc?.comments?.length || 0})</span>
            </div>

            {/* Comments List */}
            <div className="flex-1 p-3 overflow-y-auto space-y-3">
              {doc?.comments && doc.comments.length > 0 ? (
                doc.comments.map((comment) => {
                  const isEditing = editingCommentId === comment.id;

                  return (
                    <div
                      key={comment.id}
                      className="p-2.5 rounded-md bg-slate-50 border border-slate-100 text-xs space-y-1.5"
                      data-testid={`comment-item-${comment.id}`}
                    >
                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span className="font-semibold text-slate-700">
                          {comment.userName || 'Author'}
                        </span>
                        <span>
                          {comment.date
                            ? new Date(comment.date).toLocaleDateString()
                            : ''}
                        </span>
                      </div>

                      {isEditing ? (
                        <div className="space-y-1.5">
                          <textarea
                            value={editingCommentText}
                            onChange={(e) => setEditingCommentText(e.target.value)}
                            rows={2}
                            className="w-full text-xs p-1.5 border border-slate-300 rounded bg-white text-slate-800"
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
                              onClick={() => comment.id && handleSaveEditComment(comment.id)}
                              className="h-5 text-[10px]"
                            >
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-slate-800 whitespace-pre-wrap">
                          {comment.text}
                        </p>
                      )}

                      {!isReadOnly && !isEditing && (
                        <div className="flex justify-end gap-2 pt-1 border-t border-slate-100 text-[10px] text-slate-400">
                          <button
                            type="button"
                            onClick={() => {
                              if (comment.id) {
                                setEditingCommentId(comment.id);
                                setEditingCommentText(comment.text);
                              }
                            }}
                            className="hover:text-blue-600 flex items-center gap-0.5"
                          >
                            <Edit2 className="h-2.5 w-2.5" /> Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => comment.id && handleDeleteComment(comment.id)}
                            className="hover:text-red-600 flex items-center gap-0.5"
                          >
                            <Trash2 className="h-2.5 w-2.5" /> Delete
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="text-xs text-slate-400 italic py-4 text-center">
                  No comments yet. Start the conversation below.
                </div>
              )}
            </div>

            {/* Add Comment Box */}
            {!isReadOnly && (
              <form onSubmit={handleAddComment} className="p-3 border-t border-slate-200 space-y-2">
                <textarea
                  value={newCommentText}
                  onChange={(e) => setNewCommentText(e.target.value)}
                  placeholder="Add a comment or review note..."
                  rows={2}
                  className="w-full text-xs p-2 border border-slate-200 rounded-md bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  data-testid="new-comment-textarea"
                />
                <div className="flex justify-end">
                  <Button
                    type="submit"
                    size="xs"
                    disabled={!newCommentText.trim()}
                    data-testid="post-comment-btn"
                    className="text-xs"
                  >
                    Post Comment
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-2.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} className="text-xs">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
