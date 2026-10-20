import { DisbursementEditModal } from './DisbursementEditModal';
import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  FileText,
  Building,
  Calendar,
  DollarSign,
  Receipt,
  AlertCircle,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Send,
  XCircle,
  Printer,
  Pencil,
  RefreshCw,
} from 'lucide-react';
import {
  useDisbursementDetail,
  useSubmitDisbursement,
  useRejectDisbursement,
  useFundDisbursement,
  useDisbursementReceiptUrl,
} from '../api/useDisbursements';
import { DisbursementStatusBadge } from './DisbursementStatusBadge';
import { ReleaseFundsModal } from './FundsReleaseActions';
import { RejectReasonModal } from '@/features/operations/components/RejectReasonModal';
import { DisbursementPrintModal } from './DisbursementPrintModal';
import { AdminApprovalModal } from './AdminApprovalModal';
import { EditPaymentDetailsModal } from './EditPaymentDetailsModal';
import { useSessionStore } from '@/lib/session';
import { hasPermission } from '@/lib/permissions';
import { isUserAdmin } from '@/features/operations/lib/taskScope';
import { disbursementKeys } from '../api/queryKeys';
import { PresenceAvatars } from '@/components/common/PresenceAvatars';
import {
  ConflictResolutionModal,
  isConcurrencyConflictError,
} from '@/components/common/ConflictResolutionModal';
import { useBlockingModalStore } from '@/features/operations/components/BlockingActionModal';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import type { ApiError } from '@/lib/api';
import type { Disbursement } from '../api/types';

export interface DisbursementDetailDrawerProps {
  id?: string | null;
  initialDisbursement?: Disbursement | null;
  isOpen: boolean;
  onClose: () => void;
}

