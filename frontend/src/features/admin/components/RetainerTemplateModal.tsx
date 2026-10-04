import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Calendar,
  Clock,
  Layers,
} from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRetainerTemplateMutations } from '../api/useRetainerTemplates';
import { useClients } from '@/features/operations/api/useClients';
import { useUsersList } from '../api/useUsers';
import { usePermission } from '@/lib/permissions';
import type {
  RetainerTemplate,
  RetainerTemplateTask,
  CreateRetainerTemplateInput,
  CreatablePhase,
  Priority,
  RecurrenceType,
} from '../api/types';

export interface RetainerTemplateModalProps {
  template: RetainerTemplate | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function RetainerTemplateModal({
  template,
  isOpen,
  onClose,
  onSuccess,
}: RetainerTemplateModalProps) {
  const canEditRetainers = usePermission('retainers:edit');
  const { createTemplate, updateTemplate } = useRetainerTemplateMutations();

  const { data: clients = [] } = useClients();
  const { data: users = [] } = useUsersList();

  const isEditing = Boolean(template);

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [clientId, setClientId] = useState<string>('');
  const [schedule, setSchedule] = useState<string>('monthly');
  const [priority, setPriority] = useState<Priority>('Normal');
  const [pfAmount, setPfAmount] = useState<number>(0);
  const [recurrence, setRecurrence] = useState<RecurrenceType>('none');
  const [tasks, setTasks] = useState<RetainerTemplateTask[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (template) {
      setName(template.name);
      setDescription(template.description || '');
      setClientId(template.client_id || template.clientId || '');
      setSchedule(template.schedule || 'monthly');
      setPriority(template.priority || 'Normal');
      setPfAmount(template.pf_amount || template.pfAmount || 0);
      setRecurrence(template.recurrence || 'none');
      setTasks(
        (template.tasks || []).map((t, idx) => ({
          ...t,
          local_id: t.local_id || t.localId || `task_${idx + 1}`,
          phase: t.phase || 'pre_processing',
          default_assignees: t.default_assignees || t.defaultAssignees || [],
        }))
      );
      setErrors({});
    } else {
      setName('');
      setDescription('');
      setClientId('');
      setSchedule('monthly');
      setPriority('Normal');
      setPfAmount(0);
      setRecurrence('none');
      setTasks([
        {
          local_id: 'task_1',
          title: '',
          description: '',
          phase: 'pre_processing',
          default_assignees: [],
          depends_on_local_id: null,
        },
      ]);
      setErrors({});
    }
  }, [template, isOpen]);

  // Task Helpers
  const addTaskRow = () => {
    const nextIdx = tasks.length + 1;
    setTasks([
      ...tasks,
      {
        local_id: `task_${nextIdx}`,
        title: '',
        description: '',
        phase: 'pre_processing',
        default_assignees: [],
        depends_on_local_id: null,
      },
    ]);
  };

  const removeTaskRow = (index: number) => {
    if (tasks.length <= 1) return;
    const removedId = tasks[index]?.local_id;
    const newTasks = tasks.filter((_, i) => i !== index);
    // Clear dependencies referencing removed task
    setTasks(
      newTasks.map((t) =>
        t.depends_on_local_id === removedId
          ? { ...t, depends_on_local_id: null }
          : t
      )
    );
  };

