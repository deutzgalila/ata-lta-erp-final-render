import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { runBlockingAction } from './BlockingActionModal';
import { useWorkRequestMutations } from '../api/useWorkRequests';
import { operationsKeys } from '../api/queryKeys';
import { useSessionStore } from '@/lib/session';
import type { WorkRequest } from '../api/types';

export type ArchiveActionType = 'archive' | 'cancel' | 'restore';

export interface ArchiveConfirmModalProps {
  isOpen: boolean;
  actionType: ArchiveActionType;
  workRequest: WorkRequest | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ArchiveConfirmModal({
  isOpen,
  actionType,
  workRequest,
  onClose,
  onSuccess,
}: ArchiveConfirmModalProps) {
  const [cancelReason, setCancelReason] = useState('');
  const { archiveWorkRequest, restoreWorkRequest, cancelWorkRequest } =
    useWorkRequestMutations();
  const activeEntity = useSessionStore((state) => state.activeEntity);

  if (!workRequest) return null;

  const titleText =
    actionType === 'archive'
      ? 'Archive Work Request'
      : actionType === 'cancel'
        ? 'Cancel Work Request'
        : 'Restore Work Request';

  const confirmBtnText =
    actionType === 'archive'
      ? 'Archive Work Request'
      : actionType === 'cancel'
        ? 'Cancel Work Request'
        : 'Restore Work Request';

  const confirmBtnVariant =
    actionType === 'restore' ? 'default' : 'destructive';

  const handleConfirm = async () => {
    const id = workRequest.id;

    await runBlockingAction({
      title:
        actionType === 'archive'
          ? 'Archiving Work Request'
          : actionType === 'cancel'
            ? 'Cancelling Work Request'
            : 'Restoring Work Request',
      message: `Please wait while "${workRequest.title}" is being processed...`,
      apiCall: async () => {
        const payload = { id, entity: workRequest.entity };
        if (actionType === 'archive') {
          return await archiveWorkRequest(payload);
        } else if (actionType === 'restore') {
          return await restoreWorkRequest(payload);
        } else {
          return await cancelWorkRequest(payload);
        }
      },
      successTitle:
        actionType === 'archive'
          ? 'Work Request Archived'
          : actionType === 'cancel'
            ? 'Work Request Cancelled'
            : 'Work Request Restored',
      successMessage: `"${workRequest.title}" has been successfully updated.`,
      invalidateQueries: [
        operationsKeys.workRequests(),
        operationsKeys.workRequestCounts(activeEntity),
        operationsKeys.workRequestDetail(id),
        operationsKeys.tasks(id),
      ],
      onSuccess: () => {
        if (onSuccess) onSuccess();
        onClose();
      },
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-md p-6 space-y-4 rounded-none border-2 border-[#0A0A0A] bg-[#FAF9F5] shadow-[4px_4px_0px_#0A0A0A]"
        data-testid="archive-confirm-modal"
      >
        <DialogHeader className="border-b border-[#0A0A0A] pb-3">
          <DialogTitle className="text-base font-extrabold uppercase tracking-tight text-[#0A0A0A]">
            {titleText}
          </DialogTitle>
          <DialogDescription className="text-xs font-mono text-[#4A4945] pt-1">
            {actionType === 'archive' &&
              `Are you sure you want to archive "${workRequest.title}"? It will be moved to the archive tab and hidden from active work queues.`}
            {actionType === 'cancel' &&
              `Are you sure you want to cancel "${workRequest.title}"? Any incomplete tasks will be cancelled.`}
            {actionType === 'restore' &&
              `Are you sure you want to restore "${workRequest.title}"? It will return to active operations tracking.`}
          </DialogDescription>
        </DialogHeader>

        {/* Cancellation Reason input */}
        {actionType === 'cancel' && (
          <div className="space-y-1">
            <label className="text-xs font-mono uppercase tracking-wider font-bold text-[#0A0A0A]">
              Reason for Cancellation (optional):
            </label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Scope revised by client, duplicated request..."
              rows={2}
              className="w-full text-xs font-mono p-2 border border-[#0A0A0A] rounded-none bg-[#FAF9F5] text-[#0A0A0A] focus:outline-none focus:ring-1 focus:ring-[#0A0A0A]"
              data-testid="cancel-reason-input"
            />
          </div>
        )}

        <DialogFooter className="flex items-center justify-end gap-2 pt-2 border-t border-[#0A0A0A]">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="text-xs font-mono uppercase tracking-wider rounded-none border border-[#0A0A0A] bg-[#FAF9F5] hover:bg-[#EAE8E3] text-[#0A0A0A]"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={confirmBtnVariant}
            size="sm"
            onClick={handleConfirm}
            data-testid="archive-confirm-btn"
            className={`text-xs font-mono uppercase tracking-wider font-bold rounded-none ${
              actionType === 'restore'
                ? 'bg-[#0A0A0A] text-[#FAF9F5] hover:bg-[#E61919]'
                : 'bg-[#E61919] text-[#FAF9F5] hover:bg-[#0A0A0A]'
            }`}
          >
            {confirmBtnText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
