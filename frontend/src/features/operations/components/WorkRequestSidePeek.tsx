import { useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  useWorkRequestDetail,
} from '../api/useWorkRequests';
import { useWorkRequestTasks } from '../api/useTasks';
import { useDocuments } from '../api/useDocuments';
import { useTeam } from '../api/useTeam';
import { useSessionStore } from '@/lib/session';
import { hasPermission } from '@/lib/permissions';
import { getPhaseBadgeInfo, getStatusBadgeInfo } from '../lib/statusBadges';
import type { WorkRequest, Task, Phase } from '../api/types';

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
  const canEdit = hasPermission(permissions, 'workflow:edit');

  // Fetch work request detail
  const {
    data: workRequest,
    isLoading: isLoadingWr,
  } = useWorkRequestDetail(workRequestId || '', {
    enabled: Boolean(isOpen && workRequestId),
  });

  // Fetch tasks
  const {
    data: tasks = [],
    isLoading: isLoadingTasks,
  } = useWorkRequestTasks(workRequestId || '', {
    enabled: Boolean(isOpen && workRequestId),
  });

  // Fetch documents
  const { data: rawDocs } = useDocuments(
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
    return workRequest.coAssignees.map((val) => resolveUserName(val));
  }, [workRequest, resolveUserName]);

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

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

  if (!isOpen || !workRequestId) return null;

  return (
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
      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-xl md:max-w-2xl bg-white shadow-2xl border-l border-slate-200 flex flex-col h-full animate-in slide-in-from-right duration-200">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-start justify-between gap-4">
            <div className="space-y-1.5 flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {workRequest && (
                  <>
                    <Badge
                      variant={workRequest.entity === 'LTA' ? 'lta' : 'ata'}
                      size="compact"
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
                    >
                      {workRequest.priority} Priority
                    </Badge>
                    {(() => {
                      const phaseInfo = getPhaseBadgeInfo(workRequest.phase);
                      const PhaseIcon = phaseInfo.Icon;
                      return (
                        <span
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold border ${phaseInfo.badgeClass}`}
                          data-testid="side-peek-phase"
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${phaseInfo.dotClass}`} />
                          <PhaseIcon className="w-3.5 h-3.5 shrink-0" />
                          <span>Phase: {workRequest.phase.replace('_', ' ')}</span>
                        </span>
                      );
                    })()}
                    {(() => {
                      const statusInfo = getStatusBadgeInfo(workRequest.status);
                      const StatusIcon = statusInfo.Icon;
                      return (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${statusInfo.badgeClass}`}
                          data-testid="side-peek-status"
                        >
                          <span className={`w-1 h-1 rounded-full ${statusInfo.dotClass}`} />
                          <StatusIcon className="w-3 h-3 shrink-0" />
                          <span>{workRequest.status}</span>
                        </span>
                      );
                    })()}
                  </>
                )}
              </div>

              <h2
                className="text-lg font-bold text-slate-900 truncate"
                data-testid="side-peek-title"
              >
                {isLoadingWr ? 'Loading Work Request...' : workRequest?.title || 'Work Request'}
              </h2>
            </div>

            {/* Action buttons in header */}
            <div className="flex items-center gap-1 shrink-0">
              {onViewInBoard && (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    onViewInBoard(workRequestId);
                    onClose();
                  }}
                  className="text-xs gap-1"
                  data-testid="side-peek-board-btn"
                  title="Open in Kanban Board"
                >
                  <Columns className="h-3.5 w-3.5 text-blue-600" />
                  Board
                </Button>
              )}
              {canEdit && onEdit && workRequest && (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => {
                    onEdit(workRequest);
                    onClose();
                  }}
                  className="text-xs gap-1"
                  data-testid="side-peek-edit-btn"
                  title="Edit Work Request"
                >
                  <Edit className="h-3.5 w-3.5 text-slate-600" />
                  Edit
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                onClick={onClose}
                className="text-slate-400 hover:text-slate-700 ml-1"
                data-testid="side-peek-close-btn"
                aria-label="Close Side Peek"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Drawer Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {isLoadingWr ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Loading work request details...
              </div>
            ) : workRequest ? (
              <>
                {/* 1. Gate Blocker Warning */}
                {blockerInfo.hasBlockers && (
                  <div
                    className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1"
                    data-testid="side-peek-blocker-alert"
                  >
                    <div className="flex items-center gap-1.5 font-bold">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                      <span>Phase Advancement Blocked</span>
                    </div>
                    <p className="text-[11px] text-amber-700 pl-5.5">
                      {blockerInfo.incomplete.length} task(s) in phase &quot;
                      {workRequest.phase.replace('_', ' ')}&quot; must be completed before advancing.
                    </p>
                  </div>
                )}

                {/* 2. Key Attributes Grid */}
                <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                      Client
                    </span>
                    <div
                      className="flex items-center gap-1.5 font-medium text-slate-800 truncate"
                      data-testid="side-peek-client"
                    >
                      <Building className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{workRequest.clientName || '—'}</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                      Due Date
                    </span>
                    <div className="flex items-center gap-1.5 font-medium text-slate-800">
                      <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span>
                        {workRequest.dueDate
                          ? new Date(workRequest.dueDate).toLocaleDateString()
                          : 'No due date'}
                      </span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                      Assigned Lead
                    </span>
                    <div
                      className="flex items-center gap-1.5 font-medium text-slate-800 truncate"
                      data-testid="side-peek-assignee"
                    >
                      <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{assignedLeadName}</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                      Created Date
                    </span>
                    <div className="flex items-center gap-1.5 font-medium text-slate-800">
                      <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span>
                        {workRequest.createdAt
                          ? new Date(workRequest.createdAt).toLocaleDateString()
                          : 'N/A'}
                      </span>
                    </div>
                  </div>

                  {coAssigneeNames.length > 0 && (
                    <div className="col-span-2 pt-1 border-t border-slate-200">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                        Team Members / Co-Assignees
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {coAssigneeNames.map((name, idx) => (
                          <Badge key={`${name}-${idx}`} variant="secondary" size="compact" className="text-[10px]" data-testid="side-peek-co-assignee">
                            <Users className="h-2.5 w-2.5 mr-1" />
                            {name}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. Description */}
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Description & Objectives
                  </h4>
                  <div className="p-3.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 whitespace-pre-wrap leading-relaxed min-h-[50px]">
                    {workRequest.description || (
                      <span className="text-slate-400 italic">No description provided.</span>
                    )}
                  </div>
                </div>

                {/* 4. Tasks Breakdown */}
                <div className="space-y-2.5" data-testid="side-peek-tasks">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <CheckSquare className="h-3.5 w-3.5" />
                      Tasks Breakdown ({tasks.filter((t) => t.status === 'Completed').length}/{tasks.length})
                    </h4>
                  </div>

                  {isLoadingTasks ? (
                    <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded border border-slate-200">
                      Loading tasks...
                    </div>
                  ) : tasks.length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded border border-slate-200 italic">
                      No tasks created for this work request yet.
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-lg overflow-hidden divide-y divide-slate-100 bg-white">
                      {tasks.map((task) => {
                        const isCompleted = task.status === 'Completed';

                        return (
                          <div
                            key={task.id}
                            className="p-3 flex items-center justify-between gap-3 text-xs hover:bg-slate-50 transition-colors"
                            data-testid={`side-peek-task-${task.id}`}
                          >
                            <div className="flex items-start gap-2 min-w-0">
                              <CheckCircle2
                                className={`h-4 w-4 shrink-0 mt-0.5 ${
                                  isCompleted ? 'text-emerald-500' : 'text-slate-300'
                                }`}
                              />
                              <div className="min-w-0">
                                <span
                                  className={`font-medium block truncate ${
                                    isCompleted ? 'line-through text-slate-400' : 'text-slate-800'
                                  }`}
                                >
                                  {task.title}
                                </span>
                                <div className="flex items-center gap-2 text-[10px] text-slate-400 pt-0.5">
                                  <span>{task.phase.replace('_', ' ')}</span>
                                  {(task.assigneeName || task.assigneeId) && (
                                    <>
                                      <span>•</span>
                                      <span>{task.assigneeName ? resolveUserName(task.assigneeName) : resolveUserName(task.assigneeId)}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {task.qaStatus && (
                                <Badge
                                  variant={task.qaStatus === 'passed' ? 'success' : 'destructive'}
                                  size="compact"
                                  className="text-[9px]"
                                >
                                  QA: {task.qaStatus}
                                </Badge>
                              )}
                              <Badge
                                variant={isCompleted ? 'success' : 'secondary'}
                                size="compact"
                                className="text-[10px]"
                              >
                                {task.status}
                              </Badge>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 5. Documents Section */}
                {documents.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      Documents ({documents.length})
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {documents.map((doc) => (
                        <div
                          key={doc.id}
                          className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs truncate flex items-center gap-2"
                        >
                          <FileText className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                          <span className="truncate text-slate-800 font-medium">
                            {doc.fileName || doc.file_name || doc.originalName || 'Document'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="p-8 text-center text-xs text-slate-400">
                Work request not found.
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
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
                  className="text-xs gap-1.5"
                >
                  <Columns className="h-3.5 w-3.5 text-blue-600" />
                  View in Board
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onClose}
                className="text-xs"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
