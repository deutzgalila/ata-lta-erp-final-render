import { useState, useEffect } from 'react';
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
import { Clock, Calendar, FileText, CheckCircle2 } from 'lucide-react';
import { useUpdateTimeEntry } from '../api/useTimeEntries';
import { useBlockingModal } from '@/features/operations/components/BlockingActionModal';
import { ApiError } from '@/lib/api';
import type { TimeEntry, AssignableTaskOption } from '../api/types';

interface TimeEntryEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  entry: TimeEntry | null;
  tasks: AssignableTaskOption[];
}

export function TimeEntryEditModal({
  isOpen,
  onClose,
  entry,
  tasks,
}: TimeEntryEditModalProps) {
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [entryDate, setEntryDate] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [taskId, setTaskId] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const updateMutation = useUpdateTimeEntry();
  const { openLoading, openSuccess, openError } = useBlockingModal();

  const todayStr = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (entry) {
      setDurationMinutes(entry.durationMinutes);
      setEntryDate(entry.entryDate);
      setNote(entry.note || '');
      setTaskId(entry.taskId);
      setValidationError(null);
    }
  }, [entry]);

  const handleQuickChip = (minutes: number) => {
    setDurationMinutes((prev) => Math.min(1440, prev + minutes));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entry) return;

    if (!durationMinutes || durationMinutes < 1 || durationMinutes > 1440) {
      setValidationError('Duration must be between 1 and 1440 minutes (24h).');
      return;
    }
    if (!entryDate || entryDate > todayStr) {
      setValidationError('Entry date cannot be in the future.');
      return;
    }
    if (note && note.length > 5000) {
      setValidationError('Note cannot exceed 5000 characters.');
      return;
    }

    setValidationError(null);

    openLoading({
      title: 'Updating Time Entry',
      message: 'Submitting updated duration and note to staging backend...',
      actionName: 'update-time-entry',
    });

    try {
      await updateMutation.mutateAsync({
        id: entry.id,
        input: {
          taskId: taskId !== entry.taskId ? taskId : undefined,
          entryDate,
          durationMinutes,
          note: note.trim() || null,
        },
      });

      openSuccess({
        title: 'Time Entry Updated',
        message: 'Your time log has been successfully updated.',
      });

      onClose();
    } catch (err) {
      console.error('[TimeEntryEditModal] Update failed:', err);
      if (err instanceof ApiError) {
        openError({
          code: err.code || 'TIME_UPDATE_FAILED',
          detail: err.detail || err.message,
          status: err.status,
          title: 'Update Error',
          onRetry: () => handleSubmit(e),
        });
      } else {
        openError({
          detail: err instanceof Error ? err.message : 'Failed to update time entry',
          title: 'Unexpected Error',
        });
      }
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[480px]" data-testid="time-entry-edit-modal">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <Clock className="h-4 w-4 text-blue-600" />
              Edit Time Entry
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Modify the recorded duration, work date, or note for this entry.
            </DialogDescription>
          </DialogHeader>

          {validationError && (
            <div
              className="p-2.5 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 font-medium"
              data-testid="edit-validation-error"
            >
              {validationError}
            </div>
          )}

          {/* Task Selection (Read-only or switchable) */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-slate-500" />
              Task
            </label>
            <select
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              className="w-full text-xs rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none"
              data-testid="edit-task-select"
            >
              {tasks.map((t) => (
                <option key={t.taskId} value={t.taskId}>
                  [{t.entity}] {t.taskTitle} ({t.workRequestTitle})
                </option>
              ))}
              {!tasks.some((t) => t.taskId === taskId) && entry && (
                <option value={entry.taskId}>Task ID: {entry.taskId}</option>
              )}
            </select>
          </div>

          {/* Date Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-slate-500" />
              Work Date
            </label>
            <Input
              type="date"
              max={todayStr}
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="text-xs h-9"
              required
              data-testid="edit-entry-date-input"
            />
          </div>

          {/* Duration Minutes with Quick-Chips */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-slate-500" />
                Duration (minutes)
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                {Math.floor(durationMinutes / 60)}h {durationMinutes % 60}m
              </span>
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={1440}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 0)}
                className="text-xs h-9 w-28 font-mono"
                required
                data-testid="edit-duration-input"
              />
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => handleQuickChip(15)}
                  className="text-xs h-8"
                  data-testid="edit-chip-15"
                >
                  +15m
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => handleQuickChip(30)}
                  className="text-xs h-8"
                  data-testid="edit-chip-30"
                >
                  +30m
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => handleQuickChip(60)}
                  className="text-xs h-8"
                  data-testid="edit-chip-60"
                >
                  +1h
                </Button>
              </div>
            </div>
          </div>

          {/* Note Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-700 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-slate-500" />
                Note (optional)
              </span>
              <span className="text-[10px] text-slate-400">
                {note.length} / 5000
              </span>
            </label>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Describe tasks completed, meetings attended, etc."
              maxLength={5000}
              className="w-full text-xs rounded-md border border-slate-200 bg-white p-2.5 text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none"
              data-testid="edit-note-textarea"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs"
              data-testid="edit-cancel-btn"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="text-xs font-semibold"
              disabled={updateMutation.isPending}
              data-testid="edit-submit-btn"
            >
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
