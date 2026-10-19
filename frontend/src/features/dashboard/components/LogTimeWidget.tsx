import { workDate } from '@/lib/workDate';
import { DateInput } from '@/components/ui/date-input';
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
  const todayStr = workDate();
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [durationMinutes, setDurationMinutes] = useState<number>(30);
  const [note, setNote] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Timer State (Optional Timer Toggle per Spec §4.2)
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const timerStartedAt = useRef<number | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Modals for Edit and Delete
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<TimeEntry | null>(null);

  // Queries & Mutations
  const { tasks: assignedTasks, isLoading: isLoadingTasks, isError: taskLoadFailed, refetch: reloadTasks } = useAssignedTasks();
  const { data: summary } = useTimeSummary(selectedDate, user?.id);
  const { data: entries = [], isLoading: isLoadingEntries } = useTimeEntriesList({
    userId: user?.id,
    from: selectedDate,
    to: selectedDate,
  });

  const createMutation = useCreateTimeEntry();
  const { openLoading, openSuccess, openError } = useBlockingModal();

  // Set default task if available and none selected
  useEffect(() => {
    if (!isLoadingTasks && !assignedTasks.some((task) => task.taskId === selectedTaskId)) {
      setSelectedTaskId(assignedTasks[0]?.taskId || '');
    }
  }, [assignedTasks, selectedTaskId, isLoadingTasks]);

  // Timer Effect
  useEffect(() => {
    if (isTimerRunning) {
      timerRef.current = setInterval(() => {
        if (timerStartedAt.current !== null) {
          setElapsedSeconds(Math.floor((Date.now() - timerStartedAt.current) / 1000));
        }
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
    timerStartedAt.current = Date.now() - elapsedSeconds * 1000;
    setIsTimerRunning(true);
  };

  const handleStopTimer = () => {
    setIsTimerRunning(false);
    // Convert elapsed seconds to minutes, minimum 1 minute
    const seconds = timerStartedAt.current === null ? elapsedSeconds : Math.floor((Date.now() - timerStartedAt.current) / 1000);
    setElapsedSeconds(seconds);
    const computedMinutes = Math.max(1, Math.ceil(seconds / 60));
    setDurationMinutes(computedMinutes);
  };

  const handleResetTimer = () => {
    timerStartedAt.current = null;
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

    if (createMutation.isPending) return;
    if (isTimerRunning) {
      setValidationError('Stop the timer before saving your time entry.');
      return;
    }
    if (!selectedTaskId || !assignedTasks.some((task) => task.taskId === selectedTaskId)) {
      setValidationError('Please select an assigned task to log time against.');
      return;
    }
    if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 1440) {
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
      message: 'Saving your time entry...',
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
        message: `${durationMinutes} minutes recorded for ${selectedDate}.`,
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
      <Card className="lg:col-span-5 border border-[#0A0A0A] bg-[#FAF9F5] rounded-none shadow-none">
        <CardHeader className="pb-3 border-b border-[#0A0A0A]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-none bg-[#EAE8E3] text-[#0A0A0A] border border-[#0A0A0A]">
                <Clock className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-bold text-[#0A0A0A]">
                  Log Working Time
                </CardTitle>
                <CardDescription className="text-xs text-[#4A4945]">
                  Record duration-canonical hours against assigned tasks
                </CardDescription>
              </div>
            </div>
            {/* Optional Timer Pill */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-none text-xs font-mono font-medium border ${
                isTimerRunning
                  ? 'bg-[#0A0A0A] text-[#FAF9F5] border-[#0A0A0A] animate-pulse'
                  : 'bg-[#EAE8E3] text-[#0A0A0A] border-[#0A0A0A]'
              }`}
              data-testid="timer-display"
            >
              <span className={`h-2 w-2 rounded-none ${isTimerRunning ? 'bg-[#E61919]' : 'bg-[#4A4945]'}`} />
              {formatTimerDisplay(elapsedSeconds)}
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {validationError && (
              <div
                className="p-2.5 rounded-none bg-[#FCE8E8] border border-[#E61919] text-xs text-[#A81212] font-medium"
                data-testid="time-validation-error"
              >
                {validationError}
              </div>
            )}

            {/* Task Picker Scoped to Assigned Tasks */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[#0A0A0A] flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#4A4945]" />
                  Assigned Task
                </label>
                <span className="text-xs text-[#4A4945] font-mono">
                  {assignedTasks.length} available
                </span>
              </div>

              {taskLoadFailed && (
                <div role="alert" className="text-xs text-[#E61919]">
                  Unable to load assigned tasks.{' '}
                  <button type="button" onClick={() => void reloadTasks()} className="underline">Retry</button>
                </div>
              )}
              {isLoadingTasks ? (
                <div className="h-9 w-full bg-[#EAE8E3] animate-pulse rounded-none border border-[#C8C5BC]" />
              ) : (
                <select
                  value={selectedTaskId}
                  onChange={(e) => setSelectedTaskId(e.target.value)}
                  disabled={!canCreateLog}
                  className="w-full text-xs rounded-none border border-[#111111] bg-[#FFFFFF] px-3 py-2 text-[#0A0A0A] shadow-none focus:border-[#E61919] focus:outline-none disabled:bg-[#EAE8E3] disabled:text-[#4A4945]"
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
                <DateInput
                  aria-label="Work date"
                  type="date"
                  max={todayStr}
                  value={selectedDate}
                  onValueChange={(value) => setSelectedDate(value)}
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
                <label className="text-xs font-semibold text-[#0A0A0A] flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-[#4A4945]" />
                  Duration (Minutes)
                </label>
                <span className="text-xs font-mono text-[#0A0A0A] font-semibold tabular-nums">
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
                  className="text-xs h-9 w-24 font-mono font-bold rounded-none border border-[#111111] bg-[#FFFFFF] tabular-nums"
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
                    className={`text-xs h-9 px-2.5 rounded-none font-mono font-semibold cursor-pointer ${
                      durationMinutes === 15
                        ? 'bg-[#0A0A0A] text-[#FAF9F5] border border-[#0A0A0A]'
                        : 'bg-[#FAF9F5] text-[#0A0A0A] border border-[#0A0A0A] hover:bg-[#EAE8E3]'
                    }`}
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
                    className={`text-xs h-9 px-2.5 rounded-none font-mono font-semibold cursor-pointer ${
                      durationMinutes === 30
                        ? 'bg-[#0A0A0A] text-[#FAF9F5] border border-[#0A0A0A]'
                        : 'bg-[#FAF9F5] text-[#0A0A0A] border border-[#0A0A0A] hover:bg-[#EAE8E3]'
                    }`}
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
                    className={`text-xs h-9 px-2.5 rounded-none font-mono font-semibold cursor-pointer ${
                      durationMinutes === 60
                        ? 'bg-[#0A0A0A] text-[#FAF9F5] border border-[#0A0A0A]'
                        : 'bg-[#FAF9F5] text-[#0A0A0A] border border-[#0A0A0A] hover:bg-[#EAE8E3]'
                    }`}
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
                    className={`text-xs h-9 px-2.5 rounded-none font-mono font-semibold cursor-pointer ${
                      durationMinutes === 120
                        ? 'bg-[#0A0A0A] text-[#FAF9F5] border border-[#0A0A0A]'
                        : 'bg-[#FAF9F5] text-[#0A0A0A] border border-[#0A0A0A] hover:bg-[#EAE8E3]'
                    }`}
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
                <label className="text-xs font-semibold text-[#0A0A0A] flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 text-[#4A4945]" />
                  Work Description / Note (Optional)
                </label>
                <span className="text-xs text-[#4A4945] font-mono">
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
                className="w-full text-xs rounded-none border border-[#111111] bg-[#FFFFFF] p-2.5 text-[#0A0A0A] shadow-none focus:border-[#E61919] focus:outline-none disabled:bg-[#EAE8E3]"
                data-testid="note-textarea"
              />
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              size="sm"
              disabled={!canCreateLog || createMutation.isPending || isTimerRunning || !selectedTaskId}
              className="w-full text-xs font-mono font-semibold uppercase tracking-wider gap-1.5 h-9 rounded-none border border-[#0A0A0A] bg-[#0A0A0A] text-[#FAF9F5] hover:bg-[#222220] shadow-none cursor-pointer"
              data-testid="submit-timelog-btn"
            >
              <Plus className="h-4 w-4" />
              {createMutation.isPending ? 'Logging Time...' : 'Record Time Entry'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* 2. Right Card: Today's Summary & Edit-in-Place Entries */}
      <Card className="lg:col-span-7 border border-[#0A0A0A] bg-[#FAF9F5] rounded-none shadow-none">
        <CardHeader className="pb-3 border-b border-[#0A0A0A]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-bold text-[#0A0A0A] flex items-center gap-2">
                <ListOrdered className="h-4 w-4 text-[#0A0A0A]" />
                Logged Time Breakdown
              </CardTitle>
              <CardDescription className="text-xs text-[#4A4945]">
                Summary and entries for {selectedDate}
              </CardDescription>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs font-mono font-bold px-2.5 py-1 rounded-none border border-[#0A0A0A] bg-[#EAE8E3] text-[#0A0A0A]">
                Total: {formatMinutes(summary?.totalMinutes ?? 0)}
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4 space-y-4">
          {/* Summary By Task (Aggregated) */}
          {summary && summary.byTask.length > 0 && (
            <div className="space-y-1.5" data-testid="task-breakdown-section">
              <span className="text-xs font-mono font-semibold text-[#4A4945] uppercase tracking-wider">
                Task Breakdown
              </span>
              <div className="grid gap-2 sm:grid-cols-2">
                {summary.byTask.map((task) => (
                  <div
                    key={task.taskId}
                    className="p-2.5 rounded-none border border-[#C8C5BC] bg-[#FFFFFF] flex items-center justify-between"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="text-xs font-semibold text-[#0A0A0A] truncate">
                        {task.title}
                      </div>
                      <div className="text-xs text-[#4A4945] font-mono truncate">
                        {task.taskId}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs font-mono font-bold shrink-0 rounded-none border border-[#0A0A0A]">
                      {formatMinutes(task.minutes)}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Today's Individual Entries (Edit/Delete in place) */}
          <div className="space-y-2">
            <span className="text-xs font-mono font-semibold text-[#4A4945] uppercase tracking-wider flex items-center justify-between">
              <span>Individual Time Entries</span>
              <span className="text-[#4A4945] lowercase font-normal">
                {entries.length} recorded
              </span>
            </span>

            {isLoadingEntries ? (
              <div className="space-y-2">
                <div className="h-14 w-full bg-[#EAE8E3] animate-pulse rounded-none border border-[#C8C5BC]" />
                <div className="h-14 w-full bg-[#EAE8E3] animate-pulse rounded-none border border-[#C8C5BC]" />
              </div>
            ) : entries.length === 0 ? (
              <div
                className="py-8 text-center text-xs text-[#4A4945] border border-dashed border-[#C8C5BC] rounded-none"
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
                      className="p-3 rounded-none border border-[#C8C5BC] bg-[#FFFFFF] hover:border-[#0A0A0A] transition-colors flex items-start justify-between gap-3"
                      data-testid={`time-entry-item-${entry.id}`}
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-[#0A0A0A] truncate">
                            {taskTitle}
                          </span>
                          <Badge variant="secondary" className="text-xs font-mono shrink-0 rounded-none border border-[#C8C5BC] bg-[#EAE8E3] text-[#0A0A0A]">
                            {formatMinutes(entry.durationMinutes)}
                          </Badge>
                        </div>
                        {entry.note && (
                          <p className="text-xs text-[#4A4945] line-clamp-2">
                            {entry.note}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-[#4A4945] font-mono">
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
                            className="h-7 w-7 rounded-none text-[#4A4945] hover:text-[#0A0A0A] hover:bg-[#EAE8E3] cursor-pointer"
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
                            className="h-7 w-7 rounded-none text-[#4A4945] hover:text-[#E61919] hover:bg-[#FCE8E8] cursor-pointer"
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
