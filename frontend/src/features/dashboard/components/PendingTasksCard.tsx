import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  Clock,
  Building,
  FileText,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Search,
  CalendarDays,
  CalendarRange,
  ListOrdered,
  Kanban,
  User,
  Users,
} from 'lucide-react';
import { useAssignedTasks } from '../api/useAssignedTasks';
import { useSessionStore } from '@/lib/session';
import { isTaskAssignee } from '@/features/operations/lib/taskScope';
import { TaskDetailModal } from '@/features/operations/components/TaskDetailModal';
import type { Task } from '@/features/operations/api/types';
import type { AssignableTaskOption } from '../api/types';

export interface PendingTasksCardProps {
  onLogTimeForTask?: (taskId: string) => void;
}

type CalendarView = 'week' | 'month' | 'agenda' | 'board';
type StatusFilter = 'all' | 'not_started' | 'in_progress' | 'completed' | 'blocked';
type AssigneeFilter = 'all' | 'me';

interface CardTheme {
  bg: string;
  border: string;
  hoverBorder: string;
  ink: string;
  muted: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  avatarBg: string;
}

function parseDateString(dStr: string | null | undefined): Date | null {
  if (!dStr) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dStr);
  if (match) {
    const year = parseInt(match[1]!, 10);
    const month = parseInt(match[2]!, 10) - 1;
    const day = parseInt(match[3]!, 10);
    return new Date(year, month, day);
  }
  const parsed = new Date(dStr);
  return isNaN(parsed.getTime())
    ? null
    : new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDueDate(dueDate: string | null | undefined): string {
  if (!dueDate) return 'No due date';
  const d = parseDateString(dueDate);
  if (!d) return dueDate;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getInitials(name: string): string {
  if (!name) return 'OP';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'OP';
  if (parts.length === 1) return (parts[0]?.slice(0, 2) || 'OP').toUpperCase();
  const first = parts[0]?.[0] || '';
  const last = parts[parts.length - 1]?.[0] || '';
  return (first + last).toUpperCase();
}

/**
 * Color-code calendar cards strictly by:
 * 1. Completed within/before due date (status === 'Completed' && (!dueDate || completedDate <= dueDate)) -> Green
 * 2. Overdue OR Completed beyond due date:
 *    - status !== 'Completed' && dueDate < today -> Red
 *    - status === 'Completed' && dueDate && completedDate > dueDate -> Red
 * 3. Entity LTA -> Amber / Warm Gold
 * 4. Entity ATA (default) -> Sky / Blue
 */
function getStickyNoteTheme(task: AssignableTaskOption, today: Date): CardTheme {
  const parsedDue = parseDateString(task.dueDate);

  const completedTheme: CardTheme = {
    bg: 'bg-[#ECFDF5]',
    border: 'border-[#10B981]',
    hoverBorder: 'hover:border-[#059669]',
    ink: 'text-[#065F46]',
    muted: 'text-[#047857]',
    badgeBg: 'bg-[#D1FAE5]',
    badgeText: 'text-[#065F46]',
    badgeBorder: 'border-[#34D399]',
    avatarBg: '#059669',
  };

  const overdueOrLateTheme: CardTheme = {
    bg: 'bg-[#FFF1F2]',
    border: 'border-[#F43F5E]',
    hoverBorder: 'hover:border-[#E11D48]',
    ink: 'text-[#991B1B]',
    muted: 'text-[#BE123C]',
    badgeBg: 'bg-[#FFE4E6]',
    badgeText: 'text-[#991B1B]',
    badgeBorder: 'border-[#FB7185]',
    avatarBg: '#E11D48',
  };

  // 1. Task is marked as Completed: check if last "mark as completed" action was within/before due date or beyond it
  if (task.status === 'Completed') {
    const rawTaskRecord = task.rawTask as unknown as Record<string, unknown> | undefined;
    const completedTimestampStr =
      task.completedAt ||
      task.updatedAt ||
      (rawTaskRecord?.completedAt as string | null | undefined) ||
      (rawTaskRecord?.completed_at as string | null | undefined) ||
      task.rawTask?.updatedAt ||
      (rawTaskRecord?.updated_at as string | null | undefined) ||
      null;

    const completedDate = parseDateString(completedTimestampStr) || today;

    if (parsedDue && completedDate.getTime() > parsedDue.getTime()) {
      // Marked completed beyond specified due date -> Red
      return overdueOrLateTheme;
    }

    // Marked completed within/before the due date (or no due date) -> Green
    return completedTheme;
  }

  // 2. Incomplete task without a due date -> Dedicated Violet/Purple theme (never Red)
  if (!parsedDue) {
    return {
      bg: 'bg-[#F5F3FF]',
      border: 'border-[#8B5CF6]',
      hoverBorder: 'hover:border-[#7C3AED]',
      ink: 'text-[#4C1D95]',
      muted: 'text-[#5B21B6]',
      badgeBg: 'bg-[#EDE9FE]',
      badgeText: 'text-[#4C1D95]',
      badgeBorder: 'border-[#A78BFA]',
      avatarBg: '#6D28D9',
    };
  }

  // 3. Incomplete task past due date -> Red
  if (parsedDue.getTime() < today.getTime()) {
    return overdueOrLateTheme;
  }

  // 3. Entity LTA
  if (String(task.entity).toUpperCase() === 'LTA') {
    return {
      bg: 'bg-[#FFFBEB]',
      border: 'border-[#F59E0B]',
      hoverBorder: 'hover:border-[#D97706]',
      ink: 'text-[#78350F]',
      muted: 'text-[#92400E]',
      badgeBg: 'bg-[#FEF3C7]',
      badgeText: 'text-[#78350F]',
      badgeBorder: 'border-[#FBBF24]',
      avatarBg: '#D97706',
    };
  }

  // 4. Entity ATA (default)
  return {
    bg: 'bg-[#EFF6FF]',
    border: 'border-[#3B82F6]',
    hoverBorder: 'hover:border-[#2563EB]',
    ink: 'text-[#1E3A8A]',
    muted: 'text-[#1D4ED8]',
    badgeBg: 'bg-[#DBEAFE]',
    badgeText: 'text-[#1E3A8A]',
    badgeBorder: 'border-[#60A5FA]',
    avatarBg: '#1D4ED8',
  };
}

function getWeekDays(referenceDate: Date): Date[] {
  const day = referenceDate.getDay();
  const sunday = new Date(referenceDate);
  sunday.setDate(referenceDate.getDate() - day);
  sunday.setHours(0, 0, 0, 0);

  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const next = new Date(sunday);
    next.setDate(sunday.getDate() + i);
    days.push(next);
  }
  return days;
}

