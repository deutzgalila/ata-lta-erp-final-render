import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Trash2, AlertTriangle } from 'lucide-react';
import { useDeleteTimeEntry } from '../api/useTimeEntries';
import { useBlockingModal } from '@/features/operations/components/BlockingActionModal';
import { ApiError } from '@/lib/api';
import type { TimeEntry } from '../api/types';

interface TimeEntryDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry: TimeEntry | null;
  taskTitle?: string;
}

export function TimeEntryDeleteModal({
  isOpen,
  onClose,
  entry,
  taskTitle,
}: TimeEntryDeleteModalProps) {
  const deleteMutation = useDeleteTimeEntry();
  const { openLoading, openSuccess, openError } = useBlockingModal();

  if (!entry) return null;

  const handleDelete = async () => {
    openLoading({
      title: 'Deleting Time Entry',
      message: 'Removing time log entry from staging database...',
      actionName: 'delete-time-entry',
    });

    try {
      await deleteMutation.mutateAsync(entry.id);

      openSuccess({
        title: 'Time Entry Deleted',
        message: 'The selected time log entry has been removed.',
      });

      onClose();
    } catch (err) {
      console.error('[TimeEntryDeleteModal] Delete failed:', err);
      if (err instanceof ApiError) {
        openError({
          code: err.code || 'TIME_DELETE_FAILED',
          detail: err.detail || err.message,
          status: err.status,
          title: 'Deletion Error',
          onRetry: handleDelete,
        });
      } else {
        openError({
          detail: err instanceof Error ? err.message : 'Failed to delete time entry',
          title: 'Unexpected Error',
        });
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[420px] rounded-[12px] border-[#CBD5E1] bg-[#FFFFFF] shadow-float p-6" data-testid="time-entry-delete-modal">
        <DialogHeader className="border-b border-[#CBD5E1] pb-3">
          <div className="flex items-center gap-2 text-[#DC2626] pb-1">
            <AlertTriangle className="h-5 w-5" />
            <DialogTitle className="text-base font-extrabold uppercase tracking-tight text-[#0F172A]">
              Delete Time Entry
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs font-mono text-[#475569]">
            Are you sure you want to remove this time entry? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="p-3 bg-[#F1F5F9] rounded-[8px] border-[#CBD5E1] text-xs font-mono space-y-1.5">
          <div className="flex justify-between">
            <span className="text-[#475569]">Task:</span>
            <span className="font-semibold text-[#0F172A] line-clamp-1">{taskTitle || entry.taskId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#475569]">Date:</span>
            <span className="font-mono text-[#0F172A] tabular-nums">{entry.entryDate}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#475569]">Duration:</span>
            <span className="font-mono font-bold text-[#0F172A] tabular-nums">{entry.durationMinutes} mins ({Math.floor(entry.durationMinutes / 60)}h {entry.durationMinutes % 60}m)</span>
          </div>
          {entry.note && (
            <div className="pt-1 border-t border-[#CBD5E1]">
              <span className="text-[#475569] block text-xs">Note:</span>
              <p className="text-[#0F172A] italic text-xs mt-0.5 line-clamp-2">{entry.note}</p>
            </div>
          )}
        </div>

        <DialogFooter className="pt-2 border-t border-[#CBD5E1] flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs font-mono uppercase tracking-wider rounded-[8px] border-[#CBD5E1] bg-[#FFFFFF] hover:bg-[#F1F5F9] text-[#0F172A]"
            data-testid="delete-cancel-btn"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            className="text-xs font-mono uppercase tracking-wider font-bold gap-1.5 rounded-[6px] bg-[#DC2626] hover:bg-[#1D4ED8] text-[#FFFFFF] hover:bg-[#1E40AF] shadow-2xs"
            disabled={deleteMutation.isPending}
            data-testid="delete-confirm-btn"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {deleteMutation.isPending ? 'Deleting...' : 'Delete Entry'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
