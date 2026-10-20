import React, { useState, useMemo, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Send,
  ArrowRight,
  User,
  Calendar,
  Layers,
  CheckSquare,
  Edit3,
  Plus,
  MoreVertical,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { PresenceAvatars } from '@/components/common/PresenceAvatars';
import {
  useWorkRequests,
  useWorkRequestDetail,
} from '../api/useWorkRequests';
import { useWorkRequestTasks, useTaskMutations } from '../api/useTasks';
import { usePhaseTransitions } from '../api/usePhaseTransitions';
import { useQaReview } from '../api/useQaReview';
import { runBlockingAction } from './BlockingActionModal';
import { RerouteModal } from './RerouteModal';
import { WorkRequestModal } from './WorkRequestModal';
import { TaskDetailModal } from './TaskDetailModal';
import { QuickAddCard } from './QuickAddCard';
import { operationsKeys } from '../api/queryKeys';
import { getPhaseBadgeInfo, getStatusBadgeInfo } from '../lib/statusBadges';
import { useSearchParams, useInRouterContext } from 'react-router-dom';
import { useSessionStore } from '@/lib/session';
import { hasPermission } from '@/lib/permissions';
import { isUserAdmin } from '../lib/taskScope';
import type {
  Phase,
  Task,
  WorkRequest,
  AdvancePhaseTarget,
} from '../api/types';

const PHASES: Array<{ id: Phase; label: string; number: number }> = [
  { id: 'pre_processing', label: 'Pre-processing', number: 1 },
  { id: 'processing', label: 'Processing', number: 2 },
  { id: 'quality_assurance', label: 'Quality Assurance', number: 3 },
  { id: 'completion', label: 'Completion', number: 4 },
];

export interface PhaseKanbanBoardProps {
  initialWorkRequestId?: string;
  onEditWorkRequest?: (wr: WorkRequest) => void;
}

interface PhaseKanbanBoardInnerProps extends PhaseKanbanBoardProps {
  searchParams: URLSearchParams;
  setSearchParams: (setter: (prev: URLSearchParams) => URLSearchParams) => void;
}

function PhaseKanbanBoardInner({
  initialWorkRequestId,
  onEditWorkRequest,
  searchParams,
  setSearchParams,
}: PhaseKanbanBoardInnerProps) {
  // Session & RBAC
  const permissions = useSessionStore((state) => state.permissions);
  const activeEntity = useSessionStore((state) => state.activeEntity);
  const currentUser = useSessionStore((state) => state.user);
  const isAdmin = isUserAdmin(currentUser);
  const canAdvance = hasPermission(permissions, 'workflow:phase_transition');
  const canRequestTransition =
    hasPermission(permissions, 'workflow:transition_request') ||
    hasPermission(permissions, 'workflow:edit');
  const canQaReview = hasPermission(permissions, 'workflow:qa_review');
  const canEdit = hasPermission(permissions, 'workflow:edit');

  // Work Request Selection
  const { data: rawRequests, isLoading: isLoadingWrs } = useWorkRequests({
    archived: false,
  });
  const workRequests: WorkRequest[] = useMemo(() => {
    if (Array.isArray(rawRequests)) return rawRequests;
    return rawRequests?.data ?? [];
  }, [rawRequests]);

  const [selectedWrId, setSelectedWrId] = useState<string>(() => {
    return searchParams.get('wrId') || initialWorkRequestId || '';
  });

  const urlWrId = searchParams.get('wrId');
  React.useEffect(() => {
    if (urlWrId && urlWrId !== selectedWrId && workRequests.some((w) => w.id === urlWrId)) {
      setSelectedWrId(urlWrId);
    }
  }, [urlWrId, selectedWrId, workRequests]);

  // Keep selected ID in sync if empty or invalid for active entity (e.g. after entity switch)
  React.useEffect(() => {
    if (workRequests.length > 0) {
      const exists = workRequests.some((w) => w.id === selectedWrId);
      if (!selectedWrId || !exists) {
        const fallbackId = workRequests[0]?.id || '';
        if (fallbackId) {
          setSelectedWrId(fallbackId);
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('wrId', fallbackId);
            return next;
          });
        }
      }
    }
  }, [selectedWrId, workRequests, setSearchParams]);

  const handleSelectWr = (id: string) => {
    setSelectedWrId(id);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('wrId', id);
      return next;
    });
  };

  const effectiveWrId = selectedWrId || (workRequests[0]?.id ?? '');

  // Active Work Request Details & Tasks
  const { data: currentWr } = useWorkRequestDetail(effectiveWrId);
  const { data: tasks = [] } = useWorkRequestTasks(effectiveWrId, {
    enabled: Boolean(effectiveWrId),
  });

  // Mutations
  const { advancePhase, requestTransition } = usePhaseTransitions(effectiveWrId);
  const { submitQaReview } = useQaReview(effectiveWrId);
  const { createTask, deleteTask } = useTaskMutations(effectiveWrId);
  const canAddTask =
    hasPermission(permissions, 'workflow:task_add') ||
    hasPermission(permissions, 'workflow:edit');

  const [taskToDelete, setTaskToDelete] = useState<{
    id: string;
    title: string;
    assigneeName?: string | null;
  } | null>(null);
  const [isDeletingTask, setIsDeletingTask] = useState(false);

  const handleConfirmDeleteTask = async () => {
    if (!taskToDelete) return;
    setIsDeletingTask(true);
    try {
      await deleteTask(taskToDelete.id);
      if (selectedTask?.id === taskToDelete.id) {
        setSelectedTask(null);
      }
      setTaskToDelete(null);
    } catch (err) {
      console.error('Failed to delete task:', err);
    } finally {
      setIsDeletingTask(false);
    }
  };

  // Quick-Add Task State (UAT2-10)
  const [quickAddPhase, setQuickAddPhase] = useState<Phase | null>(null);
  // Dismiss drafts when the board context changes; each card owns its input state.
  useEffect(() => {
    setQuickAddPhase(null);
  }, [effectiveWrId, activeEntity, canAddTask, currentWr?.status]);

  // Modal States
  const [isRerouteOpen, setIsRerouteOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  // Task Detail Modal State (UAT-OPS4)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Keep selectedTask synchronized with live TanStack Query cache
  useEffect(() => {
    if (selectedTask?.id && tasks.length > 0) {
      const latest = tasks.find((t) => t.id === selectedTask.id);
      if (!latest) {
        // If task was purged from tasks list while belonging to this WR, deselect
        if (selectedTask.workRequestId === effectiveWrId) {
          setSelectedTask(null);
        }
        return;
      }

      const recLatest = (latest as unknown as Record<string, unknown>) || {};
      const recSelected = (selectedTask as unknown as Record<string, unknown>) || {};

      // If task was soft-deleted, deselect immediately
      if (recLatest.deletedAt || recLatest.deleted_at) {
        setSelectedTask(null);
        return;
      }

      // Synchronize if version, status, QA status, or attributes have mutated
      if (
        latest.version !== selectedTask.version ||
        latest.qaStatus !== selectedTask.qaStatus ||
        latest.status !== selectedTask.status ||
        recLatest.qa_status !== recSelected.qa_status ||
        latest.assigneeId !== selectedTask.assigneeId ||
        latest.assigneeName !== selectedTask.assigneeName ||
        latest.title !== selectedTask.title ||
        latest.description !== selectedTask.description ||
        latest.dueDate !== selectedTask.dueDate ||
        latest.phase !== selectedTask.phase
      ) {
        setSelectedTask(latest);
      }
    }
  }, [tasks, selectedTask, effectiveWrId]);

  // Support deep link ?taskId=xxx with soft-delete exclusion
  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.location) {
        const urlParams = new URLSearchParams(window.location.search);
        const taskIdParam = urlParams.get('taskId');
        if (taskIdParam && tasks.length > 0) {
          const found = tasks.find((t) => {
            const rec = (t as unknown as Record<string, unknown>) || {};
            return t.id === taskIdParam && !rec.deletedAt && !rec.deleted_at;
          });
          if (found) {
            setSelectedTask(found);
          }
        }
      }
    } catch {
      // ignore
    }
  }, [tasks]);

  const activeWr = currentWr || workRequests.find((w) => w.id === effectiveWrId);
  const currentPhase: Phase = (activeWr?.phase as Phase) || 'pre_processing';

  // Task Gate & Blocker Logic
  const gateInfo = useMemo(() => {
    const activeTasks = tasks.filter((t) => {
      const rec = (t as unknown as Record<string, unknown>) || {};
      return t.status !== 'Cancelled' && !rec.deletedAt && !rec.deleted_at;
    });
    const preTasks = activeTasks.filter((t) => t.phase === 'pre_processing');
    const procTasks = activeTasks.filter((t) => t.phase === 'processing');

    const preIncomplete = preTasks.filter((t) => t.status !== 'Completed');
    const procIncomplete = procTasks.filter((t) => t.status !== 'Completed');
    const qaIncomplete = activeTasks.filter((t) => {
      const rec = (t as unknown as Record<string, unknown>) || {};
      return t.status !== 'Completed' || (t.qaStatus !== 'passed' && rec.qa_status !== 'passed');
    });
    const qaFailed = activeTasks.filter((t) => {
      const rec = (t as unknown as Record<string, unknown>) || {};
      return t.qaStatus === 'failed' || rec.qa_status === 'failed';
    });

    return {
      pre: {
        total: preTasks.length,
        completed: preTasks.filter((t) => t.status === 'Completed').length,
        incomplete: preIncomplete,
        canAdvance: preTasks.length > 0 && preIncomplete.length === 0,
      },
      proc: {
        total: procTasks.length,
        completed: procTasks.filter((t) => t.status === 'Completed').length,
        incomplete: procIncomplete,
        canAdvance: procTasks.length > 0 && procIncomplete.length === 0,
      },
      qa: {
        total: activeTasks.length,
        completed: activeTasks.filter(
          (t) => t.status === 'Completed' && t.qaStatus === 'passed'
        ).length,
        incomplete: qaIncomplete,
        failed: qaFailed,
        canAdvance: activeTasks.length > 0 && qaIncomplete.length === 0,
      },
    };
  }, [tasks]);

  // Handle Advance Phase
  const handleAdvance = async (targetPhase: AdvancePhaseTarget) => {
    if (!effectiveWrId) return;

    await runBlockingAction({
      title: 'Advancing Lifecycle Phase',
      message: `Advancing work request to ${targetPhase.replace('_', ' ')}...`,
      apiCall: async () => {
        return await advancePhase({
          workRequestId: effectiveWrId,
          to_phase: targetPhase,
        });
      },
      successTitle: 'Phase Advanced',
      successMessage: `Successfully advanced to ${targetPhase.replace('_', ' ')}.`,
      invalidateQueries: [
        operationsKeys.workRequestDetail(effectiveWrId),
        operationsKeys.tasks(effectiveWrId),
        operationsKeys.workRequests(),
      ],
    });
  };

  // Handle Manager Transition Request
  const handleRequestTransition = async (from: Phase, to: Phase) => {
    if (!effectiveWrId) return;

    await runBlockingAction({
      title: 'Submitting Transition Request',
      message: `Requesting advancement from ${from.replace('_', ' ')} to ${to.replace('_', ' ')}...`,
      apiCall: async () => {
        return await requestTransition({
          workRequestId: effectiveWrId,
          from_phase: from,
          to_phase: to,
          notes: 'Prerequisites met. Ready for administrative review.',
        });
      },
      successTitle: 'Transition Requested',
      successMessage: 'Admin has been notified for phase advancement review.',
      invalidateQueries: [
        operationsKeys.requests(),
        operationsKeys.requestCounts(activeEntity),
      ],
    });
  };

  // Handle QA Pass / Fail
  const handleQaReview = async (taskId: string, verdict: 'passed' | 'failed') => {
    if (!effectiveWrId) return;

    await runBlockingAction({
      title: verdict === 'passed' ? 'Approving QA Task' : 'Rejecting QA Task',
      message: `Setting compliance status to ${verdict}...`,
      apiCall: async () => {
        return await submitQaReview({
          workRequestId: effectiveWrId,
          results: [
            {
              task_id: taskId,
              qa_status: verdict,
              taskId,
              qaStatus: verdict,
            },
          ],
        });
      },
      successTitle: 'QA Review Recorded',
      successMessage: `Task marked as ${verdict}.`,
      invalidateQueries: [
        operationsKeys.tasks(effectiveWrId),
        operationsKeys.workRequestDetail(effectiveWrId),
      ],
    });
  };

  if (isLoadingWrs) {
    return (
      <div className="p-12 text-center text-xs font-mono uppercase tracking-wider text-[#4A4945] bg-[#FAF9F5] border border-[#0A0A0A] rounded-none">
        Loading operations kanban board...
      </div>
    );
  }

  if (workRequests.length === 0) {
    return (
      <div
        className="p-12 text-center bg-[#FAF9F5] border border-[#0A0A0A] rounded-none space-y-3"
        data-testid="kanban-empty-state"
      >
        <div className="p-3 bg-[#EAE8E3] rounded-none border border-[#0A0A0A] text-[#0A0A0A] w-fit mx-auto">
          <Layers className="h-8 w-8" />
        </div>
        <h4 className="text-sm font-bold text-[#0A0A0A] uppercase tracking-wider">
          No active work requests found
        </h4>
        <p className="text-xs font-mono text-[#4A4945]">
          Create a new work request to view and govern its 4-phase lifecycle kanban board.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="phase-kanban-board">
      {/* 1. Header Toolbar & Work Request Selector */}
      <div className="p-4 bg-[#FAF9F5] border border-[#0A0A0A] rounded-none shadow-none flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-72">
            <label className="text-xs font-mono uppercase tracking-wider font-bold text-[#0A0A0A] block mb-1">
              Select Work Request
            </label>
            <Select value={effectiveWrId} onValueChange={handleSelectWr}>
              <SelectTrigger
                className="h-9 text-xs font-mono rounded-none border border-[#0A0A0A] bg-[#FAF9F5] text-[#0A0A0A]"
                data-testid="kanban-wr-select"
              >
                <SelectValue placeholder="Choose a work request" />
              </SelectTrigger>
              <SelectContent className="rounded-none border-2 border-[#0A0A0A] bg-[#FAF9F5]">
                {workRequests.map((wr) => (
                  <SelectItem key={wr.id} value={wr.id} className="text-xs font-mono">
                    {wr.title} ({wr.entity})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {activeWr && (
            <div className="flex items-center gap-2 pt-4">
              <Badge variant={activeWr.entity === 'LTA' ? 'lta' : 'ata'} size="compact">
                {activeWr.entity}
              </Badge>
              <Badge
                variant={
                  activeWr.priority === 'Urgent'
                    ? 'destructive'
                    : activeWr.priority === 'High'
                      ? 'warning'
                      : 'secondary'
                }
                size="compact"
              >
                {activeWr.priority.endsWith('Priority') ? activeWr.priority : `${activeWr.priority} Priority`}
              </Badge>
              {(() => {
                const phaseInfo = getPhaseBadgeInfo(activeWr.phase);
                const statusInfo = getStatusBadgeInfo(activeWr.status);
                const PhaseIcon = phaseInfo.Icon;
                const StatusIcon = statusInfo.Icon;
                return (
                  <>
                    <span
                      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-none font-mono uppercase tracking-wider text-xs font-bold border border-[#0A0A0A] bg-[#EAE8E3] text-[#0A0A0A]`}
                      title={`Phase: ${phaseInfo.label}`}
                    >
                      <PhaseIcon className="w-3.5 h-3.5 shrink-0" />
                      <span>Phase: {phaseInfo.label}</span>
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-none font-mono uppercase tracking-wider text-xs font-bold border border-[#0A0A0A] bg-[#FAF9F5] text-[#0A0A0A]`}
                      title={`Status: ${statusInfo.label}`}
                    >
                      <StatusIcon className="w-3 h-3 shrink-0" />
                      <span>{statusInfo.label}</span>
                    </span>
                    {activeWr.dueDate && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-none font-mono text-xs font-bold bg-[#EAE8E3] text-[#0A0A0A] border border-[#0A0A0A]">
                        <Calendar className="w-3 h-3 text-[#4A4945]" />
                        <span>Due: {new Date(activeWr.dueDate).toLocaleDateString()}</span>
                      </span>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {effectiveWrId && <PresenceAvatars roomId={effectiveWrId} />}
          {activeWr && canEdit && activeWr.status !== 'Completed' && activeWr.phase !== 'completion' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (onEditWorkRequest) onEditWorkRequest(activeWr);
                else setIsEditModalOpen(true);
              }}
              className="text-xs font-mono uppercase tracking-wider rounded-none border border-[#0A0A0A] bg-[#FAF9F5] hover:bg-[#EAE8E3] text-[#0A0A0A] gap-1.5"
              data-testid="kanban-edit-wr-btn"
            >
              <Edit3 className="h-3.5 w-3.5 text-[#4A4945]" />
              Edit Work Request
            </Button>
          )}
        </div>
      </div>

      {/* 2. 4-Phase Kanban Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4" data-testid="kanban-phase-grid">
        {PHASES.map((col) => {
          const isCurrentPhase = currentPhase === col.id;

          // Filter tasks belonging to this phase zone
          const phaseTasks = tasks.filter((t) => {
            const rec = (t as unknown as Record<string, unknown>) || {};
            if (t.status === 'Cancelled' || rec.deletedAt || rec.deleted_at) {
              return false;
            }
            if (col.id === 'pre_processing') return t.phase === 'pre_processing';
            if (col.id === 'processing') return t.phase === 'processing';
            if (col.id === 'quality_assurance') {
              // During QA, active tasks participate in QA review
              return currentPhase === 'quality_assurance';
            }
            if (col.id === 'completion') {
              // During completion, show completed tasks
              return currentPhase === 'completion' && t.status === 'Completed';
            }
            return false;
          });

          // Compute gate completion count
          const completedCount = phaseTasks.filter((t) => t.status === 'Completed').length;
          const totalCount = phaseTasks.length;

          // Gate Prerequisite Incomplete Items
          let incompleteGateTasks: Task[] = [];
          if (col.id === 'pre_processing') incompleteGateTasks = gateInfo.pre.incomplete;
          if (col.id === 'processing') incompleteGateTasks = gateInfo.proc.incomplete;
          if (col.id === 'quality_assurance') incompleteGateTasks = gateInfo.qa.incomplete;

          const hasGateBlockers = incompleteGateTasks.length > 0;
          const blockerTooltip = hasGateBlockers
            ? `Prerequisite gate not met: ${incompleteGateTasks.length} task(s) remaining (${incompleteGateTasks.map((t) => t.title).join(', ')})`
            : undefined;

          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'none';
              }}
              onDrop={(e) => {
                e.preventDefault();
              }}
              className={`flex flex-col bg-[#FAF9F5] border rounded-none p-3 min-h-[560px] space-y-3 transition-none ${
                isCurrentPhase
                  ? 'border-2 border-[#0A0A0A] shadow-[4px_4px_0px_#0A0A0A]'
                  : 'border border-[#C8C5BC]'
              }`}
              data-testid={`kanban-phase-column-${col.id}`}
            >
              {/* Phase Column Header */}
              <div className="space-y-1.5 border-b-2 border-[#0A0A0A] pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono font-bold text-[#E61919]">
                      #{col.number}
                    </span>
                    <h3 className="font-extrabold text-xs uppercase tracking-wider text-[#0A0A0A]">
                      {col.label}
                    </h3>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isCurrentPhase && (
                      <Badge variant="default" size="compact" className="text-xs font-mono font-bold uppercase rounded-none px-1.5 py-0 bg-[#0A0A0A] text-[#FAF9F5]">
                        Current
                      </Badge>
                    )}
                    {canAddTask && activeWr && activeWr.status !== 'Completed' && (col.id === 'pre_processing' || col.id === 'processing') && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => {
                          if (quickAddPhase === col.id) {
                            setQuickAddPhase(null);
                          } else {
                            setQuickAddPhase(col.id);
                          }
                        }}
                        className="h-5 w-5 p-0 rounded-none text-[#0A0A0A] hover:bg-[#EAE8E3] hover:border hover:border-[#0A0A0A]"
                        title={`Quick-add task to ${col.label}`}
                        data-testid={`quick-add-task-${col.id}`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Gate Progress Indicator */}
                <div className="flex items-center justify-between text-xs font-mono text-[#4A4945]">
                  <span className="flex items-center gap-1 font-bold uppercase tracking-wider">
                    <CheckSquare className="h-3 w-3 text-[#4A4945]" />
                    Gate Progress:
                  </span>
                  <span
                    className="font-bold text-[#0A0A0A] tabular-nums"
                    data-testid={`gate-progress-${col.id}`}
                  >
                    {totalCount === 0 ? '0/0' : `${completedCount}/${totalCount} completed`}
                  </span>
                </div>

                {/* Gate Blocker Warning */}
                {isCurrentPhase && hasGateBlockers && (
                  <div
                    className="p-1.5 bg-[#E61919]/10 border border-[#E61919] rounded-none text-xs font-mono text-[#E61919] flex items-center gap-1 cursor-help"
                    title={blockerTooltip}
                    data-testid={`gate-blocker-${col.id}`}
                  >
                    <AlertTriangle className="h-3 w-3 text-[#E61919] shrink-0" />
                    <span>{incompleteGateTasks.length} task(s) block advancement</span>
                  </div>
                )}

                {/* QA Failed Badge */}
                {col.id === 'quality_assurance' && gateInfo.qa.failed.length > 0 && (
                  <div className="pt-0.5">
                    <Badge
                      variant="destructive"
                      size="compact"
                      className="text-xs font-mono gap-1 font-bold uppercase rounded-none bg-[#E61919] text-[#FAF9F5] border border-[#0A0A0A]"
                      data-testid="qa-column-failed-badge"
                    >
                      <XCircle className="h-3 w-3" />
                      {gateInfo.qa.failed.length} Failed QA
                    </Badge>
                  </div>
                )}
              </div>

              {/* Tasks List Drop Area */}
              <div className="flex-1 space-y-2 overflow-y-auto min-h-36">
                {/* Inline Quick-Add Form (UAT2-10) */}
                {quickAddPhase === col.id && canAddTask && activeWr && activeWr.status !== 'Completed' &&
                  (col.id === 'pre_processing' || col.id === 'processing') && (
                  <QuickAddCard
                    key={`${activeEntity}-${effectiveWrId}-${col.id}`}
                    phase={col.id}
                    workRequest={activeWr}
                    onCancel={() => setQuickAddPhase(null)}
                    onCreate={async (data) => {
                      await createTask({ workRequestId: effectiveWrId, data });
                    }}
                  />
                )}
                {phaseTasks.length === 0 ? (
                  <div className="p-6 text-center text-xs font-mono text-[#4A4945] italic">
                    No tasks in this phase
                  </div>
                ) : (
                  phaseTasks.map((task) => {
                    const isTaskFailed = task.qaStatus === 'failed';
                    const isTaskPassed = task.qaStatus === 'passed';

                    return (
                      <div
                        key={task.id}
                        draggable={false}
                        onClick={() => setSelectedTask(task)}
                        className={`p-3 bg-[#FAF9F5] border rounded-none shadow-none space-y-2 hover:bg-[#EAE8E3] hover:border-[#0A0A0A] transition-none cursor-pointer ${
                          isTaskFailed
                            ? 'border-2 border-[#E61919] bg-[#E61919]/5'
                            : isTaskPassed
                              ? 'border border-[#0A0A0A] bg-[#FAF9F5]'
                              : 'border border-[#0A0A0A]'
                        }`}
                        data-testid={`kanban-task-card-${task.id}`}
                      >
                        {/* Task Card Header */}
                        <div className="flex items-start justify-between gap-1.5">
                          <span className="font-bold text-xs text-[#0A0A0A] leading-tight">
                            {task.title}
                          </span>

                          <div className="flex items-center gap-1 shrink-0">
                            <Badge
                              variant={task.status === 'Completed' ? 'success' : 'secondary'}
                              size="compact"
                              className="text-xs font-mono font-bold uppercase rounded-none"
                            >
                              {task.status}
                            </Badge>

                            {(canEdit || isAdmin) && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="xs"
                                    className="h-5 w-5 p-0 rounded-none text-[#4A4945] hover:text-[#0A0A0A] focus:outline-none"
                                    onClick={(e) => e.stopPropagation()}
                                    data-testid={`task-menu-btn-${task.id}`}
                                    aria-label="Task options"
                                  >
                                    <MoreVertical className="h-3.5 w-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="rounded-none border-2 border-[#0A0A0A] bg-[#FAF9F5]" onClick={(e) => e.stopPropagation()}>
                                  <DropdownMenuItem
                                    className="text-xs font-mono uppercase tracking-wider text-[#E61919] focus:text-[#FAF9F5] focus:bg-[#E61919] cursor-pointer gap-1.5 rounded-none"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setTaskToDelete({
                                        id: task.id,
                                        title: task.title,
                                        assigneeName: task.assigneeName,
                                      });
                                    }}
                                    data-testid={`menu-delete-task-btn-${task.id}`}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Delete Task
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </div>
                        </div>

                        {task.description && (
                          <p className="text-xs font-mono text-[#4A4945] line-clamp-2">
                            {task.description}
                          </p>
                        )}

                        {/* Task Meta Footer */}
                        <div className="flex items-center justify-between pt-1 border-t border-[#C8C5BC] text-xs font-mono text-[#4A4945]">
                          <div className="flex items-center gap-1 truncate max-w-32">
                            <User className="h-3 w-3 text-[#4A4945] shrink-0" />
                            <span className="truncate">
                              {task.assigneeName || 'Unassigned'}
                            </span>
                          </div>
                          {task.dueDate && (
                            <div className="flex items-center gap-1 tabular-nums">
                              <Calendar className="h-3 w-3 text-[#4A4945]" />
                              <span>{new Date(task.dueDate).toLocaleDateString()}</span>
                            </div>
                          )}
                        </div>

                        {/* QA Compliance Controls (in Quality Assurance column) */}
                        {col.id === 'quality_assurance' && (
                          <div
                            className="pt-2 border-t border-[#C8C5BC] space-y-1.5"
                            data-testid={`qa-task-controls-${task.id}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-between text-xs font-mono uppercase font-bold text-[#0A0A0A]">
                              <span>QA Compliance:</span>
                              {task.qaStatus ? (
                                <Badge
                                  variant={task.qaStatus === 'passed' ? 'success' : 'destructive'}
                                  size="compact"
                                  className="text-xs font-mono font-bold uppercase rounded-none"
                                  data-testid={`qa-status-badge-${task.id}`}
                                >
                                  {task.qaStatus === 'passed' ? 'Passed' : 'Failed'}
                                </Badge>
                              ) : (
                                <span className="text-[#4A4945] italic lowercase">Pending Review</span>
                              )}
                            </div>

                            {canQaReview && (
                              <div className="flex items-center gap-1 pt-0.5">
                                <Button
                                  type="button"
                                  size="xs"
                                  variant={task.qaStatus === 'passed' ? 'default' : 'outline'}
                                  disabled={task.qaStatus === 'passed'}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleQaReview(task.id, 'passed');
                                  }}
                                  className="flex-1 text-xs font-mono uppercase tracking-wider font-bold h-6 gap-1 rounded-none border border-[#0A0A0A] bg-[#0A0A0A] text-[#FAF9F5] hover:bg-[#E61919]"
                                  data-testid={`qa-pass-btn-${task.id}`}
                                >
                                  <CheckCircle2 className="h-3 w-3" />
                                  Pass
                                </Button>
                                <Button
                                  type="button"
                                  size="xs"
                                  variant={task.qaStatus === 'failed' ? 'destructive' : 'outline'}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleQaReview(task.id, 'failed');
                                  }}
                                  className="flex-1 text-xs font-mono uppercase tracking-wider font-bold h-6 gap-1 rounded-none bg-[#E61919] text-[#FAF9F5] hover:bg-[#0A0A0A]"
                                  data-testid={`qa-fail-btn-${task.id}`}
                                >
                                  <XCircle className="h-3 w-3" />
                                  Fail
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Phase Footer Actions */}
              {isCurrentPhase && (
                <div
                  className="pt-2 border-t-2 border-[#0A0A0A] space-y-2"
                  data-testid={`phase-footer-${col.id}`}
                >
                  {/* Pre-processing -> Processing */}
                  {col.id === 'pre_processing' && (
                    <div className="space-y-1.5">
                      {/* Manager Action: Notify Admin */}
                      {canRequestTransition && !isAdmin && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!gateInfo.pre.canAdvance}
                          title={blockerTooltip}
                          onClick={() =>
                            handleRequestTransition('pre_processing', 'processing')
                          }
                          className="w-full text-xs font-mono uppercase tracking-wider font-bold gap-1.5 rounded-none border border-[#0A0A0A] bg-[#FAF9F5] hover:bg-[#EAE8E3] text-[#0A0A0A]"
                          data-testid="manager-notify-admin-btn"
                        >
                          <Send className="h-3.5 w-3.5 text-[#0A0A0A]" />
                          Notify Admin — ready for review
                        </Button>
                      )}

                      {/* Admin Direct Advance */}
                      {canAdvance && (
                        <Button
                          type="button"
                          size="sm"
                          disabled={!gateInfo.pre.canAdvance}
                          title={blockerTooltip}
                          onClick={() => handleAdvance('processing')}
                          className="w-full text-xs font-mono uppercase tracking-wider font-bold gap-1.5 rounded-none bg-[#0A0A0A] text-[#FAF9F5] hover:bg-[#E61919]"
                          data-testid="admin-advance-btn"
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                          Advance to Processing
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Processing -> Quality Assurance */}
                  {col.id === 'processing' && (
                    <div className="space-y-1.5">
                      {canRequestTransition && !isAdmin && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={!gateInfo.proc.canAdvance}
                          title={blockerTooltip}
                          onClick={() =>
                            handleRequestTransition('processing', 'quality_assurance')
                          }
                          className="w-full text-xs font-mono uppercase tracking-wider font-bold gap-1.5 rounded-none border border-[#0A0A0A] bg-[#FAF9F5] hover:bg-[#EAE8E3] text-[#0A0A0A]"
                          data-testid="manager-notify-admin-btn"
                        >
                          <Send className="h-3.5 w-3.5 text-[#0A0A0A]" />
                          Notify Admin — ready for review
                        </Button>
                      )}

                      {canAdvance && (
                        <Button
                          type="button"
                          size="sm"
                          disabled={!gateInfo.proc.canAdvance}
                          title={blockerTooltip}
                          onClick={() => handleAdvance('quality_assurance')}
                          className="w-full text-xs font-mono uppercase tracking-wider font-bold gap-1.5 rounded-none bg-[#0A0A0A] text-[#FAF9F5] hover:bg-[#E61919]"
                          data-testid="admin-advance-btn"
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                          Advance to QA
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Quality Assurance Footer Controls */}
                  {col.id === 'quality_assurance' && (
                    <div className="space-y-1.5">
                      {/* Reroute Trigger */}
                      {canQaReview && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setIsRerouteOpen(true)}
                          className="w-full text-xs font-mono uppercase tracking-wider font-bold gap-1.5 rounded-none border border-[#0A0A0A] bg-[#EAE8E3] hover:bg-[#E4E2DC] text-[#0A0A0A]"
                          data-testid="qa-reroute-btn"
                        >
                          <RotateCcw className="h-3.5 w-3.5 text-[#0A0A0A]" />
                          Reroute
                        </Button>
                      )}

                      {/* Advance to Completion */}
                      {canAdvance && (
                        <Button
                          type="button"
                          size="sm"
                          disabled={!gateInfo.qa.canAdvance}
                          title={
                            gateInfo.qa.canAdvance
                              ? undefined
                              : 'All tasks must be Completed and marked Passed before advancing to Completion'
                          }
                          onClick={() => handleAdvance('completion')}
                          className="w-full text-xs font-mono uppercase tracking-wider font-bold gap-1.5 rounded-none bg-[#0A0A0A] text-[#FAF9F5] hover:bg-[#E61919]"
                          data-testid="admin-advance-completion-btn"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Advance to Completion
                        </Button>
                      )}
                    </div>
                  )}

                  {/* Completion Status */}
                  {col.id === 'completion' && (
                    <div className="p-2 bg-[#0A0A0A] text-[#FAF9F5] rounded-none text-center text-xs font-mono uppercase tracking-wider font-bold">
                      Work Request Completed
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Reroute Dialog */}
      {effectiveWrId && (
        <RerouteModal
          isOpen={isRerouteOpen}
          onClose={() => setIsRerouteOpen(false)}
          workRequestId={effectiveWrId}
          failedTasks={gateInfo.qa.failed.map((t) => ({ id: t.id, title: t.title }))}
        />
      )}

      {/* Work Request Edit Modal */}
      {activeWr && (
        <WorkRequestModal
          isOpen={isEditModalOpen}
          workRequest={activeWr}
          onClose={() => setIsEditModalOpen(false)}
        />
      )}

      {/* Task Detail Modal (UAT-OPS4) */}
      {selectedTask && (
        <TaskDetailModal
          isOpen={Boolean(selectedTask)}
          onClose={() => setSelectedTask(null)}
          task={selectedTask}
          workRequest={activeWr}
          onTaskUpdated={(updated) => {
            setSelectedTask(updated);
          }}
        />
      )}

      {/* Delete Task Confirmation Modal (Task OA.4) */}
      <Dialog
        open={Boolean(taskToDelete)}
        onOpenChange={(open) => !open && setTaskToDelete(null)}
      >
        <DialogContent
          className="max-w-md rounded-none border-2 border-[#0A0A0A] bg-[#FAF9F5] shadow-[4px_4px_0px_#0A0A0A] p-6"
          data-testid="delete-task-modal"
        >
          <DialogHeader className="border-b border-[#0A0A0A] pb-3">
            <DialogTitle className="flex items-center gap-2 text-[#E61919] text-base font-extrabold uppercase tracking-tight">
              <AlertTriangle className="h-5 w-5 text-[#E61919] shrink-0" />
              Delete Task
            </DialogTitle>
            <DialogDescription className="text-xs font-mono text-[#4A4945] pt-1">
              Are you sure you want to delete this task? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {taskToDelete && (
            <div className="p-3 bg-[#EAE8E3] border border-[#0A0A0A] rounded-none text-xs font-mono space-y-1.5">
              <div className="text-[#0A0A0A]">
                <span className="font-bold">Task: </span>
                <span className="font-medium text-[#0A0A0A]">{taskToDelete.title}</span>
              </div>
              {taskToDelete.assigneeName && (
                <div className="text-[#4A4945]">
                  <span className="font-bold">Assignee: </span>
                  <span>{taskToDelete.assigneeName}</span>
                </div>
              )}
              <div className="text-xs text-[#E61919] font-bold pt-0.5">
                Warning: Any dependencies or records linked to this task will be affected.
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t border-[#0A0A0A]">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setTaskToDelete(null)}
              disabled={isDeletingTask}
              className="text-xs font-mono uppercase tracking-wider rounded-none border border-[#0A0A0A] bg-[#FAF9F5] hover:bg-[#EAE8E3] text-[#0A0A0A]"
              data-testid="cancel-delete-task-btn"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleConfirmDeleteTask}
              disabled={isDeletingTask}
              className="text-xs font-mono uppercase tracking-wider font-bold rounded-none bg-[#E61919] hover:bg-[#0A0A0A] text-[#FAF9F5]"
              data-testid="confirm-delete-task-btn"
            >
              {isDeletingTask ? 'Deleting...' : 'Delete Task'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PhaseKanbanBoardWithRouter(props: PhaseKanbanBoardProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  return <PhaseKanbanBoardInner {...props} searchParams={searchParams} setSearchParams={setSearchParams} />;
}

function PhaseKanbanBoardWithoutRouter(props: PhaseKanbanBoardProps) {
  const [searchParams, setSearchParams] = useState<URLSearchParams>(
    () => new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '')
  );
  return <PhaseKanbanBoardInner {...props} searchParams={searchParams} setSearchParams={setSearchParams} />;
}

export function PhaseKanbanBoard(props: PhaseKanbanBoardProps) {
  const inRouter = useInRouterContext();
  if (inRouter) {
    return <PhaseKanbanBoardWithRouter {...props} />;
  }
  return <PhaseKanbanBoardWithoutRouter {...props} />;
}
