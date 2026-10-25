import { useMemo, useState } from 'react';
import { Download, Eye, FileText, RefreshCw, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DocumentViewerModal } from '@/features/documents/components/DocumentViewerModal';
import type { DmsDocument } from '@/features/documents/api/types';
import type { ReceiptUrlData } from '../api/types';
import { receiptDisplayName } from '../lib/receiptDisplayName';

export interface ReceiptViewerProps {
  receiptFileName?: string | null;
  receiptS3Key?: string | null;
  receiptData?: ReceiptUrlData | null;
  isLoadingReceipt?: boolean;
  isFetchingReceipt?: boolean;
  isReceiptError?: boolean;
  receiptError?: unknown;
  onRefetchReceiptUrl: () => void | Promise<unknown>;
  workRequestTitle?: string | null;
}

export function ReceiptViewer({
  receiptFileName,
  receiptS3Key,
  receiptData,
  isLoadingReceipt = false,
  isFetchingReceipt = false,
  isReceiptError = false,
  onRefetchReceiptUrl,
  workRequestTitle,
}: ReceiptViewerProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const hasReceipt = Boolean(receiptFileName || receiptS3Key);
  const fileName = receiptDisplayName(receiptFileName || receiptData?.filename);
  const fileType =
    receiptData?.contentType?.includes('pdf') || /\.pdf$/i.test(fileName)
      ? 'PDF receipt'
      : receiptData?.contentType?.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(fileName)
        ? 'Image receipt'
        : 'Receipt attachment';
  const unavailable = receiptData?.status === 'unavailable';
  const canView = Boolean(receiptData?.url && !isReceiptError && !unavailable);

  // Receipt authorization and URL refresh belong to the voucher endpoint. The
  // empty DMS id prevents unrelated document detail/download requests.
  const documentForModal = useMemo<DmsDocument>(
    () => ({
      id: '',
      file_name: fileName,
      original_name: fileName,
      content_type:
        receiptData?.contentType || (/\.pdf$/i.test(fileName) ? 'application/pdf' : null),
      category: null,
      document_type: null,
      document_lifecycle: 'stored',
      status: 'active',
      archived: false,
      storage_path: null,
      external_url: null,
      uploader_id: '',
      entity_id: '',
      description: null,
      file_size: null,
      work_request_id: null,
      linked_task_id: null,
      client_id: null,
      created_at: '',
      updated_at: '',
      work_request_title: workRequestTitle || null,
      comments: [],
      versions: [],
    }),
    [fileName, receiptData?.contentType, workRequestTitle]
  );

  if (!hasReceipt)
    return (
      <div
        className="p-6 bg-surface rounded-md border border-border text-center space-y-2"
        data-testid="receipt-empty-state"
      >
        <Receipt className="h-6 w-6 text-muted mx-auto" />
        <h3 className="text-sm font-semibold text-ink">No receipt attached</h3>
        <p className="text-xs text-muted">
          This voucher has no attached receipt or supporting document.
        </p>
      </div>
    );

  return (
    <div className="space-y-3" data-testid="receipt-viewer-container">
      <div
        className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface p-3"
        data-testid="receipt-attachment-row"
      >
        <FileText className="h-5 w-5 shrink-0 text-muted" />
        <div className="min-w-0 flex-1 basis-32">
          <p className="break-words text-sm font-medium text-ink" data-testid="receipt-file-name">
            {fileName}
          </p>
          <p className="text-xs text-muted">{fileType}</p>
        </div>
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Receipt attachment actions"
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canView}
            onClick={() => setIsModalOpen(true)}
            className="min-h-10 shrink-0 gap-1.5 whitespace-nowrap text-xs"
            data-testid="btn-preview-receipt"
          >
            <Eye className="h-3.5 w-3.5" /> View
          </Button>
          {canView && (
            <a
              href={receiptData?.url}
              download={fileName}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-border px-3 text-xs font-medium text-ink hover:bg-hover"
              data-testid="btn-download-receipt"
            >
              <Download className="h-3.5 w-3.5" /> Download
            </a>
          )}
        </div>
      </div>
      {(isLoadingReceipt || (isFetchingReceipt && !receiptData?.url)) && (
        <p role="status" className="text-xs text-muted">
          Loading receipt…
        </p>
      )}
      {isReceiptError ? (
        <div
          role="alert"
          className="space-y-2 text-xs text-danger"
          data-testid="receipt-error-state"
        >
          <p>Unable to load this receipt. Please try again.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isFetchingReceipt}
            onClick={() => void onRefetchReceiptUrl()}
            data-testid="btn-retry-receipt"
          >
            Retry Loading Receipt
          </Button>
        </div>
      ) : unavailable ? (
        <p className="text-xs text-muted" data-testid="receipt-legacy-unavailable">
          Supporting document unavailable for this voucher.
        </p>
      ) : canView ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={isFetchingReceipt}
          className="gap-1.5 text-xs text-muted"
          onClick={() => void onRefetchReceiptUrl()}
          data-testid="btn-refresh-receipt"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh receipt
        </Button>
      ) : !isLoadingReceipt && !isFetchingReceipt ? (
        <p className="text-xs text-muted">Receipt preview is unavailable.</p>
      ) : null}
      {isModalOpen && canView && (
        <DocumentViewerModal
          isOpen
          onClose={() => setIsModalOpen(false)}
          document={documentForModal}
          previewUrl={receiptData?.url}
          readOnly
          attachmentOnly
          onRefreshPreview={onRefetchReceiptUrl}
          isRefreshingPreview={isFetchingReceipt}
        />
      )}
    </div>
  );
}
