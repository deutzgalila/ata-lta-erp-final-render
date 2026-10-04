import React, { useState } from 'react';
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
import { usePhaseTransitions } from '../api/usePhaseTransitions';
import { operationsKeys } from '../api/queryKeys';
import { useSessionStore } from '@/lib/session';

export interface RejectReasonModalProps {
  isOpen: boolean;
  requestId: string;
  workRequestTitle?: string;
  onClose: () => void;
  onSuccess?: () => void;
}

export function RejectReasonModal({
  isOpen,
  requestId,
  workRequestTitle,
  onClose,
  onSuccess,
}: RejectReasonModalProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { rejectRequest } = usePhaseTransitions();
  const activeEntity = useSessionStore((state) => state.activeEntity);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = reason.trim();

    if (!trimmed || trimmed.length < 1) {
      setError('Rejection reason is required (minimum 1 character)');
      return;
    }
    if (trimmed.length > 2000) {
      setError('Rejection reason cannot exceed 2000 characters');
      return;
    }
    setError(null);

    await runBlockingAction({
      title: 'Rejecting Phase Transition',
      message: 'Please wait while the transition request rejection is processed...',
      apiCall: async () => {
        return await rejectRequest(requestId, trimmed);
      },
      successTitle: 'Transition Request Rejected',
      successMessage: 'The request has been rejected and the submitter notified.',
      invalidateQueries: [
        operationsKeys.requests(),
        operationsKeys.requestCounts(activeEntity),
      ],
      onSuccess: () => {
        setReason('');
        if (onSuccess) onSuccess();
        onClose();
      },
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-md p-6 space-y-4"
        data-testid="reject-reason-modal"
      >
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-slate-900">
            Reject Phase Transition
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-600 pt-1">
            {workRequestTitle
              ? `Provide a specific, actionable reason for rejecting the transition for "${workRequestTitle}".`
              : 'Provide a specific reason for rejecting this transition request.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">
              Rejection Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError(null);
              }}
              rows={4}
              placeholder="e.g. Pre-processing checklist item #3 missing BIR stamp..."
              className={`w-full text-xs p-2.5 border rounded-md bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-red-500 ${
                error ? 'border-red-500' : 'border-slate-200'
              }`}
              data-testid="reject-reason-textarea"
            />
            {error && (
              <span
                className="text-[11px] text-red-600 block"
                data-testid="reject-reason-error"
              >
                {error}
              </span>
            )}
            <div className="text-[10px] text-slate-400 text-right">
              {reason.trim().length} / 2000 characters
            </div>
          </div>

          <DialogFooter className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              data-testid="reject-reason-submit-btn"
              className="text-xs font-semibold"
            >
              Reject Transition
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