export function DisbursementDetailDrawer({
  id,
  initialDisbursement,
  isOpen,
  onClose,
}: DisbursementDetailDrawerProps) {
  const queryClient = useQueryClient();
  const user = useSessionStore((state) => state.user);
  const permissions = useSessionStore((state) => state.permissions);
  const isAdmin = isUserAdmin(user);
  const canApprove = hasPermission(permissions, 'disbursement:approve') || isAdmin;
  const canRelease = hasPermission(permissions, 'disbursement:mark_released');

  const effectiveId = id || initialDisbursement?.id;
  const { data: fetchedItem, isLoading: isFetching } = useDisbursementDetail(effectiveId ?? undefined, {
    enabled: isOpen && Boolean(effectiveId) && !initialDisbursement,
  });
  const item = fetchedItem || initialDisbursement;
  const isLoading = !item && isFetching;
  const voucher = item;

  const { submitWithBlocking } = useSubmitDisbursement();
  const { rejectDisbursement } = useRejectDisbursement();
  const { fundWithBlocking } = useFundDisbursement();

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isInlineEditing, setIsInlineEditing] = useState(false);
  const [isReleaseModalOpen, setIsReleaseModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false);
  const [isEditPaymentModalOpen, setIsEditPaymentModalOpen] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [conflictModalState, setConflictModalState] = useState<{
    isOpen: boolean;
    error?: unknown;
    attemptedStatus?: string | null;
  }>({ isOpen: false });

  const {
    data: receiptData,
    isLoading: isLoadingReceipt,
    isError: isReceiptError,
    error: receiptError,
    refetch: refetchReceiptUrl,
    isFetching: isFetchingReceipt,
  } = useDisbursementReceiptUrl(
    item?.id,
    {
      enabled:
        isOpen &&
        Boolean(item?.id) &&
        Boolean(
          item?.receipt_filename ||
          item?.receiptFilename ||
          item?.receipt_s3_key ||
          item?.receiptS3Key
        ),
    }
  );

  useEffect(() => {
    setImageLoadError(false);
  }, [receiptData?.url]);

  useEffect(() => { setIsEditModalOpen(false); setIsInlineEditing(false); }, [effectiveId, isOpen]);
  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!item) return;
    try {
      await submitWithBlocking(item.id);
    } catch (err: unknown) {
      if (isConcurrencyConflictError(err)) {
        useBlockingModalStore.getState().close();
        setConflictModalState({
          isOpen: true,
          error: err,
          attemptedStatus: 'Pending',
        });
        return;
      }
      // Handled via BlockingActionModal
    }
  };

  const handleFund = async () => {
    if (!item) return;
    try {
      await fundWithBlocking(item.id, item.version);
    } catch (err: unknown) {
      if (isConcurrencyConflictError(err)) {
        useBlockingModalStore.getState().close();
        setConflictModalState({
          isOpen: true,
          error: err,
          attemptedStatus: 'Funded',
        });
        return;
      }
      // Handled via BlockingActionModal
    }
  };

  const disbNumber =
    item?.disbursement_number || item?.disbursementNumber || (item ? `DISB-${item.id.slice(0, 8)}` : '');
  const clientName =
    item?.client_name || item?.clientName || item?.clients?.name || 'Firm Internal';
  const workRequestId = item?.linked_work_request_id || item?.linkedWorkRequestId;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] space-y-5 border-[#0A0A0A] overflow-y-auto border-2 p-6 shadow-[4px_4px_0px_#0A0A0A] rounded-none max-w-2xl bg-[#FAF9F5]"
        data-testid="disbursement-detail-drawer"
      >
        <DialogHeader className="border-b border-[#C8C5BC] pb-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <DialogTitle className="font-mono text-base font-bold text-[#0A0A0A]">
                  {disbNumber || 'Disbursement Details'}
                </DialogTitle>
                {item && <DisbursementStatusBadge status={item.status} />}
                {item?.entity_code && (
                  <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-none bg-[#EAE8E3] text-[#4A4945]">
                    {item.entity_code}
                  </span>
                )}
                {id && (
                  <PresenceAvatars domain="disbursement" roomId={id} maxAvatars={4} />
                )}
              </div>
              <DialogDescription className="text-xs text-[#4A4945]">
                Created on{' '}
                {item?.created_at || item?.createdAt
                  ? new Date(item.created_at || item.createdAt || '').toLocaleString()
                  : 'N/A'}
              </DialogDescription>
            </div>
            {item && (
              <div className="text-right">
                <span className="text-lg font-bold text-[#0A0A0A] block" data-testid="drawer-amount">
                  ₱{item.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
                </span>
                <span className="text-xs text-[#0A0A0A] font-medium">
                  {item.fund_source || item.fundSource}
                </span>
              </div>
            )}
          </div>
        </DialogHeader>

        {isLoading || !item ? (
          <div className="py-12 text-center text-xs text-[#4A4945]" data-testid="drawer-loading">
            Loading disbursement details...
          </div>
        ) : (
          <div className="space-y-5 text-xs text-[#0A0A0A]">
            {user?.role === 'Admin' && <div className="space-y-3">
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsEditModalOpen(true)} data-testid="edit-disbursement-button"><Pencil className="w-4 h-4" />Edit Voucher</Button>
                <Button variant="outline" size="sm" onClick={() => setIsInlineEditing(!isInlineEditing)}>{isInlineEditing ? 'Close inline editor' : 'Edit inline'}</Button>
              </div>
              {isInlineEditing && <DisbursementEditModal inline isOpen disbursement={item} onClose={() => setIsInlineEditing(false)} />}
            </div>}
            {/* Rejection Alert Banner */}
            {item.status === 'Rejected' && (
              <div
                className="p-3 bg-rose-50 border border-rose-200 rounded-none text-rose-900 space-y-1"
                data-testid="drawer-rejection-banner"
              >
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                  Voucher Rejected
                </div>
                <p className="text-xs text-rose-800 whitespace-pre-wrap pl-5" data-testid="drawer-rejection-reason">
                  {item.rejection_reason || item.rejectionReason || 'No reason specified.'}
                </p>
                {(item.rejected_by_name || item.rejected_by || item.rejectedBy || item.rejected_at || item.rejectedAt) && (
                  <div className="text-xs font-mono text-rose-600 pl-5">
                    By {item.rejected_by_name || item.rejected_by || item.rejectedBy || 'Admin'} on{' '}
                    {item.rejected_at || item.rejectedAt
                      ? new Date(item.rejected_at || item.rejectedAt || '').toLocaleString()
                      : 'N/A'}
                  </div>
                )}
              </div>
            )}

            {/* Modified by Accounting Alert Banner */}
            {(item.edited_by_accounting || item.notes?.includes('Edited by Accounting')) && (
              <div
                className="p-3 bg-amber-50 border border-amber-200 rounded-none flex items-center gap-2 text-xs text-amber-900"
                data-testid="modified-by-accounting-banner"
              >
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                <div>
                  <span className="font-semibold block">Modified by Accounting:</span>
                  <span>Financial amounts or details were adjusted during voucher preparation.</span>
                </div>
              </div>
            )}

            {/* General Information Grid */}
            <div className="grid grid-cols-2 gap-4 p-3 bg-[#EAE8E3] rounded-none border border-[#C8C5BC]">
              <div className="space-y-1">
                <span className="text-[#4A4945] block text-xs font-mono">Category</span>
                <span className="font-semibold text-[#0A0A0A]">{item.category}</span>
              </div>
              <div className="space-y-1">
                <span className="text-[#4A4945] block text-xs font-mono">Client Association</span>
                <span className="font-semibold text-[#0A0A0A] flex items-center gap-1">
                  <Building className="h-3 w-3 text-[#4A4945]" />
                  {clientName}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-[#4A4945] block text-xs font-mono">Linked Work Request</span>
                <span className="font-mono text-[#0A0A0A] flex items-center gap-1" data-testid="drawer-work-request">
                  <FileText className="h-3 w-3 text-[#4A4945]" />
                  {item.linked_work_request_order_number && item.linked_work_request_name
                    ? `${item.linked_work_request_order_number} — ${item.linked_work_request_name}`
                    : item.linked_work_request_name ||
                      item.linked_work_request_order_number ||
                      (workRequestId ? 'Work Request Linked' : 'None')}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-[#4A4945] block text-xs font-mono">Due Date</span>
                <span className="text-[#0A0A0A] flex items-center gap-1">
                  <Calendar className="h-3 w-3 text-[#4A4945]" />
                  {item.due_date || item.dueDate || 'No due date'}
                </span>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1">
              <h4 className="font-semibold text-[#0A0A0A] text-xs">Expense Description</h4>
              <p className="text-xs text-[#0A0A0A] bg-white p-3 rounded-none border border-[#0A0A0A] whitespace-pre-wrap">
                {item.description}
              </p>
            </div>

            {/* Notes */}
            {(item.notes) && (
              <div className="space-y-1">
                <h4 className="font-semibold text-[#0A0A0A] text-xs">Internal Notes</h4>
                <p className="text-xs text-[#4A4945] bg-white p-3 rounded-none border border-[#0A0A0A] whitespace-pre-wrap">
                  {item.notes}
                </p>
              </div>
            )}

            {/* Receipt Attachment */}
            {(item.receipt_filename || item.receiptFilename || item.receipt_s3_key || item.receiptS3Key) && (
              <div className="p-3 bg-[#EAE8E3]/60 border border-[#0A0A0A]/80 rounded-none space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-[#0A0A0A]" />
                    <div>
                      <span className="font-medium text-blue-900 block text-xs">
                        {item.receipt_filename || item.receiptFilename || 'Supporting Document'}
                      </span>
                      {(item.receipt_s3_key || item.receiptS3Key) && (
                        <span className="font-mono text-xs font-mono text-[#0A0A0A] block">
                          {item.receipt_s3_key || item.receiptS3Key}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Receipt Action / Status */}
                  {isReceiptError ? (
                    <div className="flex items-center gap-2" data-testid="receipt-error-state">
                      <span className="text-xs font-mono text-rose-600 font-medium flex items-center gap-1">
                        <AlertCircle className="h-3.5 w-3.5 text-rose-500" />
                        {(receiptError as Error)?.message || 'Preview unavailable'}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setImageLoadError(false);
                          void refetchReceiptUrl();
                        }}
                        className="text-xs font-mono h-6 px-2 text-rose-700 border-rose-200 hover:bg-rose-50 cursor-pointer"
                        data-testid="btn-retry-receipt"
                      >
                        <RefreshCw className={cn('h-3 w-3 mr-1', isFetchingReceipt && 'animate-spin')} />
                        Retry
                      </Button>
                    </div>
                  ) : receiptData?.status === 'unavailable' ? (
                    <span
                      className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200"
                      data-testid="receipt-legacy-unavailable"
                    >
                      Supporting document unavailable (legacy record)
                    </span>
                  ) : receiptData?.url ? (
                    <div className="flex items-center gap-1.5">
                      <a
                        href={receiptData.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-mono font-medium px-2.5 py-1 rounded bg-[#0A0A0A] hover:bg-[#262626] text-white cursor-pointer"
                        data-testid="btn-preview-receipt"
                      >
                        <FileText className="h-3 w-3" />
                        View / Download
                      </a>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setImageLoadError(false);
                          void refetchReceiptUrl();
                        }}
                        className="text-xs font-mono h-6 px-2 text-[#0A0A0A] border-[#0A0A0A] hover:bg-[#EAE8E3] cursor-pointer"
                        title="Refresh signed URL (valid for 5 minutes)"
                        data-testid="btn-refresh-receipt"
                      >
                        <RefreshCw className={cn('h-3 w-3 mr-1', isFetchingReceipt && 'animate-spin')} />
                        Refresh Link
                      </Button>
                    </div>
                  ) : isLoadingReceipt || isFetchingReceipt ? (
                    <span className="text-xs font-mono text-[#4A4945] flex items-center gap-1">
                      <RefreshCw className="h-3 w-3 animate-spin text-blue-500" />
                      Loading document link...
                    </span>
                  ) : null}
                </div>

                {/* Inline image preview if available */}
                {receiptData?.url && receiptData.contentType?.startsWith('image/') && (
                  <div className="pt-2 border-t border-blue-100">
                    {imageLoadError ? (
                      <div
                        className="p-3 bg-amber-50/80 border border-amber-200 rounded-none text-center space-y-1.5"
                        data-testid="receipt-image-error"
                      >
                        <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-amber-800">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                          <span>Image preview failed to load or signed link expired</span>
                        </div>
                        <p className="text-xs font-mono text-amber-700">
                          Signed receipt URLs expire after 5 minutes. Refresh to obtain a new signed preview.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setImageLoadError(false);
                            void refetchReceiptUrl();
                          }}
                          className="text-xs font-mono h-6 px-2 border-amber-300 text-amber-800 hover:bg-amber-100 cursor-pointer"
                          data-testid="btn-retry-image-preview"
                        >
                          <RefreshCw className={cn('h-3 w-3 mr-1', isFetchingReceipt && 'animate-spin')} />
                          Refresh Image Preview
                        </Button>
                      </div>
                    ) : (
                      <img
                        src={receiptData.url}
                        alt={item.receipt_filename || item.receiptFilename || 'Receipt Preview'}
                        className="max-h-48 rounded border border-[#0A0A0A] object-contain mx-auto"
                        onError={() => setImageLoadError(true)}
                        data-testid="receipt-preview-image"
                      />
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Payment & Settlement Details */}
            {(item.status === 'Released' || item.status === 'Funded' || item.payment_method || item.paymentMethod) && (
              <div className="p-3 bg-purple-50/50 border border-purple-200/70 rounded-none space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-purple-900 text-xs flex items-center gap-1.5">
                    <DollarSign className="h-3.5 w-3.5 text-purple-600" />
                    Payment Release Information
                  </h4>
                  {(item.status === 'Released' || item.status === 'Funded') && (canRelease || isAdmin) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditPaymentModalOpen(true)}
                      className="text-xs font-mono h-6 px-2 text-purple-700 border-purple-200 hover:bg-purple-100 cursor-pointer"
                      data-testid="btn-edit-payment-details"
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      Edit Payment Details
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                  <div>
                    <span className="text-[#4A4945]">Method: </span>
                    <span className="font-medium text-[#0A0A0A]" data-testid="detail-payment-method">
                      {item.payment_method || item.paymentMethod || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#4A4945]">Reference: </span>
                    <span className="font-medium text-[#0A0A0A]" data-testid="detail-payment-reference">
                      {item.payment_reference || item.paymentReference || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#4A4945]">Bank: </span>
                    <span className="font-medium text-[#0A0A0A]" data-testid="detail-payment-bank">
                      {item.payment_bank || item.paymentBank || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[#4A4945]">Payment Date: </span>
                    <span className="font-medium text-[#0A0A0A]" data-testid="detail-payment-date">
                      {item.payment_date || item.paymentDate || 'N/A'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Lifecycle Audit Trail */}
            <div className="space-y-2 border-t border-[#C8C5BC] pt-3">
              <h4 className="font-semibold text-[#0A0A0A] text-xs flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-[#4A4945]" />
                Lifecycle Audit Timeline
              </h4>
              <div className="space-y-1.5 text-xs font-mono text-[#4A4945] pl-2">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-none bg-slate-400 shrink-0" />
                  <span>
                    Created by{' '}
                    <span className="font-medium text-[#0A0A0A]">
                      {item.created_by_name ||
                        item.createdByName ||
                        item.requested_by_name ||
                        item.requestedByName ||
                        item.employee_name ||
                        item.employeeName ||
                        item.requested_by ||
                        item.requestedBy ||
                        item.created_by ||
                        item.createdBy ||
                        'User'}
                    </span>{' '}
                    on {new Date(item.created_at || item.createdAt || '').toLocaleString()}
                  </span>
                </div>
                {(item.approved_at || item.approvedAt) && (
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-none bg-[#EAE8E3]0 shrink-0" />
                    <span>
                      Approved by{' '}
                      <span className="font-medium text-[#0A0A0A]">
                        {item.approved_by_name ||
                          item.approvedByName ||
                          item.approved_by ||
                          item.approvedBy ||
                          'Admin'}
                      </span>{' '}
                      on {new Date(item.approved_at || item.approvedAt || '').toLocaleString()}
                    </span>
                  </div>
                )}
                {(item.released_at || item.releasedAt) && (
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-none bg-purple-500 shrink-0" />
                    <span>
                      Released by{' '}
                      <span className="font-medium text-[#0A0A0A]">
                        {item.released_by_name ||
                          item.releasedByName ||
                          item.released_by ||
                          item.releasedBy ||
                          'Accounting'}
                      </span>{' '}
                      on {new Date(item.released_at || item.releasedAt || '').toLocaleString()}
                    </span>
                  </div>
                )}
                {(item.funded_at || item.fundedAt) && (
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-none bg-emerald-500 shrink-0" />
                    <span>
                      Funded and reconciled on{' '}
                      {new Date(item.funded_at || item.fundedAt || '').toLocaleString()}
                    </span>
                  </div>
                )}
                {(item.status === 'Rejected' || item.rejected_at || item.rejectedAt) && (
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-none bg-rose-500 shrink-0" />
                    <span>
                      Rejected by{' '}
                      <span className="font-medium text-[#0A0A0A]">
                        {item.rejected_by_name ||
                          item.rejectedByName ||
                          item.rejected_by ||
                          item.rejectedBy ||
                          'Admin'}
                      </span>{' '}
                      {item.rejected_at || item.rejectedAt
                        ? `on ${new Date(item.rejected_at || item.rejectedAt || '').toLocaleString()}`
                        : ''}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Contextual Action Bar */}
            <div className="flex items-center justify-end gap-2 border-t border-[#C8C5BC] pt-3">
              {/* Draft -> Direct Approve (Admin) vs Submit for Approval (Non-Admin) */}
              {item.status === 'Draft' && (
                isAdmin ? (
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={() => setIsApprovalModalOpen(true)}
                    className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                    data-testid="drawer-direct-approve-btn"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                    Direct Approve
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={handleSubmit}
                    className="text-xs bg-[#0A0A0A] hover:bg-[#262626] text-white font-medium"
                    data-testid="drawer-submit-btn"
                  >
                    <Send className="h-3.5 w-3.5 mr-1" />
                    Submit for Approval
                  </Button>
                )
              )}

              {/* Pending / Pending Admin Approval / Submitted -> Approve / Reject */}
              {(item.status === 'Pending' || item.status === 'Pending Admin Approval' || item.status === 'Submitted') && canApprove && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsRejectModalOpen(true)}
                    className="text-xs text-rose-600 border-rose-200 hover:bg-rose-50"
                    data-testid="drawer-reject-btn"
                  >
                    <XCircle className="h-3.5 w-3.5 mr-1 text-rose-600" />
                    Reject
                  </Button>
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={() => setIsApprovalModalOpen(true)}
                    className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                    data-testid="drawer-approve-btn"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                    Approve Voucher
                  </Button>
                </>
              )}

              {/* Approved -> Release */}
              {item.status === 'Approved' && canRelease && (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => setIsReleaseModalOpen(true)}
                  className="text-xs bg-purple-600 hover:bg-purple-700 text-white font-medium"
                  data-testid="drawer-release-btn"
                >
                  <DollarSign className="h-3.5 w-3.5 mr-1" />
                  Release Funds
                </Button>
              )}

              {/* Released -> Fund */}
              {item.status === 'Released' && canRelease && (
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={handleFund}
                  className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                  data-testid="drawer-fund-btn"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  Mark as Funded
                </Button>
              )}

              {/* Print Voucher Action */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsPrintModalOpen(true)}
                className="text-xs font-medium border-[#0A0A0A]"
                data-testid="drawer-print-btn"
              >
                <Printer className="h-3.5 w-3.5 mr-1 text-[#4A4945]" />
                Print Voucher
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-xs ml-auto"
              >
                Close
              </Button>
            </div>
          </div>
        )}

        {item && user?.role === 'Admin' && isEditModalOpen && <DisbursementEditModal isOpen disbursement={item} onClose={() => setIsEditModalOpen(false)} />}
        {/* Print Modal */}
        {item && (
          <DisbursementPrintModal
            isOpen={isPrintModalOpen}
            disbursement={item}
            onClose={() => setIsPrintModalOpen(false)}
          />
        )}

        {/* Release Modal */}
        {item && (
          <ReleaseFundsModal
            isOpen={isReleaseModalOpen}
            disbursement={item}
            onClose={() => setIsReleaseModalOpen(false)}
          />
        )}

        {/* Reject Modal */}
        {item && (
          <RejectReasonModal
            isOpen={isRejectModalOpen}
            requestId={item.id}
            title="Reject Disbursement Voucher"
            description={`Provide a justification for rejecting voucher ${disbNumber} (1–500 characters).`}
            placeholder="e.g. Ineligible reimbursement item..."
            submitLabel="Reject Voucher"
            maxLength={500}
            onReject={async (reqId, reason) => {
              try {
                await rejectDisbursement({ id: reqId, reason, expectedVersion: item.version });
              } catch (err: unknown) {
                if (isConcurrencyConflictError(err)) {
                  useBlockingModalStore.getState().close();
                  setIsRejectModalOpen(false);
                  setConflictModalState({
                    isOpen: true,
                    error: err,
                    attemptedStatus: 'Rejected',
                  });
                  return;
                }
                throw err;
              }
            }}
            invalidateQueries={[disbursementKeys.all]}
            onClose={() => setIsRejectModalOpen(false)}
            onSuccess={() => setIsRejectModalOpen(false)}
          />
        )}

        {/* Conflict Resolution Modal */}
        <ConflictResolutionModal
          isOpen={conflictModalState.isOpen}
          onClose={() => setConflictModalState({ isOpen: false })}
          error={conflictModalState.error as ApiError | Error | null}
          entityTitle={voucher?.disbursement_number || id || undefined}
          entityType="Disbursement"
          expectedVersion={voucher?.version}
          attemptedStatus={conflictModalState.attemptedStatus ?? undefined}
          currentStatus={voucher?.status}
          onRefreshAndKeepLatest={async () => {
            if (id) {
              await queryClient.invalidateQueries({ queryKey: disbursementKeys.detail(id) });
            }
            await queryClient.invalidateQueries({ queryKey: disbursementKeys.lists() });
          }}
        />

        {/* Admin Direct Approval Modal */}
        {item && isApprovalModalOpen && (
          <AdminApprovalModal
            isOpen={isApprovalModalOpen}
            disbursement={item}
            onClose={() => setIsApprovalModalOpen(false)}
            onSuccess={() => setIsApprovalModalOpen(false)}
            onConflict={(err) => {
              setIsApprovalModalOpen(false);
              setConflictModalState({
                isOpen: true,
                error: err,
                attemptedStatus: 'Approved',
              });
            }}
          />
        )}

        {/* Payment Details Correction Modal */}
        {item && isEditPaymentModalOpen && (
          <EditPaymentDetailsModal
            isOpen={isEditPaymentModalOpen}
            disbursement={item}
            onClose={() => setIsEditPaymentModalOpen(false)}
            onSuccess={() => setIsEditPaymentModalOpen(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
