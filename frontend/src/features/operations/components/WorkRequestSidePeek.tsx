import { useState, useEffect, useMemo } from 'react';
import {
  X,
  Building,
  Calendar,
  User,
  Users,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Edit,
  Columns,
  FileText,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Eye,
  Download,
  ExternalLink,
  Check,
  Lock,
  Layers,
  ArrowRight,
  Maximize2,
  FileSpreadsheet,
  FileImage,
  FileCode,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import {
  useWorkRequestDetail,
  useWorkRequestMutations,
} from '../api/useWorkRequests';
import { useWorkRequestTasks } from '../api/useTasks';
import { useDocuments, useDocumentDownloadUrl } from '../api/useDocuments';
import { useTeam } from '../api/useTeam';
import { useSessionStore } from '@/lib/session';
import { hasPermission } from '@/lib/permissions';
import { isUserAdmin } from '../lib/taskScope';
import { getPhaseBadgeInfo, getStatusBadgeInfo } from '../lib/statusBadges';
import { TaskDetailModal } from './TaskDetailModal';
import { DocumentViewerModal } from './DocumentViewerModal';
import { parseExternalUrl } from '@/features/documents';
import {
  ConflictResolutionModal,
  isConcurrencyConflictError,
} from '@/components/common/ConflictResolutionModal';
import { PresenceAvatars } from '@/components/common/PresenceAvatars';
import { operationsKeys } from '../api/queryKeys';
import type { ApiError } from '@/lib/api';
import {
  type WorkRequest,
  type Task,
  type Phase,
  type DmsDocument,
  type WorkRequestStatus,
  WORK_REQUEST_STATUS_OPTIONS,
} from '../api/types';

export interface WorkRequestSidePeekProps {
  isOpen: boolean;
  onClose: () => void;
  workRequestId: string | null;
  onEdit?: (wr: WorkRequest) => void;
  onViewInBoard?: (wrId: string) => void;
}

export function WorkRequestSidePeek({
  isOpen,
  onClose,
  workRequestId,
  onEdit,
  onViewInBoard,
}: WorkRequestSidePeekProps) {
  const permissions = useSessionStore((state) => state.permissions);
  const user = useSessionStore((state) => state.user);
  const canEdit = hasPermission(permissions, 'workflow:edit');
  const isAdmin = isUserAdmin(user);

  // Modal inspection states
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [previewDoc, setPreviewDoc] = useState<DmsDocument | null>(null);
  const [viewerDoc, setViewerDoc] = useState<DmsDocument | null>(null);
  const [conflictModalState, setConflictModalState] = useState<{
    isOpen: boolean;
    attemptedStatus: WorkRequestStatus | null;
    error: ApiError | null;
  }>({
    isOpen: false,
    attemptedStatus: null,
    error: null,
  });
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();

  // Fetch work request detail
  const {
    data: workRequest,
    isLoading: isLoadingWr,
  } = useWorkRequestDetail(workRequestId || '', {
    enabled: Boolean(isOpen && workRequestId),
  });

  const { statusOptimistic, isStatusOptimisticPending: isUpdatingWr } = useWorkRequestMutations();

  // Fetch tasks
  const {
    data: tasks = [],
    isLoading: isLoadingTasks,
  } = useWorkRequestTasks(workRequestId || '', {
    enabled: Boolean(isOpen && workRequestId),
  });

  // Fetch documents
  const { data: rawDocs, isLoading: isLoadingDocs } = useDocuments(
    workRequestId ? { workRequestId } : undefined,
    { enabled: Boolean(isOpen && workRequestId) }
  );

  const documents = useMemo(() => {
    return Array.isArray(rawDocs) ? rawDocs : rawDocs?.data ?? [];
  }, [rawDocs]);

  // Fetch team directory for name resolution (UAT2-5)
  const { data: rawTeam } = useTeam();
  const teamList = useMemo(() => {
    if (Array.isArray(rawTeam)) return rawTeam;
    if (rawTeam && typeof rawTeam === 'object' && 'data' in rawTeam && Array.isArray((rawTeam as { data: unknown[] }).data)) {
      return (rawTeam as { data: Array<{ id: string; name: string }> }).data;
    }
    return [];
  }, [rawTeam]);

  const teamMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of teamList) {
      if (m && m.id && m.name) {
        map.set(m.id, m.name);
      }
    }
    return map;
  }, [teamList]);

  const resolveUserName = useMemo(() => {
    return (idOrName: string | null | undefined): string => {
      if (!idOrName) return 'Unassigned';
      if (teamMap.has(idOrName)) {
        return teamMap.get(idOrName)!;
      }
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrName);
      if (isUuid) {
        return 'Staff Member';
      }
      return idOrName;
    };
  }, [teamMap]);

  const assignedLeadName = useMemo(() => {
    if (!workRequest) return 'Unassigned';
    if (workRequest.assignedToName) return workRequest.assignedToName;
    if (workRequest.assigned_to_name) return workRequest.assigned_to_name;
    return resolveUserName(workRequest.assignedTo);
  }, [workRequest, resolveUserName]);

  const coAssigneeNames = useMemo(() => {
    if (!workRequest?.coAssignees || !Array.isArray(workRequest.coAssignees)) return [];
    const resolved = workRequest.coAssignees
      .map((val) => resolveUserName(val))
      .filter(Boolean);
    return Array.from(new Set(resolved));
  }, [workRequest, resolveUserName]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't close sidepeek if a submodal (Task or Document) is currently open
      if (e.key === 'Escape' && !selectedTask && !viewerDoc) {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, selectedTask, viewerDoc]);

  // Compute blocker info
  const blockerInfo = useMemo(() => {
    if (!workRequest || !tasks.length) return { hasBlockers: false, incomplete: [] };
    const activeTasks = tasks.filter((t) => t.status !== 'Cancelled');
    const phase = workRequest.phase as Phase;

    let incomplete: Task[] = [];
    if (phase === 'pre_processing') {
      incomplete = activeTasks.filter(
        (t) => t.phase === 'pre_processing' && t.status !== 'Completed'
      );
    } else if (phase === 'processing') {
      incomplete = activeTasks.filter(
        (t) => t.phase === 'processing' && t.status !== 'Completed'
      );
    } else if (phase === 'quality_assurance') {
      incomplete = activeTasks.filter(
        (t) => t.status !== 'Completed' || t.qaStatus !== 'passed'
      );
    }

    return {
      hasBlockers: incomplete.length > 0,
      incomplete,
    };
  }, [workRequest, tasks]);

  // Handle Admin status transition with no strict guard — OPTIMISTIC:
  // the badge flips instantly; a failed write rolls the cache back and the
  // verbatim server error surfaces via toast.
  const handleStatusChange = async (newStatus: WorkRequestStatus) => {
    if (!workRequest || workRequest.status === newStatus) return;
    try {
      await statusOptimistic({
        id: workRequest.id,
        status: newStatus,
        entity: workRequest.entity,
        expectedVersion: workRequest.version,
      });
      toast.success(`Work request status updated to "${newStatus}"`);
    } catch (err: unknown) {
      if (isConcurrencyConflictError(err)) {
        setConflictModalState({
          isOpen: true,
          attemptedStatus: newStatus,
          error: err as ApiError,
        });
        return;
      }
      const msg = err instanceof Error ? err.message : 'Failed to update work request status';
      toast.error(msg);
    }
  };

  const toggleTaskExpanded = (taskId: string) => {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const completedTasksCount = useMemo(() => {
    return tasks.filter((t) => t.status === 'Completed').length;
  }, [tasks]);

  const progressPercentage = useMemo(() => {
    if (!tasks.length) return 0;
    return Math.round((completedTasksCount / tasks.length) * 100);
  }, [completedTasksCount, tasks.length]);

  if (!isOpen || !workRequestId) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 overflow-hidden"
        data-testid="wr-side-peek"
        aria-label="Work Request Side Peek"
        role="region"
      >
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-200"
          onClick={onClose}
          aria-hidden="true"
          data-testid="side-peek-backdrop"
        />

        {/* Slide-out Drawer Panel */}
        <div className="fixed inset-y-0 right-0 max-w-full flex pl-6 sm:pl-10 z-50">
          <div className="w-screen max-w-2xl md:max-w-3xl bg-[#FAF9F5] shadow-2xl border-l-2 border-[#0A0A0A] flex flex-col h-full animate-in slide-in-from-right duration-200 text-[#0A0A0A] font-mono">
            {/* Header: Notion-style Breadcrumb & Actions */}
            <div className="px-6 py-4 border-b-2 border-[#0A0A0A] bg-[#EAE8E3] flex items-start justify-between gap-4">
              <div className="space-y-2 flex-1 min-w-0">
                {/* Meta badges & Notion-like status dropdown */}
                <div className="flex flex-wrap items-center gap-2">
                  {workRequest && (
                    <>
                      <Badge
                        variant={workRequest.entity === 'LTA' ? 'lta' : 'ata'}
                        size="compact"
                        className="font-bold tracking-wider rounded-none font-mono text-xs"
                      >
                        {workRequest.entity}
                      </Badge>
                      <Badge
                        variant={
                          workRequest.priority === 'Urgent'
                            ? 'destructive'
                            : workRequest.priority === 'High'
                              ? 'warning'
                              : 'secondary'
                        }
                        size="compact"
                        className="font-medium rounded-none font-mono text-xs"
                      >
                        {workRequest.priority} Priority
                      </Badge>

                      {/* Phase Indicator */}
                      {(() => {
                        const phaseInfo = getPhaseBadgeInfo(workRequest.phase);
                        const PhaseIcon = phaseInfo.Icon;
                        return (
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-none text-xs font-mono font-semibold border border-[#0A0A0A] bg-[#FAF9F5] text-[#0A0A0A]"
                            data-testid="side-peek-phase"
                          >
                            <PhaseIcon className="w-3.5 h-3.5 shrink-0" />
                            <span>Phase: {workRequest.phase.replace('_', ' ')}</span>
                          </span>
                        );
                      })()}

                      {/* Status: Editable Dropdown for Admin, Readonly Pill for Non-Admin */}
                      {(() => {
                        const statusInfo = getStatusBadgeInfo(workRequest.status);
                        const StatusIcon = statusInfo.Icon;

                        if (isAdmin && workRequest.status !== 'Completed') {
                          return (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-none text-xs font-mono font-semibold border border-[#0A0A0A] bg-[#FAF9F5] text-[#0A0A0A] cursor-pointer hover:bg-[#EAE8E3] focus:outline-none"
                                  data-testid="side-peek-status"
                                  data-admin-status-dropdown="true"
                                  title="Change Work Request Status (Admin: Unconstrained)"
                                  disabled={isUpdatingWr}
                                >
                                  <StatusIcon className="w-3.5 h-3.5 shrink-0" />
                                  <span>{statusInfo.label}</span>
                                  <ChevronDown className="w-3.5 h-3.5 ml-0.5 opacity-70" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent
                                align="start"
                                className="w-64 p-1.5 bg-[#FAF9F5] shadow-[4px_4px_0px_#0A0A0A] border-2 border-[#0A0A0A] rounded-none max-h-96 overflow-y-auto z-50 font-mono"
                              >
                                <DropdownMenuLabel className="text-xs font-bold uppercase tracking-wider text-[#4A4945] px-2 py-1 flex items-center justify-between">
                                  <span>Set Work Request Status</span>
                                  <span className="text-xs text-[#FAF9F5] bg-[#0A0A0A] px-1.5 py-0.5 rounded-none font-normal">
                                    Admin Free Change
                                  </span>
                                </DropdownMenuLabel>
                                <DropdownMenuSeparator className="my-1 bg-[#0A0A0A]" />
                                {WORK_REQUEST_STATUS_OPTIONS.map((statusOption) => {
                                  const optInfo = getStatusBadgeInfo(statusOption);
                                  const OptIcon = optInfo.Icon;
                                  const isCurrent = workRequest.status === statusOption;

                                  return (
                                    <DropdownMenuItem
                                      key={statusOption}
                                      onClick={() => handleStatusChange(statusOption)}
                                      className={`flex items-center justify-between px-2.5 py-2 text-xs rounded-none cursor-pointer font-mono ${
                                        isCurrent
                                          ? 'bg-[#0A0A0A] font-bold text-[#FAF9F5]'
                                          : 'text-[#0A0A0A] hover:bg-[#EAE8E3]'
                                      }`}
                                      data-testid={`status-option-${statusOption}`}
                                    >
                                      <div className="flex items-center gap-2">
                                        <OptIcon className="w-3.5 h-3.5 shrink-0" />
                                        <span className="truncate">{statusOption}</span>
                                      </div>
                                      {isCurrent && <Check className="w-3.5 h-3.5 text-[#FAF9F5] shrink-0" />}
                                    </DropdownMenuItem>
                                  );
                                })}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          );
                        }

                        // Readonly status badge for non-admin
                        return (
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-none text-xs font-mono font-semibold border border-[#0A0A0A] bg-[#FAF9F5] text-[#0A0A0A]"
                            data-testid="side-peek-status"
                            title="Work request status (Admin only can modify)"
                          >
                            <StatusIcon className="w-3.5 h-3.5 shrink-0" />
                            <span>{statusInfo.label}</span>
                            <Lock className="w-3 h-3 ml-0.5 text-[#4A4945]" />
                          </span>
                        );
                      })()}
                    </>
                  )}
                </div>

                {/* Big, clean Notion-style Title */}
                <h2
                  className="text-xl font-extrabold tracking-tight text-[#0A0A0A] leading-snug break-words"
                  data-testid="side-peek-title"
                >
                  {isLoadingWr ? 'Loading Work Request...' : workRequest?.title || 'Work Request'}
                </h2>
              </div>

              {/* Action buttons in header */}
              <div className="flex items-center gap-1.5 shrink-0">
                {(workRequest || workRequestId) && <PresenceAvatars roomId={workRequest?.id || workRequestId} />}
                {onViewInBoard && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onViewInBoard(workRequestId);
                      onClose();
                    }}
                    className="text-xs font-mono uppercase tracking-wider rounded-none border border-[#0A0A0A] bg-[#FAF9F5] text-[#0A0A0A] hover:bg-[#EAE8E3] gap-1.5"
                    data-testid="side-peek-board-btn"
                    title="Open in Kanban Board"
                  >
                    <Columns className="h-3.5 w-3.5 text-[#0A0A0A]" />
                    Board
                  </Button>
                )}
                {canEdit && onEdit && workRequest && workRequest.status !== 'Completed' && workRequest.phase !== 'completion' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onEdit(workRequest);
                      onClose();
                    }}
                    className="text-xs font-mono uppercase tracking-wider rounded-none border border-[#0A0A0A] bg-[#FAF9F5] text-[#0A0A0A] hover:bg-[#EAE8E3] gap-1.5"
                    data-testid="side-peek-edit-btn"
                    title="Edit Work Request"
                  >
                    <Edit className="h-3.5 w-3.5 text-[#0A0A0A]" />
                    Edit
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={onClose}
                  className="text-[#4A4945] hover:text-[#0A0A0A] hover:bg-[#EAE8E3] ml-1 rounded-none"
                  data-testid="side-peek-close-btn"
                  aria-label="Close Side Peek"
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {isLoadingWr ? (
                <div className="p-12 text-center text-sm font-mono text-[#4A4945]">
                  <div className="w-8 h-8 border-2 border-[#0A0A0A] border-t-transparent rounded-none animate-spin mx-auto mb-3" />
                  Loading work request details...
                </div>
              ) : workRequest ? (
                <>
                  {/* Completed Work Request Read-Only Lock Banner */}
                  {workRequest.status === 'Completed' && (
                    <div
                      className="bg-[#EAE8E3] border border-[#0A0A0A] text-[#0A0A0A] text-xs font-mono px-3.5 py-2.5 rounded-none flex items-center gap-2.5"
                      data-testid="completed-wr-lock-banner"
                    >
                      <Lock className="h-4 w-4 text-[#0A0A0A] shrink-0" />
                      <span>Completed Work Request: This record is finalized and locked against edits or mutations.</span>
                    </div>
                  )}

                  {/* 1. Gate Blocker Warning */}
                  {blockerInfo.hasBlockers && (
                    <div
                      className="p-4 bg-[#FAF9F5] border-2 border-[#E61919] rounded-none text-xs font-mono text-[#E61919] space-y-1.5"
                      data-testid="side-peek-blocker-alert"
                    >
                      <div className="flex items-center gap-2 font-bold text-sm text-[#E61919]">
                        <AlertTriangle className="h-4 w-4 text-[#E61919] shrink-0" />
                        <span>Phase Advancement Blocked</span>
                      </div>
                      <p className="text-xs text-[#E61919] pl-6 leading-relaxed">
                        {blockerInfo.incomplete.length} task(s) in phase &quot;
                        {workRequest.phase.replace('_', ' ')}&quot; must be completed before advancing.
                      </p>
                    </div>
                  )}

                  {/* 2. Notion-Style Properties Grid */}
                  <div className="bg-[#EAE8E3] border border-[#0A0A0A] rounded-none p-4 space-y-3">
                    <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#0A0A0A] mb-1 flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-[#0A0A0A]" />
                      Properties
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs font-mono">
                      {/* Client */}
                      <div className="flex items-center justify-between p-2 bg-[#FAF9F5] border border-[#0A0A0A] rounded-none">
                        <span className="text-[#4A4945] font-medium flex items-center gap-1.5">
                          <Building className="h-3.5 w-3.5 text-[#4A4945] shrink-0" />
                          Client
                        </span>
                        <span
                          className="font-bold text-[#0A0A0A] truncate max-w-[160px]"
                          data-testid="side-peek-client"
                        >
                          {workRequest.clientName || '—'}
                        </span>
                      </div>

                      {/* Due Date */}
                      <div className="flex items-center justify-between p-2 bg-[#FAF9F5] border border-[#0A0A0A] rounded-none">
                        <span className="text-[#4A4945] font-medium flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5 text-[#4A4945] shrink-0" />
                          Due Date
                        </span>
                        <span className="font-semibold text-[#0A0A0A]">
                          {workRequest.dueDate
                            ? new Date(workRequest.dueDate).toLocaleDateString()
                            : 'No due date'}
                        </span>
                      </div>

                      {/* Assigned Lead */}
                      <div className="flex items-center justify-between p-2 bg-[#FAF9F5] border border-[#0A0A0A] rounded-none">
                        <span className="text-[#4A4945] font-medium flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-[#4A4945] shrink-0" />
                          Assigned Lead
                        </span>
                        <span
                          className="font-bold text-[#0A0A0A] truncate max-w-[160px]"
                          data-testid="side-peek-assignee"
                        >
                          {assignedLeadName}
                        </span>
                      </div>

                      {/* Created Date */}
                      <div className="flex items-center justify-between p-2 bg-[#FAF9F5] border border-[#0A0A0A] rounded-none">
                        <span className="text-[#4A4945] font-medium flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-[#4A4945] shrink-0" />
                          Created Date
                        </span>
                        <span className="font-medium text-[#0A0A0A]">
                          {workRequest.createdAt
                            ? new Date(workRequest.createdAt).toLocaleDateString()
                            : 'N/A'}
                        </span>
                      </div>

                      {/* Co-Assignees */}
                      {coAssigneeNames.length > 0 && (
                        <div className="sm:col-span-2 p-2.5 bg-[#FAF9F5] border border-[#0A0A0A] rounded-none">
                          <span className="text-xs uppercase font-bold text-[#4A4945] block mb-1.5 flex items-center gap-1.5 font-mono">
                            <Users className="h-3.5 w-3.5 text-[#4A4945]" />
                            Team Members / Co-Assignees
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {coAssigneeNames.map((name, idx) => (
                              <Badge
                                key={`${name}-${idx}`}
                                variant="secondary"
                                size="compact"
                                className="text-xs font-mono rounded-none bg-[#EAE8E3] font-medium text-[#0A0A0A] border border-[#0A0A0A]"
                                data-testid="side-peek-co-assignee"
                              >
                                <Users className="h-2.5 w-2.5 mr-1 text-[#4A4945]" />
                                {name}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 3. Description & Objectives */}
                  <div className="space-y-2 font-mono">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A] flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5 text-[#4A4945]" />
                      Description & Objectives
                    </h4>
                    <div className="p-4 bg-[#FAF9F5] border border-[#0A0A0A] rounded-none text-xs text-[#0A0A0A] whitespace-pre-wrap leading-relaxed min-h-[60px]">
                      {workRequest.description || (
                        <span className="text-[#4A4945] italic">No description provided for this work request.</span>
                      )}
                    </div>
                  </div>

                  {/* 4. Tasks Breakdown with Inspection Affordance */}
                  <div className="space-y-3 font-mono" data-testid="side-peek-tasks">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A] flex items-center gap-2">
                        <CheckSquare className="h-4 w-4 text-[#0A0A0A]" />
                        <span>Tasks Breakdown ({completedTasksCount}/{tasks.length})</span>
                      </h4>
                      {tasks.length > 0 && (
                        <span className="text-xs font-semibold text-[#0A0A0A]">
                          {progressPercentage}% Complete
                        </span>
                      )}
                    </div>

                    {/* Progress Bar */}
                    {tasks.length > 0 && (
                      <div className="w-full bg-[#EAE8E3] rounded-none h-2 overflow-hidden border border-[#0A0A0A]">
                        <div
                          className="bg-[#0A0A0A] h-full rounded-none transition-all duration-300"
                          style={{ width: `${progressPercentage}%` }}
                        />
                      </div>
                    )}

                    {isLoadingTasks ? (
                      <div className="p-6 text-center text-xs text-[#4A4945] bg-[#FAF9F5] rounded-none border border-[#0A0A0A]">
                        Loading tasks...
                      </div>
                    ) : tasks.length === 0 ? (
                      <div className="p-6 text-center text-xs text-[#4A4945] bg-[#FAF9F5] rounded-none border border-[#0A0A0A] italic">
                        No tasks created for this work request yet.
                      </div>
                    ) : (
                      <div className="border border-[#0A0A0A] rounded-none overflow-hidden divide-y divide-[#C8C5BC] bg-[#FAF9F5]">
                        {tasks.map((task) => {
                          const isCompleted = task.status === 'Completed';
                          const isExpanded = expandedTaskIds.has(task.id);
                          const hasChecklist = Array.isArray(task.checklist) && task.checklist.length > 0;
                          const checklistDone = hasChecklist
                            ? task.checklist!.filter((c) => c.completed).length
                            : 0;

                          return (
                            <div
                              key={task.id}
                              className="group transition-colors hover:bg-[#EAE8E3]/60"
                              data-testid={`side-peek-task-${task.id}`}
                            >
                              <div
                                className="p-3.5 flex items-center justify-between gap-3 text-xs cursor-pointer"
                                onClick={() => setSelectedTask(task)}
                                title="Click to view full task details, log time, and upload documents"
                              >
                                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                  <CheckCircle2
                                    className={`h-4.5 w-4.5 shrink-0 mt-0.5 ${
                                      isCompleted ? 'text-[#0A0A0A]' : 'text-[#C8C5BC]'
                                    }`}
                                  />
                                  <div className="min-w-0 flex-1">
                                    <span
                                      className={`font-semibold text-sm block truncate ${
                                        isCompleted ? 'line-through text-[#4A4945]' : 'text-[#0A0A0A]'
                                      }`}
                                    >
                                      {task.title}
                                    </span>

                                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#4A4945] pt-1">
                                      <span className="capitalize">{task.phase.replace('_', ' ')}</span>
                                      {(task.assigneeName || task.assigneeId) && (
                                        <>
                                          <span>•</span>
                                          <span className="font-medium text-[#0A0A0A]">
                                            {task.assigneeName
                                              ? resolveUserName(task.assigneeName)
                                              : resolveUserName(task.assigneeId)}
                                          </span>
                                        </>
                                      )}
                                      {hasChecklist && (
                                        <>
                                          <span>•</span>
                                          <span className="text-[#0A0A0A] font-medium bg-[#EAE8E3] px-1.5 py-0.5 rounded-none border border-[#0A0A0A]">
                                            ✓ {checklistDone}/{task.checklist!.length} subtasks
                                          </span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  {task.qaStatus && task.qaStatus !== 'none' && (
                                    <Badge
                                      variant={task.qaStatus === 'passed' ? 'success' : 'destructive'}
                                      size="compact"
                                      className="text-xs font-mono rounded-none"
                                    >
                                      QA: {task.qaStatus}
                                    </Badge>
                                  )}
                                  <Badge
                                    variant={isCompleted ? 'success' : 'secondary'}
                                    size="compact"
                                    className="text-xs font-mono rounded-none font-medium"
                                  >
                                    {task.status}
                                  </Badge>

                                  {/* View Button */}
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="xs"
                                    className="gap-1 text-[#0A0A0A] hover:bg-[#EAE8E3] rounded-none border border-[#0A0A0A] font-mono text-xs uppercase"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedTask(task);
                                    }}
                                  >
                                    <span>Details</span>
                                    <ArrowRight className="h-3 w-3" />
                                  </Button>

                                  {/* Subtasks expander toggle */}
                                  {hasChecklist && (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon-xs"
                                      className="text-[#4A4945] hover:text-[#0A0A0A] rounded-none"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        toggleTaskExpanded(task.id);
                                      }}
                                      title={isExpanded ? 'Hide Subtasks' : 'View Subtasks'}
                                    >
                                      {isExpanded ? (
                                        <ChevronDown className="h-4 w-4" />
                                      ) : (
                                        <ChevronRight className="h-4 w-4" />
                                      )}
                                    </Button>
                                  )}
                                </div>
                              </div>

                              {/* Inline subtasks list if expanded */}
                              {isExpanded && hasChecklist && (
                                <div className="px-10 pb-3 space-y-1.5 bg-[#EAE8E3]/60 border-t border-[#C8C5BC]">
                                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#4A4945] block pt-2">
                                    Subtasks / Checklist:
                                  </span>
                                  {task.checklist!.map((item) => (
                                    <div
                                      key={item.id}
                                      className="flex items-center gap-2 text-xs text-[#0A0A0A] py-0.5"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={item.completed}
                                        disabled
                                        className="rounded-none border-[#0A0A0A] text-[#0A0A0A]"
                                      />
                                      <span className={item.completed ? 'line-through text-[#4A4945]' : 'text-[#0A0A0A]'}>
                                        {item.text}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 5. Documents Section with Sidepeek Preview & Inspection */}
                  <div className="space-y-3 font-mono">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-[#0A0A0A] flex items-center gap-2">
                        <FileText className="h-4 w-4 text-[#0A0A0A]" />
                        <span>Attached Documents ({documents.length})</span>
                      </h4>
                      {previewDoc && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          className="text-[#4A4945] hover:text-[#0A0A0A] text-xs font-mono rounded-none uppercase"
                          onClick={() => setPreviewDoc(null)}
                        >
                          Hide Preview
                        </Button>
                      )}
                    </div>

                    {isLoadingDocs ? (
                      <div className="p-6 text-center text-xs text-[#4A4945] bg-[#FAF9F5] rounded-none border border-[#0A0A0A]">
                        Loading documents...
                      </div>
                    ) : documents.length === 0 ? (
                      <div className="p-6 text-center text-xs text-[#4A4945] bg-[#FAF9F5] rounded-none border border-[#0A0A0A] italic">
                        No documents attached to this work request yet.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Inline Document Preview Box (When a doc is selected) */}
                        {previewDoc && (
                          <InlineDocPreviewPanel
                            document={previewDoc}
                            onClose={() => setPreviewDoc(null)}
                            onOpenFullViewer={() => setViewerDoc(previewDoc)}
                          />
                        )}

                        {/* Document Cards Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {documents.map((doc) => {
                            const name = doc.fileName || doc.file_name || doc.originalName || 'Document';
                            const isSelectedForPreview = previewDoc?.id === doc.id;
                            const isPdf = name.toLowerCase().endsWith('.pdf');
                            const isImg = /\.(png|jpe?g|gif|webp|svg)$/i.test(name);
                            const isSpreadsheet = /\.(xlsx?|csv)$/i.test(name);

                            return (
                              <div
                                key={doc.id}
                                className={`p-3 bg-[#FAF9F5] border rounded-none text-xs flex flex-col justify-between gap-2.5 transition-all ${
                                  isSelectedForPreview
                                    ? 'border-2 border-[#0A0A0A] bg-[#EAE8E3]'
                                    : 'border border-[#0A0A0A] hover:bg-[#EAE8E3]/40'
                                }`}
                              >
                                <div className="flex items-start gap-2.5 min-w-0">
                                  <div className="p-2 rounded-none bg-[#EAE8E3] border border-[#0A0A0A] shrink-0">
                                    {isPdf ? (
                                      <FileText className="h-4 w-4 text-[#0A0A0A]" />
                                    ) : isImg ? (
                                      <FileImage className="h-4 w-4 text-[#0A0A0A]" />
                                    ) : isSpreadsheet ? (
                                      <FileSpreadsheet className="h-4 w-4 text-[#0A0A0A]" />
                                    ) : (
                                      <FileCode className="h-4 w-4 text-[#0A0A0A]" />
                                    )}
                                  </div>

                                  <div className="min-w-0 flex-1">
                                    <span
                                      className="font-semibold text-[#0A0A0A] block truncate"
                                      title={name}
                                    >
                                      {name}
                                    </span>
                                    <div className="text-xs text-[#4A4945] pt-0.5 flex items-center gap-1.5">
                                      {doc.category && <span className="uppercase">{doc.category}</span>}
                                      {doc.fileSize && (
                                        <>
                                          <span>•</span>
                                          <span>{Math.round(doc.fileSize / 1024)} KB</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Preview and View Actions */}
                                <div className="flex items-center justify-between pt-1 border-t border-[#C8C5BC]">
                                  <Button
                                    type="button"
                                    variant={isSelectedForPreview ? 'default' : 'outline'}
                                    size="xs"
                                    className={`gap-1 text-xs font-mono uppercase tracking-wider rounded-none ${
                                      isSelectedForPreview
                                        ? 'bg-[#0A0A0A] text-[#FAF9F5]'
                                        : 'border border-[#0A0A0A] bg-[#FAF9F5] text-[#0A0A0A] hover:bg-[#EAE8E3]'
                                    }`}
                                    onClick={() => setPreviewDoc(isSelectedForPreview ? null : doc)}
                                    title="Preview directly inside sidepeek"
                                  >
                                    <Eye className="h-3 w-3" />
                                    {isSelectedForPreview ? 'Previewing' : 'Preview'}
                                  </Button>

                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="xs"
                                    className="gap-1 text-xs font-mono uppercase tracking-wider text-[#0A0A0A] hover:bg-[#EAE8E3] rounded-none"
                                    onClick={() => setViewerDoc(doc)}
                                    title="Open full document modal with comments"
                                  >
                                    <Maximize2 className="h-3 w-3" />
                                    Full View
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="p-12 text-center text-sm font-mono text-[#4A4945]">
                  Work request not found.
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="px-6 py-3.5 border-t-2 border-[#0A0A0A] bg-[#EAE8E3] flex items-center justify-between font-mono">
              <span className="text-xs text-[#4A4945]">
                ID: {workRequestId}
              </span>
              <div className="flex items-center gap-2">
                {onViewInBoard && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onViewInBoard(workRequestId);
                      onClose();
                    }}
                    className="text-xs font-mono uppercase tracking-wider rounded-none border border-[#0A0A0A] bg-[#FAF9F5] text-[#0A0A0A] hover:bg-[#EAE8E3] gap-1.5"
                  >
                    <Columns className="h-3.5 w-3.5 text-[#0A0A0A]" />
                    View in Board
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  onClick={onClose}
                  className="rounded-none bg-[#0A0A0A] text-[#FAF9F5] hover:bg-[#E61919] font-mono text-xs uppercase tracking-wider px-4"
                >
                  Done
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Task Inspection Modal (when a task is selected from the sidepeek) */}
      {selectedTask && (
        <TaskDetailModal
          isOpen={Boolean(selectedTask)}
          onClose={() => setSelectedTask(null)}
          task={selectedTask}
          workRequest={workRequest}
        />
      )}

      {/* Document Viewer Modal (when Full View is selected) */}
      {viewerDoc && (
        <DocumentViewerModal
          isOpen={Boolean(viewerDoc)}
          onClose={() => setViewerDoc(null)}
          document={viewerDoc}
          workRequest={workRequest}
        />
      )}

      {/* Conflict Resolution Modal for OCC Concurrency Conflicts */}
      <ConflictResolutionModal
        isOpen={conflictModalState.isOpen}
        onClose={() => setConflictModalState((prev) => ({ ...prev, isOpen: false }))}
        error={conflictModalState.error}
        entityTitle={workRequest?.title}
        entityType="Work Request"
        expectedVersion={workRequest?.version}
        attemptedStatus={conflictModalState.attemptedStatus}
        currentStatus={workRequest?.status}
        onRefreshAndKeepLatest={async () => {
          if (workRequest?.id) {
            await queryClient.refetchQueries({
              queryKey: operationsKeys.workRequestDetail(workRequest.id),
            });
            await queryClient.refetchQueries({
              queryKey: operationsKeys.workRequests(),
            });
          }
          setConflictModalState((prev) => ({ ...prev, isOpen: false }));
        }}
        onCancel={() => setConflictModalState((prev) => ({ ...prev, isOpen: false }))}
      />
    </>
  );
}

/**
 * Inline Document Previewer Box embedded inside the WorkRequestSidePeek
 */
function InlineDocPreviewPanel({
  document,
  onClose,
  onOpenFullViewer,
}: {
  document: DmsDocument;
  onClose: () => void;
  onOpenFullViewer: () => void;
}) {
  const { data: downloadData, isLoading } = useDocumentDownloadUrl(document.id);
  const name = document.fileName || document.file_name || document.originalName || 'Document';
  const effectiveExternalUrl =
    (document.external_url && document.external_url.trim()) ||
    (document.externalUrl && document.externalUrl.trim()) ||
    null;
  const rawUrl = effectiveExternalUrl || downloadData?.url || null;
  const parsedExternal = parseExternalUrl(rawUrl || '', name);
  const previewUrl = parsedExternal.isGoogleDrive ? parsedExternal.previewUrl : rawUrl;
  const isExternal = Boolean(
    effectiveExternalUrl ||
    parsedExternal.isGoogleDrive
  );
  const downloadUrl = isExternal ? null : rawUrl;

  const contentType = document.contentType || document.content_type || '';
  const isPdf = name.toLowerCase().endsWith('.pdf') || contentType.includes('pdf');
  const isImg = /\.(png|jpe?g|gif|webp|svg)$/i.test(name) || contentType.startsWith('image/');
  const isText = /\.(txt|json|csv|md|log)$/i.test(name) || contentType.includes('text');

  return (
    <div className="border border-[#0A0A0A] bg-[#EAE8E3] rounded-none p-3.5 space-y-2.5 shadow-none font-mono">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-[#0A0A0A] pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Eye className="h-4 w-4 text-[#0A0A0A] shrink-0" />
          <span className="font-bold text-xs text-[#0A0A0A] truncate" title={name}>
            Previewing: {name}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {isExternal ? (
            <a
              href={effectiveExternalUrl || parsedExternal.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button size="xs" variant="outline" className="gap-1 text-xs font-mono uppercase tracking-wider h-7 text-[#0A0A0A] border border-[#0A0A0A] bg-[#FAF9F5] hover:bg-[#EAE8E3] rounded-none">
                <ExternalLink className="h-3 w-3" />
                {parsedExternal.isGoogleDrive ? 'Open in Drive' : 'Open Link'}
              </Button>
            </a>
          ) : downloadUrl ? (
            <a href={downloadUrl} download={name} target="_blank" rel="noreferrer">
              <Button size="xs" variant="outline" className="gap-1 text-xs font-mono uppercase tracking-wider h-7 rounded-none border border-[#0A0A0A] bg-[#FAF9F5] text-[#0A0A0A] hover:bg-[#EAE8E3]">
                <Download className="h-3 w-3" /> Download
              </Button>
            </a>
          ) : null}
          <Button
            size="xs"
            variant="outline"
            className="gap-1 text-xs font-mono uppercase tracking-wider h-7 text-[#0A0A0A] border border-[#0A0A0A] bg-[#FAF9F5] hover:bg-[#EAE8E3] rounded-none"
            onClick={onOpenFullViewer}
          >
            <ExternalLink className="h-3 w-3" /> Full View
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={onClose}
            className="text-[#4A4945] hover:text-[#0A0A0A] hover:bg-[#EAE8E3] h-7 w-7 rounded-none"
            title="Close Preview"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Panel Body */}
      <div className="bg-[#FAF9F5] rounded-none border border-[#0A0A0A] overflow-hidden min-h-[220px]">
        {isLoading && !document.external_url && !document.externalUrl ? (
          <div className="p-10 text-center text-xs text-[#4A4945] space-y-2">
            <div className="w-6 h-6 border-2 border-[#0A0A0A] border-t-transparent rounded-none animate-spin mx-auto" />
            <p>Loading document preview...</p>
          </div>
        ) : !previewUrl ? (
          <div className="p-8 text-center text-xs text-[#4A4945]">
            Preview is unavailable for this document.
          </div>
        ) : parsedExternal.isGoogleDrive && previewUrl ? (
          <div className="w-full flex flex-col">
            <div className="bg-[#EAE8E3] border-b border-[#0A0A0A] px-3 py-1.5 flex items-center justify-between text-xs text-[#0A0A0A]">
              <span>Google Drive Preview</span>
              <a
                href={parsedExternal.originalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline hover:text-[#E61919] flex items-center gap-1"
              >
                Open Original <ExternalLink className="h-3 w-3" />
              </a>
            </div>
            <iframe
              src={previewUrl}
              className="w-full h-80 sm:h-96 border-0"
              title={`Preview - ${name}`}
              allow="autoplay"
              data-testid="inline-doc-preview-gdrive"
            />
          </div>
        ) : isExternal ? (
          <div className="p-8 text-center space-y-3">
            <ExternalLink className="h-10 w-10 text-[#0A0A0A] mx-auto" />
            <div className="space-y-1">
              <h5 className="font-semibold text-[#0A0A0A] text-xs">{name}</h5>
              <p className="text-xs text-[#4A4945] max-w-xs mx-auto">
                This external link cannot be embedded inline. You can open the link directly in a new tab.
              </p>
            </div>
            <a
              href={effectiveExternalUrl || parsedExternal.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button size="sm" className="gap-1.5 text-xs text-[#FAF9F5] bg-[#0A0A0A] hover:bg-[#E61919] rounded-none font-mono uppercase tracking-wider">
                <ExternalLink className="h-3.5 w-3.5" /> Open External Link
              </Button>
            </a>
          </div>
        ) : isPdf ? (
          <iframe
            src={previewUrl}
            className="w-full h-80 sm:h-96 border-0"
            title={`Preview - ${name}`}
            data-testid="inline-doc-preview-frame"
          />
        ) : isImg ? (
          <div className="w-full h-72 sm:h-80 flex items-center justify-center p-3 bg-[#EAE8E3]/40">
            <img
              src={previewUrl}
              alt={name}
              className="max-h-full max-w-full object-contain rounded-none shadow-none"
              data-testid="inline-doc-preview-image"
            />
          </div>
        ) : isText ? (
          <iframe
            src={previewUrl}
            className="w-full h-72 border-0 font-mono text-xs p-3 bg-[#FAF9F5]"
            title={`Preview - ${name}`}
            data-testid="inline-doc-preview-frame"
          />
        ) : (
          <div className="p-8 text-center space-y-3">
            <FileText className="h-10 w-10 text-[#0A0A0A] mx-auto" />
            <div className="space-y-1">
              <h5 className="font-semibold text-[#0A0A0A] text-xs">{name}</h5>
              <p className="text-xs text-[#4A4945]">
                This document type cannot be embedded inline. You can download or open it in the full viewer.
              </p>
            </div>
            {downloadUrl ? (
              <a href={downloadUrl} download={name} target="_blank" rel="noreferrer">
                <Button size="sm" className="gap-1.5 text-xs font-mono uppercase tracking-wider rounded-none border border-[#0A0A0A] bg-[#FAF9F5] text-[#0A0A0A] hover:bg-[#EAE8E3]">
                  <Download className="h-3.5 w-3.5" /> Download File
                </Button>
              </a>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
