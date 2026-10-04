/**
 * Document Upload Modal
 *
 * Implements client-side 50 MB file size guard and 3-step pre-signed URL upload pipeline
 * or direct external URL registration.
 */

import React, { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Upload,
  Link as LinkIcon,
  FileText,
  AlertCircle,
  X,
} from 'lucide-react';
import {
  DOCUMENT_CATEGORIES,
  MAX_FILE_SIZE_BYTES,
} from '../api/schemas';
import type {
  DmsDocument,
  DocumentCategory,
  CreateDocumentInput,
} from '../api/types';
import { CATEGORY_LABELS } from '../constants';
import { formatFileSize } from '../utils/formatters';
import { useUploadDocument } from '../api/useDocuments';

export interface DocumentUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (doc: DmsDocument) => void;
  defaultWorkRequestId?: string;
  defaultClientId?: string;
}


export function DocumentUploadModal({
  isOpen,
  onClose,
  onSuccess,
  defaultWorkRequestId,
  defaultClientId,
}: DocumentUploadModalProps) {
  const [mode, setMode] = useState<'file' | 'external'>('file');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('OTHER');
  const [documentType, setDocumentType] = useState('');
  const [description, setDescription] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [workRequestId, setWorkRequestId] = useState(defaultWorkRequestId || '');
  const [clientId, setClientId] = useState(defaultClientId || '');
  const [sizeError, setSizeError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadMutation = useUploadDocument();

  const resetForm = () => {
    setSelectedFile(null);
    setFileName('');
    setCategory('OTHER');
    setDocumentType('');
    setDescription('');
    setExternalUrl('');
    setWorkRequestId(defaultWorkRequestId || '');
    setClientId(defaultClientId || '');
    setSizeError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setSizeError(
        `File size (${formatFileSize(file.size)}) exceeds maximum allowed limit of 50 MB (52,428,800 bytes).`
      );
      setSelectedFile(null);
      setFileName('');
      return;
    }

    setSizeError(null);
    setSelectedFile(file);
    setFileName(file.name);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === 'file') {
      if (!selectedFile) return;

      const metadata: Partial<CreateDocumentInput> = {
        fileName: fileName.trim() || selectedFile.name,
        originalName: selectedFile.name,
        category,
        documentType: documentType.trim() || undefined,
        description: description.trim() || undefined,
        workRequestId: workRequestId.trim() || undefined,
        clientId: clientId.trim() || undefined,
      };

      try {
        const uploadedDoc = await uploadMutation.mutateAsync({
          file: selectedFile,
          metadata,
        });
        if (onSuccess) onSuccess(uploadedDoc);
        handleClose();
      } catch {
        // Handled by runBlockingAction modal
      }
    } else {
      if (!externalUrl.trim() || !fileName.trim()) return;

      // Create a dummy 0-byte file object for external URL payload flow
      const dummyFile = new File([''], fileName.trim(), { type: 'text/plain' });
      const metadata: Partial<CreateDocumentInput> = {
        fileName: fileName.trim(),
        originalName: fileName.trim(),
        externalUrl: externalUrl.trim(),
        category,
        documentType: documentType.trim() || undefined,
        description: description.trim() || undefined,
        workRequestId: workRequestId.trim() || undefined,
        clientId: clientId.trim() || undefined,
      };

      try {
        const createdDoc = await uploadMutation.mutateAsync({
          file: dummyFile,
          metadata,
        });
        if (onSuccess) onSuccess(createdDoc);
        handleClose();
      } catch {
        // Handled by runBlockingAction modal
      }
    }
  };

  const isSubmitDisabled =
    uploadMutation.isPending ||
    (mode === 'file' ? !selectedFile || Boolean(sizeError) : !externalUrl.trim() || !fileName.trim());

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-lg" data-testid="document-upload-modal">
        <DialogHeader>
          <DialogTitle>Upload Document</DialogTitle>
          <DialogDescription>
            Add a new document to the Document Management System with compliance categorization.
          </DialogDescription>
        </DialogHeader>

        {/* Mode Selector */}
        <div className="flex border-b border-zinc-200 dark:border-zinc-800 -mx-6 px-6 pb-3 gap-4 text-sm font-medium">
          <button
            type="button"
            onClick={() => {
              setMode('file');
              setSizeError(null);
            }}
            className={`flex items-center gap-2 pb-1 border-b-2 transition-colors ${
              mode === 'file'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
            data-testid="mode-tab-file"
          >
            <Upload className="h-4 w-4" />
            File Upload
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('external');
              setSizeError(null);
            }}
            className={`flex items-center gap-2 pb-1 border-b-2 transition-colors ${
              mode === 'external'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
            data-testid="mode-tab-external"
          >
            <LinkIcon className="h-4 w-4" />
            External Link
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          {mode === 'file' ? (
            /* File Picker / Dropzone */
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileChange}
                data-testid="document-file-input"
              />

              {!selectedFile ? (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-blue-500 dark:hover:border-blue-500 rounded-lg p-6 text-center cursor-pointer transition-colors bg-zinc-50/50 dark:bg-zinc-850/50"
                  data-testid="file-dropzone"
                >
                  <Upload className="h-8 w-8 mx-auto text-zinc-400 mb-2" />
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    Click to select a document file
                  </p>
                  <p className="text-xs text-zinc-500 mt-1">
                    PDF, Word, Excel, images, or text documents up to 50 MB
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-850">
                  <div className="flex items-center gap-3 truncate">
                    <FileText className="h-6 w-6 text-blue-600 shrink-0" />
                    <div className="truncate">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {selectedFile.name}
                      </p>
                      <p className="text-xs text-zinc-500">
                        {formatFileSize(selectedFile.size)} • {selectedFile.type || 'binary'}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedFile(null);
                      setFileName('');
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="h-8 w-8 p-0 text-zinc-400 hover:text-zinc-600"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}

              {/* 50 MB Limit Guard Error */}
              {sizeError && (
                <div
                  className="flex items-start gap-2 p-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900"
                  data-testid="file-size-error-banner"
                >
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{sizeError}</span>
                </div>
              )}
            </div>
          ) : (
            /* External URL Input */
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                External URL <span className="text-rose-500">*</span>
              </label>
              <Input
                type="url"
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https://sec.gov.ph/verification/doc-12345"
                required
                data-testid="external-url-input"
              />
            </div>
          )}

          {/* Document / File Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Document Display Name <span className="text-rose-500">*</span>
            </label>
            <Input
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="e.g. 2026 Amended Articles of Incorporation.pdf"
              required
              data-testid="document-name-input"
            />
          </div>

          {/* Category & Document Type */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Category <span className="text-rose-500">*</span>
              </label>
              <Select
                value={category}
                onValueChange={(val) => setCategory(val as DocumentCategory)}
              >
                <SelectTrigger data-testid="upload-category-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOCUMENT_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {CATEGORY_LABELS[cat] || cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                Document Type
              </label>
              <Input
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                placeholder="e.g. Tax Return, Board Resolution"
                data-testid="document-type-input"
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Description (Optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Notes, compliance references, or custody notes..."
              rows={2}
              className="w-full text-sm rounded-md border border-zinc-200 dark:border-zinc-800 bg-transparent p-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
              data-testid="document-description-input"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={uploadMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitDisabled}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              data-testid="upload-submit-button"
            >
              {uploadMutation.isPending ? 'Uploading...' : 'Confirm Upload'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
