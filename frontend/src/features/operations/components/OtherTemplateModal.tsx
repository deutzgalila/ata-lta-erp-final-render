import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Layers,
  Split,
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
import { useRetainerMutations } from '../api/useRetainers';
import { parseTaskDelimiterInput } from '../hooks/useTokenizer';
import { usePermission } from '@/lib/permissions';
import { useSessionStore } from '@/lib/session';
import type {
  RetainerTemplate,
  RetainerTemplateTask,
  CreateRetainerTemplateInput,
  CreatablePhase,
} from '../api/types';

export interface OtherTemplateModalProps {
  template: RetainerTemplate | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function OtherTemplateModal({
  template,
  isOpen,
  onClose,
  onSuccess,
}: OtherTemplateModalProps) {
  const user = useSessionStore((state) => state.user);
  const canEditRetainers = usePermission('retainers:edit') || user?.role === 'Admin';
  const { createTemplate, updateTemplate, isPending } = useRetainerMutations();

  const isEditing = Boolean(template);

  // Form State strictly: Title, Description, Tasks
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tasks, setTasks] = useState<RetainerTemplateTask[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (template) {
      setTitle(template.title || template.name || '');
      setDescription(template.description || '');
      setTasks(
        (template.tasks || []).map((t, idx) => ({
          ...t,
          local_id: t.local_id || t.localId || `task_${idx + 1}`,
          phase: t.phase || 'pre_processing',
          depends_on_local_id: t.depends_on_local_id || t.dependsOnLocalId || null,
        }))
      );
      setErrors({});
    } else {
      setTitle('');
      setDescription('');
      setTasks([
        {
          local_id: 'task_1',
          title: '',
          description: '',
          phase: 'pre_processing',
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

  // Expand comma delimited title into sibling tasks
  const handleSplitTask = (index: number) => {
    const target = tasks[index];
    if (!target) return;
    const tokenizer = parseTaskDelimiterInput(target.title);
    if (!tokenizer.shouldSplit || tokenizer.tokens.length <= 1) return;

    const basePhase = target.phase || 'pre_processing';
    const splitTasks: RetainerTemplateTask[] = tokenizer.tokens.map((token, tIdx) => ({
      local_id: `task_${Date.now()}_${tIdx}`,
      title: token,
      description: target.description || '',
      phase: basePhase,
      depends_on_local_id: tIdx === 0 ? target.depends_on_local_id : null,
    }));

    const nextTasks = [
      ...tasks.slice(0, index),
      ...splitTasks,
      ...tasks.slice(index + 1),
    ];
    setTasks(nextTasks);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrors({ title: 'Template title is required.' });
      return;
    }

    if (tasks.length === 0) {
      setErrors({ tasks: 'Template must contain at least one task.' });
      return;
    }

    // Validate tasks
    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];
      if (!task?.title.trim()) {
        setErrors({ [`task_${i}`]: 'Task title is required.' });
        return;
      }
      if (task.phase !== 'pre_processing' && task.phase !== 'processing') {
        setErrors({ [`task_phase_${i}`]: 'Phase must be Pre-Processing or Processing.' });
        return;
      }
    }

    const payload: CreateRetainerTemplateInput = {
      name: trimmedTitle,
      title: trimmedTitle,
      description: description.trim() || null,
      templateType: 'other',
      template_type: 'other',
      clientId: null,
      client_id: null,
      schedule: null,
      priority: 'Normal',
      pfAmount: 0,
      pf_amount: 0,
      recurrence: 'none',
      tasks: tasks.map((t) => ({
        local_id: t.local_id,
        title: t.title.trim(),
        description: t.description?.trim() || null,
        phase: t.phase,
        depends_on_local_id: t.depends_on_local_id || null,
      })),
    };

    try {
      if (isEditing && template) {
        await updateTemplate({ id: template.id, data: payload });
      } else {
        await createTemplate(payload);
      }

      if (onSuccess) onSuccess();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save template';
      setErrors({ form: message });
    }
  };

  if (!canEditRetainers) {
    return (
      <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="max-w-md p-6" data-testid="unauthorized-other-template-modal">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              Access Restricted
            </DialogTitle>
            <DialogDescription className="text-xs text-rose-600">
              You do not have permission to author or edit templates (<code className="font-mono">retainers:edit</code> required).
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
        data-testid="other-template-modal"
      >
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-slate-900">
            {isEditing ? `Edit Other Template: ${template?.name}` : 'New Other Template Builder'}
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-600">
            Configure reusable ad-hoc workflow blueprint with strictly Title and Tasks/Subtasks.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="space-y-4 pt-2">
          {errors.form && (
            <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-700">
              {errors.form}
            </div>
          )}

          {/* 1. Template Title (Required) */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">
              Template Title <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              placeholder="e.g. Ad-hoc Tax Assessment Representation, SEC Charter Amendment"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (errors.title) setErrors((prev) => ({ ...prev, title: '' }));
              }}
              className="h-9 bg-white text-xs"
              data-testid="other-template-title-input"
            />
            {errors.title && <p className="text-xs text-rose-600">{errors.title}</p>}
          </div>

          {/* 2. Description / Notes (Optional) */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">
              Description / Notes (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="Provide workflow context or operational instructions..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-md border border-slate-200 bg-white p-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              data-testid="other-template-description-input"
            />
          </div>

          {/* 3. Tasks & Subtasks Builder */}
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <Layers className="h-4 w-4 text-blue-600" />
                  Tasks & Subtasks Builder ({tasks.length} task{tasks.length !== 1 ? 's' : ''})
                </h4>
                <p className="text-[11px] text-slate-500">
                  Define workflow phases and dependencies. Titles containing commas can be expanded into individual tasks.
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
                Add Task
              </Button>
            </div>

            {errors.tasks && <p className="text-xs text-rose-600">{errors.tasks}</p>}

            {/* Task Rows List */}
            <div className="space-y-2.5" data-testid="task-rows-container">
              {tasks.map((task, idx) => {
                const tokenizer = parseTaskDelimiterInput(task.title);
                const predecessorOptions = tasks
                  .filter((_, i) => i < idx)
                  .map((t) => ({
                    localId: t.local_id || `task_${idx}`,
                    title: t.title || `Task #${tasks.indexOf(t) + 1}`,
                  }));

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
                        <div className="flex-1 space-y-1">
                          <Input
                            type="text"
                            placeholder="Task title (e.g. Draft Resolution, Review Filings)"
                            value={task.title}
                            onChange={(e) => updateTaskField(idx, 'title', e.target.value)}
                            className="h-8 text-xs"
                            data-testid={`task-title-input-${idx}`}
                          />
                          {errors[`task_${idx}`] && (
                            <p className="text-[11px] text-rose-600">{errors[`task_${idx}`]}</p>
                          )}
                          {tokenizer.shouldSplit && (
                            <div className="flex items-center gap-2 pt-0.5">
                              <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                Contains delimiter ({tokenizer.count} tasks detected)
                              </span>
                              <button
                                type="button"
                                onClick={() => handleSplitTask(idx)}
                                className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5 font-medium"
                                data-testid={`split-task-btn-${idx}`}
                              >
                                <Split className="h-3 w-3" /> Split into rows
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Phase Selector: Pre-Processing or Processing */}
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

                    {/* Secondary Row: Dependency */}
                    <div className="text-xs pt-1 border-t border-slate-100 flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1">
                        <label className="text-[11px] text-slate-500 font-medium whitespace-nowrap">
                          Depends on:
                        </label>
                        <Select
                          value={task.depends_on_local_id || 'none'}
                          onValueChange={(val) =>
                            updateTaskField(idx, 'depends_on_local_id', val === 'none' ? null : val)
                          }
                          disabled={predecessorOptions.length === 0}
                        >
                          <SelectTrigger
                            className="h-7 text-xs bg-white max-w-xs"
                            data-testid={`task-dep-select-${idx}`}
                          >
                            <SelectValue
                              placeholder={
                                predecessorOptions.length === 0
                                  ? 'No prior tasks'
                                  : 'Select prerequisite...'
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none" className="text-xs text-slate-500">
                              None (Independent)
                            </SelectItem>
                            {predecessorOptions.map((opt) => (
                              <SelectItem key={opt.localId} value={opt.localId} className="text-xs">
                                {opt.title}
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

          <DialogFooter className="pt-4 border-t border-slate-200">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs"
              data-testid="other-template-cancel-btn"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isPending}
              className="text-xs font-semibold"
              data-testid="other-template-submit-btn"
            >
              {isPending
                ? 'Saving...'
                : isEditing
                  ? 'Update Other Template'
                  : 'Create Other Template'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
