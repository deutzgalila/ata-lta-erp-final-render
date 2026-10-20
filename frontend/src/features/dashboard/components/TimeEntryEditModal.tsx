import { workDate } from '@/lib/workDate';
import { DateInput } from '@/components/ui/date-input';
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

  const todayStr = workDate();

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

    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) {
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
      message: 'Saving your changes...',
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
      <DialogContent className="sm:max-w-[480px] rounded-none border-2 border-[#0A0A0A] bg-[#FAF9F5] shadow-[4px_4px_0px_#0A0A0A] p-6" data-testid="time-entry-edit-modal">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader className="border-b border-[#0A0A0A] pb-3">
            <DialogTitle className="flex items-center gap-2 text-base font-extrabold uppercase tracking-tight text-[#0A0A0A]">
              <Clock className="h-4 w-4 text-[#E61919]" />
              Edit Time Entry
            </DialogTitle>
            <DialogDescription className="text-xs font-mono text-[#4A4945]">
              Modify the recorded duration, work date, or note for this entry.
            </DialogDescription>
          </DialogHeader>

          {validationError && (
            <div
              className="p-2.5 rounded-none bg-[#E61919]/10 border border-[#E61919] text-xs font-mono text-[#E61919] font-medium"
              data-testid="edit-validation-error"
            >
              {validationError}
            </div>
          )}

          {/* Task Selection (Read-only or switchable) */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase tracking-wider font-bold text-[#0A0A0A] flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-[#4A4945]" />
              Task
            </label>
            <select
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              className="w-full text-xs font-mono rounded-none border border-[#0A0A0A] bg-[#FAF9F5] px-3 py-2 text-[#0A0A0A] shadow-none focus:border-[#0A0A0A] focus:outline-none"
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
            <label className="text-xs font-mono uppercase tracking-wider font-bold text-[#0A0A0A] flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-[#4A4945]" />
              Work Date
            </label>
            <DateInput
              aria-label="Work date"
              type="date"
              max={todayStr}
              value={entryDate}
              onValueChange={(value) => setEntryDate(value)}
              className="text-xs font-mono h-9 rounded-none border-[#0A0A0A] bg-[#FAF9F5]"
              required
              data-testid="edit-entry-date-input"
            />
          </div>

          {/* Duration Minutes with Quick-Chips */}
          <div className="space-y-2">
            <label className="text-xs font-mono uppercase tracking-wider font-bold text-[#0A0A0A] flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-[#4A4945]" />
                Duration (minutes)
              </span>
              <span className="text-xs font-mono text-[#4A4945] tabular-nums">
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
                className="text-xs h-9 w-28 font-mono rounded-none border-[#0A0A0A] bg-[#FAF9F5] tabular-nums"
                required
                data-testid="edit-duration-input"
              />
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => handleQuickChip(15)}
                  className="text-xs font-mono h-8 rounded-none border-[#0A0A0A] bg-[#EAE8E3] hover:bg-[#E4E2DC] text-[#0A0A0A]"
                  data-testid="edit-chip-15"
                >
                  +15m
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => handleQuickChip(30)}
                  className="text-xs font-mono h-8 rounded-none border-[#0A0A0A] bg-[#EAE8E3] hover:bg-[#E4E2DC] text-[#0A0A0A]"
                  data-testid="edit-chip-30"
                >
                  +30m
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => handleQuickChip(60)}
                  className="text-xs font-mono h-8 rounded-none border-[#0A0A0A] bg-[#EAE8E3] hover:bg-[#E4E2DC] text-[#0A0A0A]"
                  data-testid="edit-chip-60"
                >
                  +1h
                </Button>
              </div>
            </div>
          </div>

          {/* Note Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-mono uppercase tracking-wider font-bold text-[#0A0A0A] flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5 text-[#4A4945]" />
                Note (optional)
              </span>
              <span className="text-xs font-mono text-[#4A4945] tabular-nums">
                {note.length} / 5000
              </span>
            </label>
            <textarea
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Describe tasks completed, meetings attended, etc."
              maxLength={5000}
              className="w-full text-xs font-mono rounded-none border border-[#0A0A0A] bg-[#FAF9F5] p-2.5 text-[#0A0A0A] shadow-none focus:border-[#0A0A0A] focus:outline-none"
              data-testid="edit-note-textarea"
            />
          </div>

          <DialogFooter className="pt-2 border-t border-[#0A0A0A] flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs font-mono uppercase tracking-wider rounded-none border border-[#0A0A0A] bg-[#FAF9F5] hover:bg-[#EAE8E3] text-[#0A0A0A]"
              data-testid="edit-cancel-btn"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="text-xs font-mono uppercase tracking-wider font-bold rounded-none bg-[#0A0A0A] text-[#FAF9F5] hover:bg-[#E61919]"
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
