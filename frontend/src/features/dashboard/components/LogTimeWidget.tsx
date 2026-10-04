import { useState, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Clock,
  Play,
  Square,
  RotateCcw,
  Calendar,
  FileText,
  CheckCircle2,
  Trash2,
  Edit2,
  ListOrdered,
  Plus,
  Sparkles,
} from 'lucide-react';
import { useSessionStore } from '@/lib/session';
import { hasPermission } from '@/lib/permissions';
import {
  useTimeSummary,
  useTimeEntriesList,
  useCreateTimeEntry,
} from '../api/useTimeEntries';
import { useAssignedTasks } from '../api/useAssignedTasks';
import { TimeEntryEditModal } from './TimeEntryEditModal';
import { TimeEntryDeleteModal } from './TimeEntryDeleteModal';
import { useBlockingModal } from '@/features/operations/components/BlockingActionModal';
import { ApiError } from '@/lib/api';
import type { TimeEntry } from '../api/types';

export function LogTimeWidget() {
  const user = useSessionStore((state) => state.user);
  const permissions = useSessionStore((state) => state.permissions);

  const canCreateLog = hasPermission(permissions, 'timelog:create');
  const canEditOwn = hasPermission(permissions, 'timelog:edit_own');
  const canEditAll = hasPermission(permissions, 'timelog:edit_all');

  // Form State
  const todayStr = new Date().toISOString().slice(0, 10);
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [note, setNote] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Timer State (Optional Timer Toggle per Spec §4.2)
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Modals for Edit and Delete
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<TimeEntry | null>(null);

  // Queries & Mutations
  const { tasks: assignedTasks, isLoading: isLoadingTasks } = useAssignedTasks();
  const { data: summary } = useTimeSummary(selectedDate);
  const { data: entries = [], isLoading: isLoadingEntries } = useTimeEntriesList({
    from: selectedDate,
    to: selectedDate,
  });

  const createMutation = useCreateTimeEntry();
  const { openLoading, openSuccess, openError } = useBlockingModal();

  // Set default task if available and none selected
  useEffect(() => {
    if (!selectedTaskId && assignedTasks.length > 0) {
      const firstTask = assignedTasks[0];
      if (firstTask) {
        setSelectedTaskId(firstTask.taskId);
      }
    }
  }, [assignedTasks, selectedTaskId]);

  // Timer Effect
  useEffect(() => {
    if (isTimerRunning) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((sec) => sec + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isTimerRunning]);

  const handleStartTimer = () => {
    setIsTimerRunning(true);
  };

  const handleStopTimer = () => {
    setIsTimerRunning(false);
    // Convert elapsed seconds to minutes, minimum 1 minute
    const computedMinutes = Math.max(1, Math.ceil(elapsedSeconds / 60));
    setDurationMinutes(computedMinutes);
  };

  const handleResetTimer = () => {
    setIsTimerRunning(false);
    setElapsedSeconds(0);
  };

  const formatTimerDisplay = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remainderSecs = sec % 60;
    return `${String(mins).padStart(2, '0')}:${String(remainderSecs).padStart(2, '0')}`;
  };

  const handleDurationPreset = (minutes: number) => {
    setDurationMinutes(minutes);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedTaskId) {
      setValidationError('Please select an assigned task to log time against.');
      return;
    }
    if (!durationMinutes || durationMinutes < 1 || durationMinutes > 1440) {
      setValidationError('Duration must be between 1 and 1440 minutes.');
      return;
    }
    if (!selectedDate || selectedDate > todayStr) {
      setValidationError('Entry date cannot be in the future.');
      return;
    }

    setValidationError(null);

    openLoading({
      title: 'Logging Time Entry',
      message: 'Recording duration and work summary to staging backend...',
      actionName: 'create-time-entry',
    });

    try {
      await createMutation.mutateAsync({
        taskId: selectedTaskId,
        entryDate: selectedDate,
        durationMinutes,
        note: note.trim() || null,
      });

      openSuccess({
        title: 'Time Logged Successfully',
        message: `${durationMinutes} minutes recorded for today.`,
      });

      // Reset form
      setNote('');
      setElapsedSeconds(0);
      setIsTimerRunning(false);
    } catch (err) {
      console.error('[LogTimeWidget] Create failed:', err);
      if (err instanceof ApiError) {
        openError({
          code: err.code || 'TIME_ENTRY_ERROR',
          detail: err.detail || err.message,
          status: err.status,
          title: 'Failed to Log Time',
          onRetry: () => handleSubmit(e),
        });
      } else {
        openError({
          detail: err instanceof Error ? err.message : 'Unexpected error logging time',
          title: 'Submission Error',
        });
      }
    }
  };

  const formatMinutes = (total: number) => {
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h === 0) return `${m}m`;
    return `${h}h ${m}m`;
  };

  const canEditEntry = (entry: TimeEntry) => {
    if (canEditAll) return true;
    if (canEditOwn && entry.userId === user?.id) return true;
    return false;
  };

  const getTaskDisplayTitle = (taskId: string) => {
    const found = assignedTasks.find((t) => t.taskId === taskId);
    if (found) {
      return `${found.taskTitle} (${found.workRequestTitle})`;
    }
    const summaryItem = summary?.byTask.find((t) => t.taskId === taskId);
    if (summaryItem) {
      return summaryItem.title;
    }
    return taskId;
  };

  return (
    <div className="grid gap-6 lg:grid-cols-12" data-testid="log-time-widget">
      {/* 1. Left Card: Log Time Form & Quick Add */}
      <Card className="lg:col-span-5 border-[#e2e8f0] shadow-xs">
        <CardHeader className="pb-3 border-b border-slate-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Clock className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold text-slate-900">
                  Log Working Time
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Record duration-canonical hours against assigned tasks
                </CardDescription>
              </div>
            </div>
            {/* Optional Timer Pill */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium ${
                isTimerRunning
                  ? 'bg-blue-100 text-blue-800 animate-pulse border border-blue-300'
                  : 'bg-slate-100 text-slate-600'
              }`}
              data-testid="timer-display"
            >
              <span className={`h-2 w-2 rounded-full ${isTimerRunning ? 'bg-blue-600' : 'bg-slate-400'}`} />
              {formatTimerDisplay(elapsedSeconds)}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {validationError && (
              <div
                className="p-2.5 rounded-md bg-red-50 border border-red-200 text-xs text-red-700 font-medium"
                data-testid="time-validation-error"
              >
                {validationError}
              </div>
            )}

            {/* Task Picker Scoped to Assigned Tasks */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-slate-500" />
                  Assigned Task
                </label>
                <span className="text-[11px] text-slate-500 font-mono">
                  {assignedTasks.length} available
                </span>
              </div>

              {isLoadingTasks ? (
                <div className="h-9 w-full bg-slate-100 animate-pulse rounded-md" />
              ) : (
                <select
                  value={selectedTaskId}
                  onChange={(e) => setSelectedTaskId(e.target.value)}
                  disabled={!canCreateLog}
                  className="w-full text-xs rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-400"
                  data-testid="task-picker-select"
                >
                  {assignedTasks.length === 0 ? (
                    <option value="">No tasks currently assigned to you</option>
                  ) : (
                    assignedTasks.map((task) => (
                      <option key={task.taskId} value={task.taskId}>
                        [{task.entity}] {task.taskTitle} — {task.workRequestTitle}
                      </option>
                    ))
                  )}
                </select>
              )}
            </div>

            {/* Date & Timer Row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-slate-500" />
                  Work Date
                </label>
                <Input
                  type="date"
                  max={todayStr}
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="text-xs h-9"
                  disabled={!canCreateLog}
                  required
                  data-testid="entry-date-input"
                />
              </div>

              {/* Timer Controls Toggle (Spec §4.2) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-blue-500" />
                  Timer Toggle
                </label>
                <div className="flex items-center gap-1">
                  {!isTimerRunning ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleStartTimer}
                      disabled={!canCreateLog}
                      className="text-xs flex-1 gap-1 h-9 font-semibold text-blue-600 hover:text-blue-700"
                      data-testid="start-timer-btn"
                    >
                      <Play className="h-3 w-3 fill-current" /> Start
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={handleStopTimer}
                      className="text-xs flex-1 gap-1 h-9 font-semibold bg-amber-600 hover:bg-amber-700 text-white"
                      data-testid="stop-timer-btn"
                    >
                      <Square className="h-3 w-3 fill-current" /> Stop & Fill
                    </Button>
                  )}
                  {elapsedSeconds > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={handleResetTimer}
                      title="Reset timer"
                      className="h-9 w-9 text-slate-400 hover:text-slate-600"
                      data-testid="reset-timer-btn"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Duration Quick-Chips & Number Input */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-slate-500" />
                  Duration (Minutes)
                </label>
                <span className="text-[11px] font-mono text-blue-600 font-semibold">
                  {formatMinutes(durationMinutes)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 0)}
                  disabled={!canCreateLog}
                  className="text-xs h-9 w-24 font-mono font-bold"
                  required
                  data-testid="duration-minutes-input"
                />

                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant={durationMinutes === 15 ? 'default' : 'outline'}
                    size="xs"
                    onClick={() => handleDurationPreset(15)}
                    disabled={!canCreateLog}
                    className="text-xs h-9 px-2.5"
                    data-testid="duration-chip-15"
                  >
                    15m
                  </Button>
                  <Button
                    type="button"
                    variant={durationMinutes === 30 ? 'default' : 'outline'}
                    size="xs"
                    onClick={() => handleDurationPreset(30)}
                    disabled={!canCreateLog}
                    className="text-xs h-9 px-2.5"
                    data-testid="duration-chip-30"
                  >
                    30m
                  </Button>
                  <Button
                    type="button"
                    variant={durationMinutes === 60 ? 'default' : 'outline'}
                    size="xs"
                    onClick={() => handleDurationPreset(60)}
                    disabled={!canCreateLog}
                    className="text-xs h-9 px-2.5"
                    data-testid="duration-chip-60"
                  >
                    60m
                  </Button>
                  <Button
                    type="button"
                    variant={durationMinutes === 120 ? 'default' : 'outline'}
                    size="xs"
                    onClick={() => handleDurationPreset(120)}
                    disabled={!canCreateLog}
                    className="text-xs h-9 px-2.5"
                    data-testid="duration-chip-120"
                  >
                    2h
                  </Button>
                </div>
              </div>
            </div>

            {/* Note Field */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-slate-500" />
                  Work Description / Note (Optional)
                </label>
                <span className="text-[10px] text-slate-400">
                  {note.length} / 5000
                </span>
              </div>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What was completed during this block?"
                maxLength={5000}
                disabled={!canCreateLog}
                className="w-full text-xs rounded-md border border-slate-200 bg-white p-2.5 text-slate-800 shadow-2xs focus:border-blue-500 focus:outline-none disabled:bg-slate-50"
                data-testid="note-textarea"
              />
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              size="sm"
              disabled={!canCreateLog || createMutation.isPending || !selectedTaskId}
              className="w-full text-xs font-semibold gap-1.5 h-9"
              data-testid="submit-timelog-btn"
            >
              <Plus className="h-4 w-4" />
              {createMutation.isPending ? 'Logging Time...' : 'Record Time Entry'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* 2. Right Card: Today's Summary & Edit-in-Place Entries */}
      <Card className="lg:col-span-7 border-[#e2e8f0] shadow-xs">
        <CardHeader className="pb-3 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <ListOrdered className="h-4 w-4 text-blue-600" />
                Logged Time Breakdown
              </CardTitle>
              <CardDescription className="text-xs text-slate-500">
                Summary and entries for {selectedDate}
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs font-mono font-bold px-2.5 py-1">
                Total: {formatMinutes(summary?.totalMinutes ?? 0)}
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4 space-y-4">
          {/* Summary By Task (Aggregated) */}
          {summary && summary.byTask.length > 0 && (
            <div className="space-y-1.5" data-testid="task-breakdown-section">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Task Breakdown
              </span>
              <div className="grid gap-2 sm:grid-cols-2">
                {summary.byTask.map((task) => (
                  <div
                    key={task.taskId}
                    className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/70 flex items-center justify-between"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="text-xs font-medium text-slate-900 truncate">
                        {task.title}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono truncate">
                        {task.taskId}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs font-mono font-bold shrink-0">
                      {formatMinutes(task.minutes)}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Today's Individual Entries (Edit/Delete in place) */}
          <div className="space-y-2">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center justify-between">
              <span>Individual Time Entries</span>
              <span className="text-slate-400 lowercase font-normal">
                {entries.length} recorded
              </span>
            </span>

            {isLoadingEntries ? (
              <div className="space-y-2">
                <div className="h-14 w-full bg-slate-100 animate-pulse rounded-md" />
                <div className="h-14 w-full bg-slate-100 animate-pulse rounded-md" />
              </div>
            ) : entries.length === 0 ? (
              <div
                className="py-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg"
                data-testid="no-entries-message"
              >
                No time entries logged for {selectedDate}. Use the form to record hours.
              </div>
            ) : (
              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1" data-testid="entries-list">
                {entries.map((entry) => {
                  const allowed = canEditEntry(entry);
                  const taskTitle = getTaskDisplayTitle(entry.taskId);

                  return (
                    <div
                      key={entry.id}
                      className="p-3 rounded-lg border border-slate-200 bg-white hover:border-slate-300 transition-colors flex items-start justify-between gap-3"
                      data-testid={`time-entry-item-${entry.id}`}
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-slate-900 truncate">
                            {taskTitle}
                          </span>
                          <Badge variant="secondary" className="text-[10px] font-mono shrink-0">
                            {formatMinutes(entry.durationMinutes)}
                          </Badge>
                        </div>
                        {entry.note && (
                          <p className="text-xs text-slate-600 line-clamp-2">
                            {entry.note}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-[10px] text-slate-400">
                          <span>Date: {entry.entryDate}</span>
                          <span>•</span>
                          <span>Logged: {new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>

                      {/* Edit / Delete Actions */}
                      {allowed && (
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setEditingEntry(entry)}
                            className="h-7 w-7 text-slate-500 hover:text-blue-600"
                            title="Edit entry"
                            data-testid={`edit-entry-btn-${entry.id}`}
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setDeletingEntry(entry)}
                            className="h-7 w-7 text-slate-500 hover:text-red-600"
                            title="Delete entry"
                            data-testid={`delete-entry-btn-${entry.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Entry Modal */}
      {editingEntry && (
        <TimeEntryEditModal
          isOpen={Boolean(editingEntry)}
          onClose={() => setEditingEntry(null)}
          entry={editingEntry}
          tasks={assignedTasks}
        />
      )}

      {/* Delete Entry Confirmation Modal */}
      {deletingEntry && (
        <TimeEntryDeleteModal
          isOpen={Boolean(deletingEntry)}
          onClose={() => setDeletingEntry(null)}
          entry={deletingEntry}
          taskTitle={getTaskDisplayTitle(deletingEntry.taskId)}
        />
      )}
    </div>
  );
}
