import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Clock,
  FileText,
  CheckSquare,
  User,
  Calendar,
  Plus,
  CheckCircle2,
  AlertCircle,
  FileQuestion,
  Eye,
  Layers,
  Receipt,
  CreditCard,
  Send,
  Upload,
  ExternalLink,
  Link as LinkIcon,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useTimeEntriesList, useCreateTimeEntry } from '@/features/dashboard/api/useTimeEntries';
import { InvoiceCreateModal } from '@/features/billing';
import { CreateDisbursementModal } from '@/features/disbursements';
import { TransmittalFormModal } from '@/features/transmittals';
import { DocumentUploadModal, DocumentViewerModal } from '@/features/documents';
import { useDocuments } from '../api/useDocuments';
import { useTaskMutations, useTaskRelated } from '../api/useTasks';
import { useTeam } from '../api/useTeam';
import { useSessionStore } from '@/lib/session';
import { hasPermission } from '@/lib/permissions';
import { runBlockingAction } from './BlockingActionModal';
import { operationsKeys } from '../api/queryKeys';
import type { Task, WorkRequest, DmsDocument, TaskStatus } from '../api/types';

export interface TaskDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  workRequest?: WorkRequest | null;
  onTaskUpdated?: (updatedTask: Task) => void;
}

export function TaskDetailModal({
  isOpen,
  onClose,
  task,
  workRequest,
  onTaskUpdated,
}: TaskDetailModalProps) {
  // Time logging form state
  const [logDate, setLogDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [logMinutes, setLogMinutes] = useState<number>(30);
  const [logNote, setLogNote] = useState('');
  const [showLogForm, setShowLogForm] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  // Selected document for preview
  const [selectedDoc, setSelectedDoc] = useState<DmsDocument | null>(null);

  // Time entries for this task
  const { data: timeEntries = [], isLoading: isLoadingTime } = useTimeEntriesList(
    task?.id ? { taskId: task.id } : undefined
  );

  // Documents linked to this work request / task
  const { data: rawDocs, isLoading: isLoadingDocs, refetch: refetchDocs } = useDocuments(
    task?.workRequestId ? { workRequestId: task.workRequestId } : undefined,
    { enabled: Boolean(task?.workRequestId) }
  );

  const linkedDocs: DmsDocument[] = useMemo(() => {
    const docs = Array.isArray(rawDocs) ? rawDocs : rawDocs?.data ?? [];
    if (!task) return docs;
    // Return docs explicitly linked to this task or all WR docs if none specific
    const taskSpecific = docs.filter(
      (d) => d.linkedTaskId === task.id || d.linked_task_id === task.id
    );
    return taskSpecific.length > 0 ? taskSpecific : docs;
  }, [rawDocs, task]);

  // Mutations
  const createTimeEntryMutation = useCreateTimeEntry();
  const { updateTask } = useTaskMutations(task?.workRequestId || '');

  const queryClient = useQueryClient();
  const permissions = useSessionStore((state) => state.permissions);
  const currentUserId = useSessionStore((state) => state.user?.id);
  const canEdit = hasPermission(permissions, 'workflow:edit');

  // RBAC permissions for linked financial creation (UAT2-7)
  const canCreateInvoice =
    hasPermission(permissions, 'billing:edit') ||
    hasPermission(permissions, 'billing:create');
  const canCreateDisbursement =
    hasPermission(permissions, 'disbursement:create') ||
    hasPermission(permissions, 'disbursement:edit');
  const canCreateTransmittal =
    hasPermission(permissions, 'transmittal:create') ||
    hasPermission(permissions, 'transmittal:edit');

  // Financial creation modals state (UAT2-7)
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [isDisbursementModalOpen, setIsDisbursementModalOpen] = useState(false);
  const [isTransmittalModalOpen, setIsTransmittalModalOpen] = useState(false);

  // Document upload modal state (UAT2-11)
  const [isUploadDocModalOpen, setIsUploadDocModalOpen] = useState(false);

  // Linked records query (UAT2-7)
  const { data: relatedRecords, refetch: refetchRelated } = useTaskRelated(task?.id);
  const invoices = relatedRecords?.invoices || [];
  const disbursements = relatedRecords?.disbursements || [];
  const transmittals = relatedRecords?.transmittals || [];

  // Team directory lookup for employee assignment (UAT2-8)
  const { data: rawTeam } = useTeam();
  const teamList = useMemo(() => {
    if (Array.isArray(rawTeam)) return rawTeam;
    if (rawTeam && typeof rawTeam === 'object' && 'data' in rawTeam && Array.isArray((rawTeam as { data: unknown[] }).data)) {
      return (rawTeam as { data: Array<{ id: string; name: string; role: string }> }).data;
    }
    return [];
  }, [rawTeam]);

  const currentAssigneeIds = useMemo(() => {
    const ids = new Set<string>();
    if (task?.assigneeId) ids.add(task.assigneeId);
    if (Array.isArray(task?.assignees)) {
      task.assignees.forEach((id) => ids.add(id));
    }
    if (Array.isArray(task?.taskAssignees)) {
      task.taskAssignees.forEach((ta) => {
        const uId = ta.userId || ta.user_id;
        if (uId) ids.add(uId);
      });
    }
    return ids;
  }, [task]);

  const availableTeamMembers = useMemo(() => {
    return teamList.filter((m) => m && m.id && !currentAssigneeIds.has(m.id));
  }, [teamList, currentAssigneeIds]);

  // Check if current caller is an assignee or workflow:edit holder (UAT2-9-frontend)
  const isAssignee = useMemo(() => {
    if (!currentUserId || !task) return false;
    if (task.assigneeId === currentUserId) return true;
    if (Array.isArray(task.assignees) && task.assignees.includes(currentUserId)) return true;
    if (Array.isArray(task.taskAssignees) && task.taskAssignees.some((ta) => (ta.userId || ta.user_id) === currentUserId)) return true;
    return false;
  }, [currentUserId, task]);

  const canMutateStatus = canEdit || isAssignee;

  // Handle assigning an employee (UAT2-8)
  const handleAssignEmployee = async (employeeId: string) => {
    if (!task || !task.workRequestId) return;
    const member = teamList.find((m) => m.id === employeeId);
    if (!member) return;
    const nextAssigneeIds = Array.from(new Set([...currentAssigneeIds, employeeId]));
    const nextAssigneeName = task.assigneeName || member.name;
    const nextAssigneeId = task.assigneeId || member.id;

    await runBlockingAction({
      title: 'Assigning Employee',
      message: `Assigning ${member.name} to task "${task.title}"...`,
      apiCall: async () => {
        return await updateTask({
          workRequestId: task.workRequestId,
          taskId: task.id,
          data: {
            assigneeId: nextAssigneeId,
            assigneeName: nextAssigneeName,
            assignees: nextAssigneeIds,
          },
        });
      },
      successTitle: 'Employee Assigned',
      successMessage: `${member.name} has been assigned to this task.`,
      onSuccess: (updated) => {
        if (updated && onTaskUpdated) {
          onTaskUpdated(updated as Task);
        }
      },
      invalidateQueries: [
        operationsKeys.tasks(task.workRequestId),
        operationsKeys.workRequestDetail(task.workRequestId),
      ],
    });
  };

  // Handle setting task status (UAT2-9-frontend)
  const handleSetTaskStatus = async (nextStatus: TaskStatus) => {
    if (!task || !task.workRequestId) return;

    await runBlockingAction({
      title: 'Updating Task Status',
      message: `Setting status of "${task.title}" to ${nextStatus}...`,
      apiCall: async () => {
        return await updateTask({
          workRequestId: task.workRequestId,
          taskId: task.id,
          data: { status: nextStatus },
        });
      },
      successTitle: 'Task Updated',
      successMessage: `Task "${task.title}" status changed to ${nextStatus}.`,
      onSuccess: (updated) => {
        if (updated && onTaskUpdated) {
          onTaskUpdated(updated as Task);
        }
      },
      invalidateQueries: [
        operationsKeys.tasks(task.workRequestId),
        operationsKeys.workRequestDetail(task.workRequestId),
      ],
    });
  };

  // Calculate total minutes logged
  const totalMinutes = useMemo(() => {
    return timeEntries.reduce((acc, entry) => acc + (entry.durationMinutes || 0), 0);
  }, [timeEntries]);

  const formatHours = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  const handleLogTimeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task) return;
    if (logMinutes <= 0) {
      setLogError('Duration must be greater than 0 minutes.');
      return;
    }
    setLogError(null);

    try {
      await createTimeEntryMutation.mutateAsync({
        taskId: task.id,
        entryDate: logDate || new Date().toISOString().split('T')[0]!,
        durationMinutes: Number(logMinutes),
        note: logNote.trim() || undefined,
      });

      setLogNote('');
      setShowLogForm(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to log time';
      setLogError(msg);
    }
  };

  if (!task) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent
          className="max-w-3xl max-h-[90vh] flex flex-col p-0 overflow-hidden"
          data-testid="task-detail-modal"
        >
          {/* Header */}
          <DialogHeader className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex flex-row items-start justify-between">
            <div className="space-y-1.5 pr-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={workRequest?.entity === 'LTA' ? 'lta' : 'ata'}
                  size="compact"
                >
                  {workRequest?.entity || 'ATA'}
                </Badge>
                <Badge variant="outline" size="compact" className="font-semibold text-blue-700 bg-blue-50">
                  {task.phase.replace('_', ' ')}
                </Badge>
                <Badge
                  variant={task.status === 'Completed' ? 'success' : 'secondary'}
                  size="compact"
                  data-testid="task-status-badge"
                >
                  {task.status}
                </Badge>
                {task.qaStatus && (
                  <Badge
                    variant={task.qaStatus === 'passed' ? 'success' : 'destructive'}
                    size="compact"
                  >
                    QA: {task.qaStatus}
                  </Badge>
                )}
              </div>
              <DialogTitle
                className="text-lg font-bold text-slate-900 leading-tight"
                data-testid="task-title"
              >
                {task.title}
              </DialogTitle>
              {workRequest && (
                <p className="text-xs text-slate-500">
                  Work Request: <span className="font-medium text-slate-700">{workRequest.title}</span>
                </p>
              )}
            </div>

            {canMutateStatus && (
              <div className="flex items-center gap-2 shrink-0">
                {task.status !== 'In Progress' && task.status !== 'Completed' && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleSetTaskStatus('In Progress')}
                    className="text-xs gap-1.5"
                    data-testid="task-status-inprogress-btn"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    Mark In Progress
                  </Button>
                )}
                {task.status === 'Completed' ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleSetTaskStatus('In Progress')}
                    className="text-xs shrink-0 gap-1.5"
                    data-testid="task-toggle-status-btn"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Mark In Progress
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    onClick={() => handleSetTaskStatus('Completed')}
                    className="text-xs shrink-0 gap-1.5"
                    data-testid="task-toggle-status-btn"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Mark Completed
                  </Button>
                )}
              </div>
            )}
          </DialogHeader>

          {/* Modal Body: Scrollable */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* 1. Meta Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                  Assignee
                </span>
                <div
                  className="flex items-center gap-1.5 font-medium text-slate-800 truncate"
                  data-testid="task-assignee"
                >
                  <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{task.assigneeName || 'Unassigned'}</span>
                </div>
                {canEdit && availableTeamMembers.length > 0 && (
                  <div className="mt-1.5" data-testid="assign-employee-container">
                    <Select onValueChange={(val) => handleAssignEmployee(val)}>
                      <SelectTrigger
                        className="h-6 text-[10px] bg-white border-slate-300 w-full px-1.5"
                        data-testid="assign-employee-select"
                      >
                        <SelectValue placeholder="+ Assign Staff..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableTeamMembers.map((m) => (
                          <SelectItem key={m.id} value={m.id} className="text-xs">
                            {m.name} ({m.role})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                  Due Date
                </span>
                <div className="flex items-center gap-1.5 font-medium text-slate-800">
                  <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span>
                    {task.dueDate
                      ? new Date(task.dueDate).toLocaleDateString()
                      : 'Not set'}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                  Phase Entered
                </span>
                <div className="flex items-center gap-1.5 font-medium text-slate-800">
                  <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span>
                    {task.phaseEnteredAt
                      ? new Date(task.phaseEnteredAt).toLocaleDateString()
                      : 'N/A'}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">
                  Total Logged Time
                </span>
                <div className="flex items-center gap-1.5 font-bold text-blue-700">
                  <Clock className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                  <span>{formatHours(totalMinutes)}</span>
                </div>
              </div>
            </div>

            {/* 2. Description / Requirements */}
            <div className="space-y-1.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Description & Instructions
              </h4>
              <div
                className="p-3.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 whitespace-pre-wrap leading-relaxed min-h-[60px]"
                data-testid="task-description"
              >
                {task.description || (
                  <span className="text-slate-400 italic">No description provided for this task.</span>
                )}
              </div>
            </div>

            {/* 3. Checklist Items (if present) */}
            {task.checklist && task.checklist.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <CheckSquare className="h-3.5 w-3.5" />
                  Checklist ({task.checklist.filter((c) => c.completed).length}/{task.checklist.length})
                </h4>
                <div className="p-2 border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
                  {task.checklist.map((item) => (
                    <div key={item.id} className="py-2 px-2 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={item.completed}
                          readOnly
                          className="rounded text-blue-600"
                        />
                        <span className={item.completed ? 'line-through text-slate-400' : 'text-slate-700 font-medium'}>
                          {item.text}
                        </span>
                      </div>
                      {item.assigneeName && (
                        <span className="text-[10px] text-slate-400">{item.assigneeName}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 4. Predecessors (if present) */}
            {task.predecessors && task.predecessors.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5" />
                  Predecessors
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {task.predecessors.map((pId) => (
                    <Badge key={pId} variant="outline" size="compact" className="text-[10px]">
                      Task: {pId}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* 5. Linked Documents Section */}
            <div className="space-y-2.5" data-testid="task-documents-section">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Linked Documents ({linkedDocs.length})
                </h4>
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => setIsUploadDocModalOpen(true)}
                  className="text-xs gap-1"
                  data-testid="task-upload-doc-btn"
                >
                  <Upload className="h-3 w-3" /> Upload Document
                </Button>
              </div>

              {isLoadingDocs ? (
                <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded border border-slate-200">
                  Loading linked documents...
                </div>
              ) : linkedDocs.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded border border-slate-200 italic">
                  No documents linked to this work request or task.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {linkedDocs.map((doc) => {
                    const docName = doc.fileName || doc.file_name || doc.originalName || 'Document';
                    return (
                      <div
                        key={doc.id}
                        onClick={() => setSelectedDoc(doc)}
                        className="p-2.5 bg-white border border-slate-200 hover:border-blue-400 hover:shadow-2xs rounded-lg flex items-center justify-between gap-2 cursor-pointer transition-all"
                        data-testid={`linked-doc-item-${doc.id}`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <FileQuestion className="h-4 w-4 text-blue-600 shrink-0" />
                          <div className="truncate">
                            <span className="text-xs font-medium text-slate-800 block truncate">
                              {docName}
                            </span>
                            <span className="text-[10px] text-slate-400 block">
                              {doc.category || 'General'}
                            </span>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className="shrink-0 text-slate-400 hover:text-blue-600"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Linked Records Section (UAT2-7) */}
            <div className="space-y-2.5" data-testid="task-linked-records-section">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <LinkIcon className="h-4 w-4 text-slate-500" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Linked Records ({invoices.length + disbursements.length + transmittals.length})
                  </h4>
                </div>

                <div className="flex items-center gap-1.5">
                  {canCreateInvoice && (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => setIsInvoiceModalOpen(true)}
                      className="text-xs gap-1"
                      data-testid="link-invoice-btn"
                    >
                      <Receipt className="h-3 w-3" /> + Invoice
                    </Button>
                  )}
                  {canCreateDisbursement && (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => setIsDisbursementModalOpen(true)}
                      className="text-xs gap-1"
                      data-testid="link-disbursement-btn"
                    >
                      <CreditCard className="h-3 w-3" /> + Disbursement
                    </Button>
                  )}
                  {canCreateTransmittal && (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => setIsTransmittalModalOpen(true)}
                      className="text-xs gap-1"
                      data-testid="link-transmittal-btn"
                    >
                      <Send className="h-3 w-3" /> + Transmittal
                    </Button>
                  )}
                </div>
              </div>

              {invoices.length === 0 && disbursements.length === 0 && transmittals.length === 0 ? (
                <div className="p-3 text-center text-xs text-slate-400 bg-slate-50 rounded border border-slate-200 italic">
                  No billing invoices, disbursements, or transmittals linked to this task.
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Invoices */}
                  {invoices.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Invoices ({invoices.length})
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {invoices.map((inv) => (
                          <a
                            key={inv.id}
                            href={`/billing?invoiceId=${inv.id}`}
                            className="p-2.5 bg-white border border-slate-200 hover:border-blue-400 rounded-lg flex items-center justify-between gap-2 text-xs transition-colors"
                            data-testid={`linked-invoice-${inv.id}`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <Receipt className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                              <div className="truncate">
                                <span className="font-semibold text-slate-800 block truncate">
                                  {inv.invoice_number || inv.invoiceNumber || 'Invoice'}
                                </span>
                                <span className="text-[10px] text-slate-400 block">
                                  {inv.clients?.name || 'Client'}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {inv.amount != null && (
                                <span className="font-mono text-[11px] text-slate-700">
                                  ₱{Number(inv.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </span>
                              )}
                              <ExternalLink className="h-3 w-3 text-slate-400" />
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Disbursements */}
                  {disbursements.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Disbursements ({disbursements.length})
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {disbursements.map((d) => (
                          <a
                            key={d.id}
                            href={`/disbursements?id=${d.id}`}
                            className="p-2.5 bg-white border border-slate-200 hover:border-blue-400 rounded-lg flex items-center justify-between gap-2 text-xs transition-colors"
                            data-testid={`linked-disbursement-${d.id}`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <CreditCard className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                              <div className="truncate">
                                <span className="font-semibold text-slate-800 block truncate">
                                  {d.category || 'Disbursement'}
                                </span>
                                <span className="text-[10px] text-slate-400 block truncate">
                                  {d.description || 'No description'}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {d.amount != null && (
                                <span className="font-mono text-[11px] text-slate-700">
                                  ₱{Number(d.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                                </span>
                              )}
                              <ExternalLink className="h-3 w-3 text-slate-400" />
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Transmittals */}
                  {transmittals.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Transmittals ({transmittals.length})
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {transmittals.map((t) => (
                          <a
                            key={t.id}
                            href={`/transmittals?id=${t.id}`}
                            className="p-2.5 bg-white border border-slate-200 hover:border-blue-400 rounded-lg flex items-center justify-between gap-2 text-xs transition-colors"
                            data-testid={`linked-transmittal-${t.id}`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <Send className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                              <div className="truncate">
                                <span className="font-semibold text-slate-800 block truncate">
                                  {t.tracking_number || t.trackingNumber || 'Transmittal'}
                                </span>
                                <span className="text-[10px] text-slate-400 block truncate">
                                  {t.recipient_name || t.recipientName || 'Recipient'}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {t.status && (
                                <Badge variant="outline" size="compact" className="text-[10px]">
                                  {t.status}
                                </Badge>
                              )}
                              <ExternalLink className="h-3 w-3 text-slate-400" />
                            </div>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 6. Time Logged Summary & Quick Log Entry */}
            <div className="space-y-3" data-testid="task-time-logged-section">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-slate-500" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Time Logged ({formatHours(totalMinutes)})
                  </h4>
                </div>

                {!showLogForm && (
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    onClick={() => setShowLogForm(true)}
                    className="text-xs gap-1"
                    data-testid="open-log-time-btn"
                  >
                    <Plus className="h-3 w-3" /> Log Time
                  </Button>
                )}
              </div>

              {/* Quick Log Time Form */}
              {showLogForm && (
                <form
                  onSubmit={handleLogTimeSubmit}
                  className="p-4 bg-blue-50/50 border border-blue-200 rounded-lg space-y-3 text-xs"
                  data-testid="log-time-form"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800">Record Time Spent</span>
                    <button
                      type="button"
                      onClick={() => setShowLogForm(false)}
                      className="text-slate-400 hover:text-slate-600 text-xs"
                    >
                      Cancel
                    </button>
                  </div>

                  {logError && (
                    <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs flex items-center gap-1.5">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>{logError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                        Date
                      </label>
                      <Input
                        type="date"
                        value={logDate}
                        onChange={(e) => setLogDate(e.target.value)}
                        className="h-8 text-xs bg-white"
                        required
                        data-testid="log-time-date-input"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                        Duration (Minutes)
                      </label>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={1}
                          step={5}
                          value={logMinutes}
                          onChange={(e) => setLogMinutes(Number(e.target.value))}
                          className="h-8 text-xs bg-white w-24"
                          required
                          data-testid="log-time-minutes-input"
                        />
                        <div className="flex items-center gap-1">
                          {[15, 30, 60, 120].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setLogMinutes(preset)}
                              className={`px-1.5 py-0.5 rounded text-[10px] border transition-colors ${
                                logMinutes === preset
                                  ? 'bg-blue-600 text-white border-blue-600 font-bold'
                                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                              }`}
                            >
                              {preset}m
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase text-slate-500 block mb-1">
                      Work Note / Activity Description
                    </label>
                    <Input
                      type="text"
                      placeholder="e.g., Reviewed and indexed source document"
                      value={logNote}
                      onChange={(e) => setLogNote(e.target.value)}
                      className="h-8 text-xs bg-white"
                      data-testid="log-time-note-input"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => setShowLogForm(false)}
                      className="text-xs"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      size="xs"
                      disabled={createTimeEntryMutation.isPending}
                      className="text-xs font-semibold"
                      data-testid="log-time-submit-btn"
                    >
                      {createTimeEntryMutation.isPending ? 'Saving...' : 'Save Time Entry'}
                    </Button>
                  </div>
                </form>
              )}

              {/* Time Entries List */}
              {isLoadingTime ? (
                <div className="p-3 text-center text-xs text-slate-400 bg-slate-50 rounded border border-slate-200">
                  Loading time entries...
                </div>
              ) : timeEntries.length === 0 ? (
                <div className="p-3 text-center text-xs text-slate-400 bg-slate-50 rounded border border-slate-200 italic">
                  No time recorded on this task yet. Click &quot;Log Time&quot; to add duration.
                </div>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
                  <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                    {timeEntries.map((entry) => (
                      <div
                        key={entry.id}
                        className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-50 transition-colors"
                        data-testid={`time-entry-item-${entry.id}`}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-800">
                              {formatHours(entry.durationMinutes)}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {entry.entryDate}
                            </span>
                          </div>
                          {entry.note && (
                            <p className="text-[11px] text-slate-600 line-clamp-1">{entry.note}</p>
                          )}
                        </div>
                        <Badge variant="outline" size="compact" className="text-[10px]">
                          {entry.durationMinutes} min
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <DialogFooter className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              Task ID: {task.id}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs"
              data-testid="task-close-btn"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 1. Invoice Create Modal (UAT2-7) */}
      {isInvoiceModalOpen && (
        <InvoiceCreateModal
          isOpen={isInvoiceModalOpen}
          onClose={() => {
            setIsInvoiceModalOpen(false);
            refetchRelated();
          }}
          onCreated={() => {
            setIsInvoiceModalOpen(false);
            refetchRelated();
          }}
          prefill={{
            workRequestId: task.workRequestId,
            taskId: task.id,
            clientId: workRequest?.clientId || undefined,
          }}
        />
      )}

      {/* 2. Disbursement Create Modal (UAT2-7) */}
      {isDisbursementModalOpen && (
        <CreateDisbursementModal
          isOpen={isDisbursementModalOpen}
          onClose={() => {
            setIsDisbursementModalOpen(false);
            refetchRelated();
          }}
          onSuccess={() => {
            setIsDisbursementModalOpen(false);
            refetchRelated();
          }}
          prefill={{
            workRequestId: task.workRequestId,
            taskId: task.id,
            clientId: workRequest?.clientId || undefined,
          }}
        />
      )}

      {/* 3. Transmittal Form Modal (UAT2-7) */}
      {isTransmittalModalOpen && (
        <TransmittalFormModal
          isOpen={isTransmittalModalOpen}
          onClose={() => {
            setIsTransmittalModalOpen(false);
            refetchRelated();
          }}
          prefill={{
            workRequestId: task.workRequestId,
            taskId: task.id,
            clientId: workRequest?.clientId || undefined,
          }}
        />
      )}

      {/* 4. Document Upload Modal (UAT2-11) */}
      {isUploadDocModalOpen && (
        <DocumentUploadModal
          isOpen={isUploadDocModalOpen}
          onClose={() => setIsUploadDocModalOpen(false)}
          defaultWorkRequestId={task.workRequestId}
          defaultClientId={workRequest?.clientId || undefined}
          onSuccess={() => {
            setIsUploadDocModalOpen(false);
            refetchDocs();
            queryClient.invalidateQueries({
              queryKey: operationsKeys.documents(),
            });
          }}
        />
      )}

      {/* 5. Linked Document Viewer Modal */}
      {selectedDoc && (
        <DocumentViewerModal
          isOpen={Boolean(selectedDoc)}
          onClose={() => setSelectedDoc(null)}
          document={selectedDoc}
          workRequest={workRequest}
        />
      )}
    </>
  );
}
