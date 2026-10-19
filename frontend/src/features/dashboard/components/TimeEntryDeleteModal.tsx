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
      <DialogContent className="sm:max-w-[420px] rounded-none border-2 border-[#0A0A0A] bg-[#FAF9F5] shadow-[4px_4px_0px_#0A0A0A] p-6" data-testid="time-entry-delete-modal">
        <DialogHeader className="border-b border-[#0A0A0A] pb-3">
          <div className="flex items-center gap-2 text-[#E61919] pb-1">
            <AlertTriangle className="h-5 w-5" />
            <DialogTitle className="text-base font-extrabold uppercase tracking-tight text-[#0A0A0A]">
              Delete Time Entry
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs font-mono text-[#4A4945]">
            Are you sure you want to remove this time entry? This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="p-3 bg-[#EAE8E3] rounded-none border border-[#0A0A0A] text-xs font-mono space-y-1.5">
          <div className="flex justify-between">
            <span className="text-[#4A4945]">Task:</span>
            <span className="font-semibold text-[#0A0A0A] line-clamp-1">{taskTitle || entry.taskId}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#4A4945]">Date:</span>
            <span className="font-mono text-[#0A0A0A] tabular-nums">{entry.entryDate}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[#4A4945]">Duration:</span>
            <span className="font-mono font-bold text-[#0A0A0A] tabular-nums">{entry.durationMinutes} mins ({Math.floor(entry.durationMinutes / 60)}h {entry.durationMinutes % 60}m)</span>
          </div>
          {entry.note && (
            <div className="pt-1 border-t border-[#C8C5BC]">
              <span className="text-[#4A4945] block text-xs">Note:</span>
              <p className="text-[#0A0A0A] italic text-xs mt-0.5 line-clamp-2">{entry.note}</p>
            </div>
          )}
        </div>

        <DialogFooter className="pt-2 border-t border-[#0A0A0A] flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="text-xs font-mono uppercase tracking-wider rounded-none border border-[#0A0A0A] bg-[#FAF9F5] hover:bg-[#EAE8E3] text-[#0A0A0A]"
            data-testid="delete-cancel-btn"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            className="text-xs font-mono uppercase tracking-wider font-bold gap-1.5 rounded-none bg-[#E61919] hover:bg-[#0A0A0A] text-[#FAF9F5]"
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
