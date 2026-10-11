import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Calendar,
  CheckSquare,
  CornerDownLeft,
  Loader2,
  User,
  X,
} from 'lucide-react';
import { getEligibleStaff, useTeam } from '../api/useTeam';
import type { CreatablePhase, CreateTaskInput, WorkRequest } from '../api/types';

interface QuickAddCardProps {
  phase: CreatablePhase;
  workRequest: WorkRequest;
  onCreate: (data: CreateTaskInput) => Promise<void>;
  onCancel: () => void;
}

export function QuickAddCard({ phase, workRequest, onCreate, onCancel }: QuickAddCardProps) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dateOpen, setDateOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const { data: team = [], isLoading: teamLoading, isError: teamError } = useTeam();
  const memberIds = new Set(
    [workRequest.assignedTo, ...(workRequest.coAssignees ?? [])].filter(Boolean)
  );
  const eligible = memberIds.size
    ? team.filter((member) => memberIds.has(member.id))
    : getEligibleStaff(team);
  // Re-check scope on each render so a removed WR member cannot be submitted.
  const assignee = eligible.find((member) => member.id === assigneeId);
  const initials = assignee?.name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean);
  const avatar = initials
    ? `${initials[0] ?? ''}${initials.length > 1 ? initials[initials.length - 1] : ''}`
    : '';

  useLayoutEffect(() => {
    const input = titleRef.current;
    if (input) {
      input.style.height = 'auto';
      input.style.height = `${Math.max(60, input.scrollHeight)}px`;
    }
  }, [title]);

  const submit = async () => {
    if (
      submitting.current ||
      !title.trim() ||
      title.trim().length > 255 ||
      workRequest.status === 'Completed'
    )
      return;
    submitting.current = true;
    setPending(true);
    setError('');
    try {
      await onCreate({
        title: title.trim(),
        phase,
        status: assignee ? 'Assigned' : 'Draft',
        requiredLinkType: null,
        dueDate: dueDate || null,
        assigneeId: assignee?.id ?? null,
        assigneeName: assignee?.name ?? null,
        assignees: assignee ? [assignee.id] : [],
      });
      if (mounted.current) onCancel();
    } catch {
      setError('Unable to create task. Please try again.');
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };

  const controlClass =
    'relative flex h-7 items-center justify-center rounded text-slate-500 hover:bg-slate-100 focus-within:ring-2 focus-within:ring-blue-500';
  return (
    <form
      className="border-2 border-blue-500 rounded-lg p-2.5 bg-white shadow-xs space-y-2 text-xs animate-in fade-in duration-150"
      data-testid={`quick-add-form-${phase}`}
      aria-label="Quick-add task"
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !pending) {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <div className="flex items-start gap-1">
        <textarea
          ref={titleRef}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          placeholder="What needs to be done?"
          aria-label="Task title"
          className="min-h-15 w-full resize-none border-0 bg-transparent p-1 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
          rows={2}
          maxLength={255}
          required
          autoFocus
          disabled={pending}
          data-testid={`quick-add-title-input-${phase}`}
        />
        <button
          type="button"
          aria-label="Cancel quick-add task"
          disabled={pending}
          onClick={onCancel}
          className="rounded p-1 text-slate-400 hover:text-slate-600 disabled:opacity-40"
          data-testid={`quick-add-cancel-${phase}`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <fieldset
        disabled={pending}
        className="flex min-w-0 flex-wrap items-center gap-1 disabled:opacity-60"
      >
        <span className="flex h-7 items-center justify-center px-1" title="Standard Task">
          <CheckSquare className="h-4 w-4 text-blue-600" role="img" aria-label="Standard Task" />
        </span>
        <button
          type="button"
          className={`${controlClass} gap-1 px-1`}
          aria-label="Choose due date"
          aria-expanded={dateOpen}
          onClick={() => setDateOpen(!dateOpen)}
          data-testid={`quick-add-due-date-trigger-${phase}`}
        >
          <Calendar className="h-4 w-4" />
          {dueDate && (
            <span>
              {new Date(`${dueDate}T00:00:00`).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
              })}
            </span>
          )}
        </button>
        {dueDate && (
          <button
            type="button"
            aria-label="Clear due date"
            className={controlClass}
            onClick={() => setDueDate('')}
          >
            <X className="h-3 w-3" />
          </button>
        )}
        <label
          className={`${controlClass} w-7 rounded-full ${assignee ? 'bg-emerald-100 text-emerald-800 font-bold' : 'border border-dashed border-slate-300'}`}
          title={assignee?.name ?? 'Unassigned'}
        >
          {assignee ? avatar.toUpperCase() : <User className="h-4 w-4" />}
          <select
            aria-label="Lead assignee"
            value={assignee?.id ?? ''}
            disabled={teamLoading || teamError}
            onChange={(event) => setAssigneeId(event.target.value)}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
            data-testid={`quick-add-assignee-trigger-${phase}`}
          >
            <option value="">Unassigned</option>
            {eligible.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          aria-label="Create task"
          disabled={pending || !title.trim()}
          className="ml-auto flex h-7 w-7 items-center justify-center rounded bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:bg-slate-100 disabled:text-slate-400"
          data-testid={`quick-add-submit-btn-${phase}`}
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CornerDownLeft className="h-4 w-4" />
          )}
        </button>
        {dateOpen && (
          <input
            type="date"
            aria-label="Task due date"
            value={dueDate}
            onChange={(event) => setDueDate(event.target.value)}
            className="w-full rounded border border-slate-200 p-1 text-xs"
            autoFocus
          />
        )}
      </fieldset>
      {teamError && <p className="text-amber-700">Team members could not be loaded.</p>}
      {error && (
        <p role="alert" className="text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}
