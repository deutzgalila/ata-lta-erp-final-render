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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, RotateCcw, AlertTriangle } from 'lucide-react';
import { useQaReview } from '../api/useQaReview';
import { runBlockingAction } from './BlockingActionModal';
import { operationsKeys } from '../api/queryKeys';

export interface RerouteModalProps {
  isOpen: boolean;
  onClose: () => void;
  workRequestId: string;
  failedTasks: Array<{ id: string; title: string }>;
  onSuccess?: () => void;
}

export function RerouteModal({
  isOpen,
  onClose,
  workRequestId,
  failedTasks,
  onSuccess,
}: RerouteModalProps) {
  const [toPhase, setToPhase] = useState<'pre_processing' | 'processing'>('processing');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { submitReroute } = useQaReview(workRequestId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed) {
      setError('A non-empty reroute reason is required for audit compliance.');
      return;
    }
    setError(null);

    await runBlockingAction({
      title: 'Rerouting Work Request',
      message: `Rerouting to ${toPhase === 'pre_processing' ? 'Pre-processing' : 'Processing'} and reopening failed tasks...`,
      apiCall: async () => {
        return await submitReroute({
          workRequestId,
          to_phase: toPhase,
          reason: trimmed,
        });
      },
      successTitle: 'Work Request Rerouted',
      successMessage: `Successfully rerouted work request back to ${toPhase.replace('_', ' ')}.`,
      invalidateQueries: [
        operationsKeys.workRequestDetail(workRequestId),
        operationsKeys.tasks(workRequestId),
        operationsKeys.workRequests(),
      ],
      onSuccess: () => {
        setReason('');
        setError(null);
        if (onSuccess) onSuccess();
        onClose();
      },
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md p-6 space-y-4 rounded-none border-2 border-[#0A0A0A] bg-[#FAF9F5] shadow-[4px_4px_0px_#0A0A0A]" data-testid="reroute-modal">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-[#EAE8E3] border border-[#0A0A0A] rounded-none text-[#0A0A0A]">
              <RotateCcw className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-extrabold tracking-tight text-[#0A0A0A]">
                Reroute Work Request
              </DialogTitle>
              <DialogDescription className="text-xs font-mono text-[#4A4945] pt-0.5">
                Return this engagement from QA back to an earlier phase. Only tasks marked as failed will be reopened.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Target Phase Selection */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase tracking-wider text-[#4A4945]">
              Return to Phase *
            </label>
            <Select
              value={toPhase}
              onValueChange={(val) => setToPhase(val as 'pre_processing' | 'processing')}
            >
              <SelectTrigger className="w-full h-9 bg-[#FAF9F5] border border-[#0A0A0A] rounded-none font-mono text-xs text-[#0A0A0A]" data-testid="reroute-to-phase-select">
                <SelectValue placeholder="Select target phase" />
              </SelectTrigger>
              <SelectContent className="rounded-none border border-[#0A0A0A] bg-[#FAF9F5]">
                <SelectItem value="processing" className="text-xs font-mono">
                  Processing (Phase 2)
                </SelectItem>
                <SelectItem value="pre_processing" className="text-xs font-mono">
                  Pre-processing (Phase 1)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Reopened Tasks Summary */}
          <div className="space-y-1.5 bg-[#EAE8E3] border border-[#0A0A0A] rounded-none p-3">
            <div className="flex items-center justify-between text-xs font-mono font-medium text-[#0A0A0A]">
              <span className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-[#0A0A0A]" />
                Tasks to be Reopened ({failedTasks.length})
              </span>
              {failedTasks.length > 0 && (
                <Badge variant="destructive" size="compact" className="rounded-none font-mono text-xs" data-testid="reroute-failed-badge">
                  {failedTasks.length} Failed
                </Badge>
              )}
            </div>

            {failedTasks.length === 0 ? (
              <p className="text-xs font-mono text-[#4A4945] italic pt-1">
                No tasks currently marked failed. (Mark failing tasks with QA controls before rerouting).
              </p>
            ) : (
              <ul className="space-y-1 pt-1 max-h-32 overflow-y-auto" data-testid="reroute-reopened-tasks-list">
                {failedTasks.map((t) => (
                  <li
                    key={t.id}
                    className="text-xs font-mono text-[#0A0A0A] flex items-center justify-between py-1 border-b border-[#C8C5BC] last:border-none"
                  >
                    <span className="truncate pr-2">{t.title}</span>
                    <Badge variant="destructive" size="compact" className="rounded-none font-mono text-xs">
                      Reopen
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Audit Reason Textarea */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase tracking-wider text-[#4A4945] flex items-center justify-between">
              <span>Audit Rationale (Required) *</span>
              <span className="text-xs font-mono text-[#4A4945] normal-case">
                Dispatched to task assignees
              </span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Detail the QA compliance failure or required corrections..."
              rows={3}
              className={`w-full text-xs font-mono p-2.5 border rounded-none bg-[#FAF9F5] text-[#0A0A0A] placeholder:text-[#4A4945] focus:outline-none focus:ring-1 ${
                error
                  ? 'border-[#E61919] focus:ring-[#E61919]'
                  : 'border-[#0A0A0A] focus:ring-[#0A0A0A]'
              }`}
              data-testid="reroute-reason-input"
            />
            {error && (
              <p className="text-xs font-mono text-[#E61919] flex items-center gap-1" data-testid="reroute-reason-error">
                <AlertCircle className="h-3 w-3 shrink-0" />
                <span>{error}</span>
              </p>
            )}
          </div>

          <DialogFooter className="pt-2 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="rounded-none border border-[#0A0A0A] text-[#0A0A0A] hover:bg-[#EAE8E3] font-mono text-xs uppercase tracking-wider"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="rounded-none bg-[#E61919] text-[#FAF9F5] hover:bg-[#0A0A0A] font-mono text-xs uppercase tracking-wider gap-1.5"
              data-testid="confirm-reroute-btn"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Confirm & Reroute
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