  const updateTaskField = <K extends keyof RetainerTemplateTask>(
    index: number,
    field: K,
    val: RetainerTemplateTask[K]
  ) => {
    const updated = [...tasks];
    const target = updated[index];
    if (target) {
      updated[index] = { ...target, [field]: val };
      setTasks(updated);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (!name.trim()) {
      setErrors({ name: 'Template name is required.' });
      return;
    }

    if (tasks.length === 0) {
      setErrors({ tasks: 'Template must contain at least one task blueprint.' });
      return;
    }

    // Validate tasks
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      if (!task?.title.trim()) {
        setErrors({ [`task_${i}`]: 'Task title is required.' });
        return;
      }
      // Ensure phase is strictly pre_processing or processing
      if (task.phase !== 'pre_processing' && task.phase !== 'processing') {
        setErrors({ [`task_phase_${i}`]: 'Phase must be either Pre-Processing or Processing.' });
        return;
      }
    }

    const payload: CreateRetainerTemplateInput = {
      name: name.trim(),
      description: description.trim() || null,
      clientId: clientId || null,
      schedule,
      priority,
      pfAmount: Number(pfAmount) || 0,
      recurrence,
      tasks: tasks.map((t) => ({
        local_id: t.local_id,
        title: t.title.trim(),
        description: t.description?.trim() || null,
        phase: t.phase,
        default_assignees: t.default_assignees || [],
        depends_on_local_id: t.depends_on_local_id || null,
      })),
    };

    try {
      if (isEditing && template) {
        await updateTemplate(template.id, payload);
      } else {
        await createTemplate(payload);
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch {
      // 409 Conflict and other errors surfaced verbatim by runBlockingAction
    }
  };

  if (!canEditRetainers) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-md p-6" data-testid="unauthorized-retainer-modal">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              Access Restricted
            </DialogTitle>
            <DialogDescription className="text-xs text-rose-600">
              You do not have permission to author or edit retainer templates (<code className="font-mono">retainers:edit</code> required).
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button size="sm" onClick={onClose} className="text-xs">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-3xl p-6 max-h-[90vh] overflow-y-auto"
        data-testid="retainer-template-modal"
      >
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-slate-900">
            {isEditing ? `Edit Template: ${template?.name}` : 'New Retainer Template Builder'}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-600">
            Configure reusable multi-task blueprint with P0-D phase assignments and recurrence rules.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          {/* Header Metadata Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50/50 p-3.5 text-xs">
            {/* Template Name */}
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-semibold text-slate-700">
                Template Name <span className="text-rose-500">*</span>
              </label>
              <Input
                type="text"
                placeholder="e.g. Annual BIR Compliance & Tax Filing"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 text-xs bg-white"
                data-testid="template-name-input"
                required
              />
              {errors.name && <p className="text-[11px] text-rose-600">{errors.name}</p>}
            </div>

            {/* Client (Optional default) */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                Default Client (Optional)
              </label>
              <Select value={clientId || 'none'} onValueChange={(val) => setClientId(val === 'none' ? '' : val)}>
                <SelectTrigger className="h-9 text-xs bg-white" data-testid="template-client-select">
                  <SelectValue placeholder="All Clients / Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (Select upon generation)</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">
                      {c.name} ({c.entity})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Billing Schedule */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                Billing Schedule
              </label>
              <Select value={schedule} onValueChange={setSchedule}>
                <SelectTrigger className="h-9 text-xs bg-white" data-testid="template-schedule-select">
                  <SelectValue placeholder="Schedule" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="semi-annual">Semi-Annual</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Default Priority */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                Default Priority
              </label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger className="h-9 text-xs bg-white" data-testid="template-priority-select">
                  <SelectValue placeholder="Priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Low">Low</SelectItem>
                  <SelectItem value="Normal">Normal</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* PF Amount */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                Professional Fee (PHP)
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={pfAmount}
                onChange={(e) => setPfAmount(parseFloat(e.target.value) || 0)}
                className="h-9 text-xs bg-white"
                data-testid="template-pf-input"
              />
            </div>

            {/* Recurrence Toggle */}
            <div className="space-y-1.5 md:col-span-2 pt-1 border-t border-slate-200">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-purple-600" />
                <span>Recurrence Frequency:</span>
              </label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="recurrence"
                    value="none"
                    checked={recurrence === 'none'}
                    onChange={() => setRecurrence('none')}
                    className="text-purple-600 focus:ring-purple-500 h-3.5 w-3.5"
                    data-testid="recurrence-none-radio"
                  />
                  <span>None / Ad-Hoc</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="radio"
                    name="recurrence"
                    value="annual"
                    checked={recurrence === 'annual'}
                    onChange={() => setRecurrence('annual')}
                    className="text-purple-600 focus:ring-purple-500 h-3.5 w-3.5"
                    data-testid="recurrence-annual-radio"
                  />
                  <span className="font-semibold text-purple-800">Annual Recurrence</span>
                </label>
              </div>

              {/* Annual Period Label Formatting Guidance */}
              {recurrence === 'annual' && (
                <div
                  className="rounded-md bg-purple-50 border border-purple-200 p-2.5 text-xs text-purple-800 space-y-1"
                  data-testid="annual-period-hint"
                >
                  <p className="font-semibold flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-purple-600" />
                    Annual Period Label Guidance (e.g. FY-2026, FY-2027)
                  </p>
                  <p className="text-[11px] text-purple-700">
                    When generating work requests from an annual template, you will be prompted for a period label (e.g. <code className="font-mono font-bold">FY-2026</code>). The system enforces duplicate protection (<code className="font-mono">UNIQUE(template_id, period_label)</code>) to prevent accidental duplicate work request creation.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Interactive Task Blueprint Rows */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Layers className="h-4 w-4 text-blue-600" />
                  Task Blueprint Graph ({tasks.length} task{tasks.length !== 1 ? 's' : ''})
                </h4>
                <p className="text-[11px] text-slate-500">
                  Delimiter hint: Title text containing commas, semicolons, or newlines will be split into sibling tasks upon generation.
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addTaskRow}
                className="h-8 gap-1 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
                data-testid="add-task-row-btn"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Task Row
              </Button>
            </div>

            {errors.tasks && <p className="text-xs text-rose-600">{errors.tasks}</p>}

            {/* Task Rows List */}
            <div className="space-y-2.5" data-testid="task-rows-container">
              {tasks.map((task, idx) => {
                const predecessorOptions = tasks
                  .filter((_, i) => i < idx)
                  .map((t) => ({ localId: t.local_id || `task_${idx}`, title: t.title || `Task #${tasks.indexOf(t) + 1}` }));

                return (
                  <div
                    key={task.local_id || idx}
                    className="rounded-lg border border-slate-200 bg-white p-3 shadow-2xs space-y-2.5"
                    data-testid={`task-row-${idx}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-600">
                          {idx + 1}
                        </span>
                        {/* Task Title Input */}
                        <div className="flex-1">
                          <Input
                            type="text"
                            placeholder="Task title (e.g. Prepare draft computation; Review schedules)"
                            value={task.title}
                            onChange={(e) => updateTaskField(idx, 'title', e.target.value)}
                            className="h-8 text-xs"
                            data-testid={`task-title-input-${idx}`}
                            required
                          />
                        </div>
                      </div>

                      {/* Phase Selector - STRICTLY pre_processing | processing per P0-D */}
                      <div className="w-36 shrink-0">
                        <Select
                          value={task.phase}
                          onValueChange={(val) => updateTaskField(idx, 'phase', val as CreatablePhase)}
                        >
                          <SelectTrigger
                            className="h-8 text-xs bg-white font-medium"
                            data-testid={`task-phase-select-${idx}`}
                          >
                            <SelectValue placeholder="Phase" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pre_processing" className="text-xs text-blue-700">
                              Pre-Processing
                            </SelectItem>
                            <SelectItem value="processing" className="text-xs text-emerald-700">
                              Processing
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Delete Task Row Button */}
                      {tasks.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeTaskRow(idx)}
                          className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 shrink-0"
                          title="Remove task row"
                          data-testid={`remove-task-btn-${idx}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>

                    {/* Secondary Row: Dependency & Assignees */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-100">
                      {/* Depends On Local ID */}
                      <div className="space-y-0.5">
                        <label className="text-[11px] text-slate-500 font-medium">
                          Prerequisite Task (Dependency)
                        </label>
                        <Select
                          value={task.depends_on_local_id || 'none'}
                          onValueChange={(val) =>
                            updateTaskField(idx, 'depends_on_local_id', val === 'none' ? null : val)
                          }
                        >
                          <SelectTrigger
                            className="h-7 text-xs bg-slate-50"
                            data-testid={`task-dependency-select-${idx}`}
                          >
                            <SelectValue placeholder="No prerequisite" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None (Can start immediately)</SelectItem>
                            {predecessorOptions.map((opt) => (
                              <SelectItem key={opt.localId} value={opt.localId} className="text-xs">
                                Depends on: {opt.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Default Assignees Multi-Select / Picker */}
                      <div className="space-y-0.5">
                        <label className="text-[11px] text-slate-500 font-medium">
                          Default Assigned Staff
                        </label>
                        <Select
                          value={task.default_assignees?.[0] || 'none'}
                          onValueChange={(val) => {
                            if (val === 'none') {
                              updateTaskField(idx, 'default_assignees', []);
                            } else {
                              updateTaskField(idx, 'default_assignees', [val]);
                            }
                          }}
                        >
                          <SelectTrigger
                            className="h-7 text-xs bg-slate-50"
                            data-testid={`task-assignee-select-${idx}`}
                          >
                            <SelectValue placeholder="Unassigned" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Unassigned</SelectItem>
                            {users.map((u) => (
                              <SelectItem key={u.id} value={u.id} className="text-xs">
                                {u.name} ({u.role})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs h-9"
              data-testid="template-modal-cancel-btn"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="text-xs h-9 bg-[#2563eb] text-white hover:bg-blue-700"
              data-testid="template-modal-submit-btn"
            >
              {isEditing ? 'Save Template Changes' : 'Create Retainer Template'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