function getMonthDays(referenceDate: Date): { date: Date; isCurrentMonth: boolean }[] {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1);
  const startDayOfWeek = firstDayOfMonth.getDay();

  const startDate = new Date(firstDayOfMonth);
  startDate.setDate(startDate.getDate() - startDayOfWeek);

  const days: { date: Date; isCurrentMonth: boolean }[] = [];
  for (let i = 0; i < 35; i++) {
    const cellDate = new Date(startDate);
    cellDate.setDate(startDate.getDate() + i);
    days.push({
      date: cellDate,
      isCurrentMonth: cellDate.getMonth() === month,
    });
  }
  return days;
}

export function PendingTasksCard({ onLogTimeForTask }: PendingTasksCardProps = {}) {
  const navigate = useNavigate();
  const user = useSessionStore((state) => state.user);
  const isAdmin = String(user?.role || '').toLowerCase() === 'admin';
  const { tasks, isLoading } = useAssignedTasks({ allTasksForAdmin: isAdmin });

  // Calendar Navigation & Multi-View State
  const [anchorDate, setAnchorDate] = useState<Date>(() => new Date());
  const [view, setView] = useState<CalendarView>('week');

  // Search & Filtering State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>('all');

  // Modal State for Task Detail View
  const [selectedTaskForDetail, setSelectedTaskForDetail] = useState<AssignableTaskOption | null>(null);

  // Incomplete Pending Tasks Filter (for counter badge & status summary)
  const pendingTasks = useMemo(() => {
    return tasks.filter(
      (task) => task.status !== 'Completed' && task.status !== 'Cancelled'
    );
  }, [tasks]);

  // All non-cancelled tasks remain on the calendar so completed items stay visible and color-coded
  const calendarTasks = useMemo(() => {
    return tasks.filter((task) => task.status !== 'Cancelled');
  }, [tasks]);

  // Today normalized to midnight
  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);
  const todayKey = useMemo(() => formatDateKey(today), [today]);

  // Active Week Days
  const weekDays = useMemo(() => getWeekDays(anchorDate), [anchorDate]);
  const weekDateKeys = useMemo(() => new Set(weekDays.map(formatDateKey)), [weekDays]);

  // Active Month Days
  const monthDays = useMemo(() => getMonthDays(anchorDate), [anchorDate]);

  // Filtered Tasks according to Search, Status & Assignee filters (includes Completed tasks on calendar)
  const displayedTasks = useMemo(() => {
    return calendarTasks.filter((task) => {
      // 1. Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = task.taskTitle.toLowerCase().includes(query);
        const matchesWr = task.workRequestTitle.toLowerCase().includes(query);
        const matchesClient = (task.clientName || '').toLowerCase().includes(query);
        const matchesAssignee = (task.assigneeName || '').toLowerCase().includes(query);
        if (!matchesTitle && !matchesWr && !matchesClient && !matchesAssignee) {
          return false;
        }
      }

      // 2. Status filter
      if (statusFilter === 'not_started') {
        if (task.status !== 'Draft' && task.status !== 'Assigned') return false;
      } else if (statusFilter === 'in_progress') {
        if (task.status !== 'In Progress' && task.status !== 'For Review') return false;
      } else if (statusFilter === 'completed') {
        if (task.status !== 'Completed') return false;
      } else if (statusFilter === 'blocked') {
        if (task.priority !== 'Urgent' && task.status !== 'On Hold') return false;
      }

      // 3. Assignee filter
      if (assigneeFilter === 'me') {
        const matchesUser =
          (task.rawTask && isTaskAssignee(user, task.rawTask)) ||
          (user?.id && task.assigneeId === user.id) ||
          (user?.name && task.assigneeName === user.name);
        if (!matchesUser) return false;
      }

      return true;
    });
  }, [calendarTasks, searchQuery, statusFilter, assigneeFilter, user]);

  // Navigation Handlers
  const handlePrev = () => {
    const nextDate = new Date(anchorDate);
    if (view === 'month') {
      nextDate.setMonth(nextDate.getMonth() - 1);
    } else {
      nextDate.setDate(nextDate.getDate() - 7);
    }
    setAnchorDate(nextDate);
  };

  const handleNext = () => {
    const nextDate = new Date(anchorDate);
    if (view === 'month') {
      nextDate.setMonth(nextDate.getMonth() + 1);
    } else {
      nextDate.setDate(nextDate.getDate() + 7);
    }
    setAnchorDate(nextDate);
  };

  const handleToday = () => {
    setAnchorDate(new Date());
  };

  const handleNavigateToTask = (task: AssignableTaskOption) => {
    const params = new URLSearchParams({
      tab: 'work-requests',
      view: 'board',
      wrId: task.workRequestId,
      workRequestId: task.workRequestId,
      taskId: task.taskId,
    });
    navigate(`/operations?${params.toString()}`);
  };

  const handlePinToTimer = (taskId: string) => {
    onLogTimeForTask?.(taskId);
    const anchor = document.getElementById('log-time-widget-anchor');
    if (anchor) {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const formatPhase = (phase: string | null | undefined) => {
    if (!phase) return null;
    switch (phase) {
      case 'pre_processing':
        return 'Pre-Processing';
      case 'processing':
        return 'Processing';
      case 'quality_assurance':
        return 'Quality Assurance';
      case 'completion':
        return 'Completion';
      default:
        return phase;
    }
  };

  // Fixed Date Range Label: Always formats cleanly without Chrome V8 undefined month bugs
  const dateRangeLabel = useMemo(() => {
    if (view === 'month') {
      return anchorDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    }
    const start = weekDays[0]!;
    const end = weekDays[6]!;
    const startMonth = start.toLocaleDateString('en-US', { month: 'short' });
    const endMonth = end.toLocaleDateString('en-US', { month: 'short' });
    const startDay = start.getDate();
    const endDay = end.getDate();
    const year = end.getFullYear();

    return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${year}`;
  }, [view, anchorDate, weekDays]);

  // Dual-Surface Task Distribution Map for Week View
  const tasksByWeekDay = useMemo(() => {
    const map = new Map<string, AssignableTaskOption[]>();
    for (const d of weekDays) {
      map.set(formatDateKey(d), []);
    }

    const fallbackKey = weekDateKeys.has(todayKey) ? todayKey : formatDateKey(weekDays[0]!);

    for (const task of displayedTasks) {
      const parsed = parseDateString(task.dueDate);
      if (parsed) {
        const key = formatDateKey(parsed);
        if (map.has(key)) {
          map.get(key)!.push(task);
          continue;
        }
      }
      if (map.has(fallbackKey)) {
        map.get(fallbackKey)!.push(task);
      } else {
        const firstKey = formatDateKey(weekDays[0]!);
        map.get(firstKey)?.push(task);
      }
    }
    return map;
  }, [displayedTasks, weekDays, weekDateKeys, todayKey]);

  // Dual-Surface Task Distribution Map for Month View
  const tasksByMonthDay = useMemo(() => {
    const map = new Map<string, AssignableTaskOption[]>();
    for (const cell of monthDays) {
      map.set(formatDateKey(cell.date), []);
    }

    const fallbackKey = map.has(todayKey) ? todayKey : formatDateKey(monthDays[0]!.date);

    for (const task of displayedTasks) {
      const parsed = parseDateString(task.dueDate);
      if (parsed) {
        const key = formatDateKey(parsed);
        if (map.has(key)) {
          map.get(key)!.push(task);
          continue;
        }
      }
      if (map.has(fallbackKey)) {
        map.get(fallbackKey)!.push(task);
      } else {
        const firstKey = formatDateKey(monthDays[0]!.date);
        map.get(firstKey)?.push(task);
      }
    }
    return map;
  }, [displayedTasks, monthDays, todayKey]);

  // Resolve live selected task so status updates inside TaskDetailModal reflect immediately
  const activeSelectedTask = useMemo(() => {
    if (!selectedTaskForDetail) return null;
    return tasks.find((t) => t.taskId === selectedTaskForDetail.taskId) || selectedTaskForDetail;
  }, [selectedTaskForDetail, tasks]);

  // Construct Task for TaskDetailModal fallback
  const detailTask: Task | null = activeSelectedTask
    ? activeSelectedTask.rawTask || {
        id: activeSelectedTask.taskId,
        workRequestId: activeSelectedTask.workRequestId,
        title: activeSelectedTask.taskTitle,
        description: null,
        status: (activeSelectedTask.status as Task['status']) || 'In Progress',
        phase: (activeSelectedTask.phase as Task['phase']) || 'processing',
        qaStatus: 'none',
        phaseEnteredAt: null,
        assigneeId: activeSelectedTask.assigneeId || null,
        assigneeName: activeSelectedTask.assigneeName || null,
        assignees: activeSelectedTask.assigneeId ? [activeSelectedTask.assigneeId] : [],
        predecessors: [],
        dueDate: activeSelectedTask.dueDate || null,
        requiredLinkType: null,
        displayOrder: 0,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: activeSelectedTask.updatedAt || new Date().toISOString(),
      }
    : null;

  // Uncramped, highly compressed calendar task card for long daily lists
  const renderTaskCard = (task: AssignableTaskOption) => {
    const theme = getStickyNoteTheme(task, today);
    const phaseLabel = formatPhase(task.phase || null);

    // Compute assignees list with fallback for avatars
    const assignees = task.assigneesList && task.assigneesList.length > 0
      ? task.assigneesList
      : [
          {
            id: task.assigneeId || 'primary',
            name: task.assigneeName || 'Assigned Operator',
            role: task.assigneeRole || 'Staff',
          },
        ];

    const coCount = (task.coAssigneeCount ?? 0) > 0
      ? task.coAssigneeCount!
      : assignees.length > 1
      ? assignees.length - 1
      : 0;

    const visibleAssignees = assignees.slice(0, 3);
    const remainingCount = assignees.length > 3
      ? assignees.length - 3
      : coCount > 0 && assignees.length <= 1
      ? coCount
      : 0;

    const cardPaddingClass = view === 'month' ? 'p-2' : view === 'week' || view === 'agenda' ? 'p-2.5' : 'p-3';

    return (
      <div
        key={task.taskId}
        onClick={() => setSelectedTaskForDetail(task)}
        className={`group relative flex flex-col ${cardPaddingClass} rounded-[8px] border-[1.5px] ${theme.bg} ${theme.border} ${theme.hoverBorder} shadow-2xs hover:shadow-md transition-all duration-150 cursor-pointer text-left overflow-hidden min-w-0`}
        data-testid={`pending-task-${task.taskId}`}
      >
        {/* 1. Top Meta Row: Entity badge + Phase badge + Status pill */}
        <div className="flex flex-wrap items-center gap-1 pb-1">
          <Badge
            variant={task.entity === 'LTA' ? 'lta' : 'ata'}
            size="compact"
            className="rounded-[4px] text-xs font-bold"
          >
            {task.entity}
          </Badge>
          {phaseLabel && (
            <Badge
              variant="secondary"
              size="compact"
              className="rounded-[4px] text-xs border border-[#CBD5E1] bg-white/90 text-[#0F172A] font-medium"
            >
              {phaseLabel}
            </Badge>
          )}
          <span
            className={`text-xs font-semibold px-1.5 py-0.2 rounded-[4px] border ${theme.badgeBg} ${theme.badgeText} ${theme.badgeBorder} flex items-center gap-1`}
          >
            {task.status === 'Completed' ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <Clock className="h-3 w-3" />
            )}
            {task.status}
          </span>
          {/* Due date pill ONLY rendered in agenda view */}
          {view === 'agenda' && (
            <span className="text-xs font-mono text-[#334155] ml-auto">
              {task.dueDate ? `Due ${formatDueDate(task.dueDate)}` : 'Rolling · Today'}
            </span>
          )}
        </div>

        {/* 2. Task Title: text-sm bold break-words */}
        <div className="pt-0.5 pb-0.5 min-w-0">
          <h3 className={`font-bold text-sm leading-snug break-words ${theme.ink}`}>
            {task.taskTitle}
          </h3>
        </div>

        {/* 3. Work Request & Client: clean minimal rows */}
        <div className="space-y-0.5 text-xs text-[#1E293B] min-w-0">
          <div className="flex items-center gap-1 min-w-0">
            <FileText className="h-3.5 w-3.5 shrink-0 text-[#475569]" />
            <span className="truncate font-medium">{task.workRequestTitle}</span>
          </div>
          {task.clientName && (
            <div className="flex items-center gap-1 min-w-0 text-[#475569]">
              <Building className="h-3.5 w-3.5 shrink-0 text-[#64748B]" />
              <span className="truncate">{task.clientName}</span>
            </div>
          )}
        </div>

        {/* 4. Bottom Footer Bar: Avatars on Left, Simplified Action Buttons on Right */}
        <div className="flex items-center justify-between gap-1.5 pt-1.5 mt-1 border-t border-black/10">
          {/* Left: Overlapping circular avatars */}
          <div
            className="flex items-center -space-x-1.5 min-w-0"
            title={assignees.map((p) => p.name).join(', ')}
          >
            {visibleAssignees.map((person, idx) => (
              <div
                key={person.id || idx}
                className="h-6 w-6 rounded-full border-[1.5px] border-white bg-white text-xs font-bold flex items-center justify-center shadow-2xs shrink-0"
                style={{ backgroundColor: theme.avatarBg, color: '#FFFFFF' }}
                title={`${person.name}${person.role ? ` · ${person.role}` : ''}`}
              >
                {getInitials(person.name)}
              </div>
            ))}
            {remainingCount > 0 && (
              <div
                className="h-6 min-w-[24px] px-1 rounded-full border-[1.5px] border-white bg-white text-[#0F172A] text-xs font-bold flex items-center justify-center shadow-2xs shrink-0 font-mono"
                title={`+${remainingCount} more assignees`}
              >
                +{remainingCount}
              </div>
            )}
            {/* Screen reader text for test accessibility & query matching */}
            <span className="sr-only">
              {task.assigneeName || 'Assigned Operator'} {task.assigneeRole || 'Staff'}{' '}
              {coCount > 0 ? `+${coCount}` : ''}
            </span>
          </div>

          {/* Right: Simplified Action Icon Buttons */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePinToTimer(task.taskId);
              }}
              className="h-6 px-1.5 rounded-[5px] border border-black/15 bg-[#FFFFFF]/85 hover:bg-[#FFFFFF] inline-flex items-center gap-1 text-xs font-semibold cursor-pointer shadow-2xs transition-colors"
              data-testid={`quick-log-task-btn-${task.taskId}`}
              title="Pin to Timer"
            >
              <Clock className="h-3 w-3 shrink-0 text-[#1D4ED8]" />
              {view === 'agenda' ? <span>Pin</span> : <span className="sr-only">Pin to Timer</span>}
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleNavigateToTask(task);
              }}
              className="h-6 w-6 rounded-[5px] border border-black/15 bg-[#FFFFFF]/85 hover:bg-[#FFFFFF] inline-flex items-center justify-center text-xs font-semibold cursor-pointer shadow-2xs transition-colors"
              data-testid={`view-task-btn-${task.taskId}`}
              title="View in Operations"
            >
              <ExternalLink className="h-3 w-3 shrink-0 text-[#475569]" />
              <span className="sr-only">View in Operations</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Card
      data-testid="pending-tasks-card"
      className="border border-[#CBD5E1] bg-[#FFFFFF] rounded-[8px] shadow-card overflow-hidden w-full"
    >
      {/* 1. Top Calendar Command Header */}
      <CardHeader className="p-4 sm:p-5 border-b border-[#CBD5E1] space-y-3.5">
        {/* Row 1: Title + Count Badge (Left) & Date Nav + Range + View Switcher (Right) */}
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
          {/* Title + Inline Count Badge */}
          <div className="flex flex-wrap items-center gap-2.5">
            <CardTitle className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
              <CalendarIcon className="h-5 w-5 text-[#1D4ED8]" />
              Pending Tasks Assigned to Me
            </CardTitle>
            <Badge
              variant={pendingTasks.length > 0 ? 'warning' : 'success'}
              className="text-xs tabular-nums rounded-[6px] border border-[#CBD5E1] px-2.5 py-1 font-semibold"
              data-testid="pending-tasks-count-badge"
            >
              <span data-testid="pending-tasks-count">
                {pendingTasks.length} {pendingTasks.length === 1 ? 'Task' : 'Tasks'} Incomplete
              </span>
            </Badge>
          </div>

          {/* Right Controls: Date Navigation, Range Pill, and View Switcher */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Date Navigation Bar */}
            <div className="flex items-center bg-[#F1F5F9] p-0.5 rounded-[6px] border border-[#CBD5E1]">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handlePrev}
                className="h-7 w-7 p-0 rounded-[4px] text-[#0F172A] hover:bg-[#E2E8F0]"
                data-testid="calendar-prev-btn"
                title="Previous"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleToday}
                className="h-7 px-2.5 text-xs font-semibold text-[#0F172A] hover:bg-[#E2E8F0]"
                data-testid="calendar-today-btn"
              >
                Today
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleNext}
                className="h-7 w-7 p-0 rounded-[4px] text-[#0F172A] hover:bg-[#E2E8F0]"
                data-testid="calendar-next-btn"
                title="Next"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Active Date Range Readout */}
            <div className="px-2.5 py-1 rounded-[6px] bg-[#FFFFFF] border border-[#CBD5E1] font-mono tabular-nums text-xs font-semibold text-[#0F172A] shadow-2xs">
              {dateRangeLabel}
            </div>

            {/* Multi-View Switcher */}
            <div
              className="flex items-center bg-[#F1F5F9] p-0.5 rounded-[6px] border border-[#CBD5E1]"
              data-testid="calendar-view-switcher"
            >
              <button
                type="button"
                onClick={() => setView('week')}
                className={`px-2.5 py-1 rounded-[4px] text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                  view === 'week'
                    ? 'bg-[#FFFFFF] text-[#0F172A] shadow-2xs font-semibold'
                    : 'text-[#475569] hover:text-[#0F172A]'
                }`}
                data-testid="calendar-view-week"
              >
                <CalendarRange className="h-3.5 w-3.5 text-[#1D4ED8]" />
                Week
              </button>
              <button
                type="button"
                onClick={() => setView('month')}
                className={`px-2.5 py-1 rounded-[4px] text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                  view === 'month'
                    ? 'bg-[#FFFFFF] text-[#0F172A] shadow-2xs font-semibold'
                    : 'text-[#475569] hover:text-[#0F172A]'
                }`}
                data-testid="calendar-view-month"
              >
                <CalendarDays className="h-3.5 w-3.5 text-[#1D4ED8]" />
                Month
              </button>
              <button
                type="button"
                onClick={() => setView('agenda')}
                className={`px-2.5 py-1 rounded-[4px] text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                  view === 'agenda'
                    ? 'bg-[#FFFFFF] text-[#0F172A] shadow-2xs font-semibold'
                    : 'text-[#475569] hover:text-[#0F172A]'
                }`}
                data-testid="calendar-view-agenda"
              >
                <ListOrdered className="h-3.5 w-3.5 text-[#1D4ED8]" />
                Agenda
              </button>
              <button
                type="button"
                onClick={() => setView('board')}
                className={`px-2.5 py-1 rounded-[4px] text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1 ${
                  view === 'board'
                    ? 'bg-[#FFFFFF] text-[#0F172A] shadow-2xs font-semibold'
                    : 'text-[#475569] hover:text-[#0F172A]'
                }`}
                data-testid="calendar-view-board"
              >
                <Kanban className="h-3.5 w-3.5 text-[#1D4ED8]" />
                Board
              </button>
            </div>
          </div>
        </div>

        {/* Row 2: Search Input (Left), Visual Legend (Center), Status + Assignee Filters (Right) */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 pt-1 border-t border-[#CBD5E1]/60">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#64748B]" />
            <Input
              type="text"
              placeholder="Search tasks, requests, clients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs bg-[#FFFFFF] border-[#CBD5E1] rounded-[6px] focus-visible:ring-1 focus-visible:ring-[#1D4ED8]"
              data-testid="pending-tasks-search"
            />
          </div>

          {/* Visual Color Key / Legend */}
          <div className="flex items-center gap-2 text-xs font-medium text-[#475569]">
            <span className="text-xs uppercase font-bold text-[#64748B]">Legend:</span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#3B82F6] border border-[#2563EB]" />
              <span>ATA</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#F59E0B] border border-[#D97706]" />
              <span>LTA</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#8B5CF6] border border-[#7C3AED]" />
              <span>No Due Date</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#F43F5E] border border-[#E11D48]" />
              <span>Overdue</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] border border-[#059669]" />
              <span>Complete</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter Pills */}
            <div className="flex items-center bg-[#F1F5F9] p-0.5 rounded-[6px] border border-[#CBD5E1] text-xs">
              {(
                [
                  { id: 'all', label: 'All Statuses' },
                  { id: 'not_started', label: 'Not Started' },
                  { id: 'in_progress', label: 'In Progress' },
                  { id: 'completed', label: 'Completed' },
                  { id: 'blocked', label: 'Blocked / Urgent' },
                ] as const
              ).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStatusFilter(s.id)}
                  className={`px-2 py-0.5 rounded-[4px] font-medium transition-colors cursor-pointer ${
                    statusFilter === s.id
                      ? 'bg-[#FFFFFF] text-[#0F172A] font-semibold shadow-2xs'
                      : 'text-[#475569] hover:text-[#0F172A]'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Assignee Filter Pills */}
            <div className="flex items-center bg-[#F1F5F9] p-0.5 rounded-[6px] border border-[#CBD5E1] text-xs">
              <button
                type="button"
                onClick={() => setAssigneeFilter('all')}
                className={`px-2 py-0.5 rounded-[4px] font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                  assigneeFilter === 'all'
                    ? 'bg-[#FFFFFF] text-[#0F172A] font-semibold shadow-2xs'
                    : 'text-[#475569] hover:text-[#0F172A]'
                }`}
              >
                <Users className="h-3 w-3" />
                All Assignees
              </button>
              <button
                type="button"
                onClick={() => setAssigneeFilter('me')}
                className={`px-2 py-0.5 rounded-[4px] font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                  assigneeFilter === 'me'
                    ? 'bg-[#FFFFFF] text-[#0F172A] font-semibold shadow-2xs'
                    : 'text-[#475569] hover:text-[#0F172A]'
                }`}
              >
                <User className="h-3 w-3" />
                Assigned to Me
              </button>
            </div>
          </div>
        </div>
      </CardHeader>

      {/* 2. Full-Width Calendar Canvas */}
      <CardContent className="p-4 sm:p-5">
        {isLoading ? (
          <div className="p-12 text-center text-xs text-[#475569]" data-testid="pending-tasks-loading">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-solid border-[#CBD5E1] border-r-transparent mb-2 align-middle" />
            <p className="font-medium">Loading schedule and assigned tasks...</p>
          </div>
        ) : calendarTasks.length === 0 ? (
          <div
            className="p-8 text-center bg-[#FFFFFF] border border-[#CBD5E1] rounded-[8px] space-y-2 shadow-2xs"
            data-testid="pending-tasks-empty"
          >
            <CheckCircle2 className="h-8 w-8 text-[#166534] mx-auto" />
            <h4 className="text-sm font-bold text-[#0F172A]">All caught up!</h4>
            <p className="text-xs text-[#475569] max-w-sm mx-auto">
              You have no incomplete tasks assigned to you in active work requests.
            </p>
          </div>
        ) : (
          <div className="w-full space-y-3" data-testid="pending-tasks-list">
            {pendingTasks.length === 0 && (
              <div
                className="px-3.5 py-2.5 bg-[#ECFDF5] border border-[#10B981] rounded-[8px] flex items-center justify-between gap-2 shadow-2xs"
                data-testid="pending-tasks-empty"
              >
                <div className="flex items-center gap-2 text-xs text-[#065F46]">
                  <CheckCircle2 className="h-4 w-4 text-[#059669] shrink-0" />
                  <span className="font-bold">All caught up!</span>
                  <span>
                    You have no incomplete tasks assigned to you in active work requests. Completed tasks remain visible below.
                  </span>
                </div>
              </div>
            )}
            {/* 1. WEEK VIEW (DEFAULT) — 7 Full-Width Columns with tightly spaced cards */}
            {view === 'week' && (
              <div className="w-full">
                <div className="grid grid-cols-1 md:grid-cols-7 border border-[#CBD5E1] rounded-[8px] overflow-hidden divide-y md:divide-y-0 md:divide-x divide-[#CBD5E1] bg-[#FFFFFF] min-h-[500px]">
                  {weekDays.map((dayDate) => {
                    const dayKey = formatDateKey(dayDate);
                    const isToday = dayKey === todayKey;
                    const dayTasks = tasksByWeekDay.get(dayKey) || [];

                    return (
                      <div key={dayKey} className="flex flex-col min-h-[460px] bg-[#FFFFFF] min-w-0">
                        {/* Column Header */}
                        <div
                          className={`p-2 text-center border-b border-[#CBD5E1] ${
                            isToday ? 'bg-[#EFF6FF]' : 'bg-[#F1F5F9]'
                          }`}
                        >
                          <span className="block text-xs uppercase font-bold tracking-wider text-[#64748B]">
                            {dayDate.toLocaleDateString('en-US', { weekday: 'short' })}
                          </span>
                          <div className="flex items-center justify-center gap-1.5 mt-0.5">
                            <span
                              className={`text-xs font-mono font-bold tabular-nums ${
                                isToday
                                  ? 'bg-[#1D4ED8] text-white px-2 py-0.5 rounded-[4px]'
                                  : 'text-[#0F172A]'
                              }`}
                            >
                              {dayDate.getDate()}
                            </span>
                            {isToday && (
                              <span className="text-xs font-bold text-[#1D4ED8]">TODAY</span>
                            )}
                          </div>
                        </div>

                        {/* Column Task List with compressed gap-1.5 */}
                        <div className="p-2 space-y-1.5 flex-1 bg-[#F8FAFC]/50 overflow-y-auto">
                          {dayTasks.map((task) => renderTaskCard(task))}
                          {dayTasks.length === 0 && (
                            <div className="h-20 flex items-center justify-center text-xs text-[#94A3B8] italic border border-dashed border-[#CBD5E1]/60 rounded-[6px]">
                              No tasks
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2. MONTH VIEW */}
            {view === 'month' && (
              <div className="w-full">
                <div className="grid grid-cols-7 border border-[#CBD5E1] rounded-[8px] overflow-hidden divide-y divide-[#CBD5E1] text-xs bg-white">
                  {/* Header Row */}
                  <div className="col-span-7 grid grid-cols-7 bg-[#F1F5F9] font-bold text-[#64748B] text-center py-2 border-b border-[#CBD5E1]">
                    <span>Sunday</span>
                    <span>Monday</span>
                    <span>Tuesday</span>
                    <span>Wednesday</span>
                    <span>Thursday</span>
                    <span>Friday</span>
                    <span>Saturday</span>
                  </div>

                  {/* Month Matrix Cells */}
                  {monthDays.map((cell, idx) => {
                    const dayKey = formatDateKey(cell.date);
                    const isToday = dayKey === todayKey;
                    const dayTasks = tasksByMonthDay.get(dayKey) || [];

                    return (
                      <div
                        key={idx}
                        className={`min-h-[105px] p-1.5 border-r border-[#CBD5E1] last:border-r-0 flex flex-col min-w-0 ${
                          cell.isCurrentMonth ? 'bg-white' : 'bg-[#F8FAFC]/70'
                        } ${isToday ? 'ring-1 ring-[#1D4ED8] bg-[#EFF6FF]/30' : ''}`}
                      >
                        <div className="flex items-center justify-between pb-1">
                          <span
                            className={`text-xs font-mono font-bold tabular-nums ${
                              isToday
                                ? 'bg-[#1D4ED8] text-white px-1.5 py-0.5 rounded-[4px]'
                                : cell.isCurrentMonth
                                ? 'text-[#0F172A]'
                                : 'text-[#94A3B8]'
                            }`}
                          >
                            {cell.date.getDate()}
                          </span>
                          {isToday && (
                            <span className="text-xs font-bold text-[#1D4ED8]">Today</span>
                          )}
                        </div>

                        <div className="space-y-1.5 flex-1 overflow-y-auto">
                          {dayTasks.map((task) => renderTaskCard(task))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 3. AGENDA VIEW */}
            {view === 'agenda' && (
              <div className="space-y-4 max-w-4xl mx-auto w-full">
                {displayedTasks.length === 0 ? (
                  <div className="p-8 text-center bg-[#F8FAFC] border border-[#CBD5E1] rounded-[6px] text-xs text-[#64748B]">
                    No pending tasks match the active filters.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {displayedTasks.map((task) => (
                      <div key={task.taskId} className="w-full">
                        {renderTaskCard(task)}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 4. BOARD / PINBOARD VIEW */}
            {view === 'board' && (
              <div className="bg-[#F8FAFC] bg-[radial-gradient(#CBD5E1_1px,transparent_1px)] [background-size:16px_16px] p-4 rounded-[8px] border border-[#CBD5E1] w-full">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                  {displayedTasks.map((task) => renderTaskCard(task))}
                </div>
              </div>
            )}

            {/* Zero Filter Matches State */}
            {displayedTasks.length === 0 && calendarTasks.length > 0 && (
              <div className="p-8 text-center bg-white rounded-[6px] border border-[#CBD5E1] space-y-2 mt-4">
                <p className="text-xs text-[#475569]">
                  No tasks match the active filters or search query.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                    setAssigneeFilter('all');
                  }}
                  className="text-xs h-7 rounded-[6px]"
                >
                  Reset All Filters
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>

      {/* Task Detail Modal View on Card Click */}
      <TaskDetailModal
        isOpen={Boolean(activeSelectedTask)}
        onClose={() => setSelectedTaskForDetail(null)}
        task={detailTask}
        workRequest={activeSelectedTask?.rawWorkRequest || null}
      />
    </Card>
  );
}
