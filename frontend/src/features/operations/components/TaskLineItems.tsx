import React, { useState } from 'react';
import {
  Link2,
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  X,
  AlertTriangle,
  Lock,
  FileText,
  CheckSquare,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { parseTaskDelimiterInput } from '../hooks/useTokenizer';
import { validateDependencies } from '../utils/dependencyValidator';
import type { TeamMember } from '../api/useTeam';
import type { CreatablePhase } from '../api/types';

export interface ChecklistItemData {
  id: string;
  text: string;
  completed: boolean;
  category?: 'subtask' | 'document';
  periodYear?: number | null;
  dependsOn?: string | null;
}

export interface TaskItemData {
  localId: string;
  id?: string;
  title: string;
  description?: string;
  phase: CreatablePhase;
  assigneeId?: string | null;
  coAssignees: string[];
  dependsOn?: string[] | string | null;
  checklist?: ChecklistItemData[];
  dueDate?: string | null;
}

export interface TaskLineItemsProps {
  tasks: TaskItemData[];
  onChange: (tasks: TaskItemData[]) => void;
  projectTeam: TeamMember[];
  disabled?: boolean;
  isEditMode?: boolean;
  defaultPhase?: CreatablePhase;
}

export function TaskLineItems({
  tasks,
  onChange,
  projectTeam,
  disabled = false,
  isEditMode = false,
  defaultPhase,
}: TaskLineItemsProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [activeDepDropdown, setActiveDepDropdown] = useState<string | null>(null);

  // Validate dependencies DAG
  const cycleResult = React.useMemo(() => {
    const formatted = tasks.map((t) => ({
      id: t.localId,
      dependsOn: t.dependsOn,
    }));
    return validateDependencies(formatted);
  }, [tasks]);

  const toggleExpand = (localId: string) => {
    setExpandedRow((prev) => (prev === localId ? null : localId));
  };

  const handleUpdateTask = (
    index: number,
    field: keyof TaskItemData,
    value: unknown
  ) => {
    const updated = [...tasks];
    const target = updated[index];
    if (!target) return;

    if (field === 'title') {
      const newTitle = String(value);
      // If title is cleared, prune stale dependencies on other tasks
      if (!newTitle.trim()) {
        const clearedId = target.localId;
        updated.forEach((t, i) => {
          if (i !== index && t.dependsOn) {
            const currentDeps = Array.isArray(t.dependsOn)
              ? t.dependsOn
              : [t.dependsOn];
            const pruned = currentDeps.filter((d) => d !== clearedId);
            t.dependsOn = pruned.length > 0 ? pruned : null;
          }
        });
      }
    }

    updated[index] = {
      ...target,
      [field]: value,
    };
    onChange(updated);
  };

  const handleAddTask = () => {
    const newLocalId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newTask: TaskItemData = {
      localId: newLocalId,
      title: '',
      phase: defaultPhase || 'pre_processing',
      coAssignees: [],
      checklist: [],
      dependsOn: null,
      dueDate: null,
    };
    onChange([...tasks, newTask]);
    setExpandedRow(newLocalId);
  };

  const handleRemoveTask = (index: number) => {
    const target = tasks[index];
    if (!target) return;
    const removedId = target.localId;

    // Prune dependencies on removed task
    const nextTasks = tasks
      .filter((_, i) => i !== index)
      .map((t) => {
        if (!t.dependsOn) return t;
        const deps = Array.isArray(t.dependsOn) ? t.dependsOn : [t.dependsOn];
        const pruned = deps.filter((d) => d !== removedId);
        return {
          ...t,
          dependsOn: pruned.length > 0 ? pruned : null,
        };
      });

    onChange(nextTasks);
    if (expandedRow === removedId) {
      setExpandedRow(null);
    }
  };

  const handleToggleDependency = (taskIndex: number, targetLocalId: string) => {
    const target = tasks[taskIndex];
    if (!target) return;

    let nextDeps: string[] = [];
    const currentDeps = target.dependsOn
      ? Array.isArray(target.dependsOn)
        ? [...target.dependsOn]
        : [target.dependsOn]
      : [];

    if (targetLocalId === '*') {
      // Toggle wildcard
      if (currentDeps.includes('*')) {
        nextDeps = [];
      } else {
        nextDeps = ['*'];
      }
    } else {
      // Toggle specific ID (remove wildcard if present)
      const cleaned = currentDeps.filter((d) => d !== '*');
      if (cleaned.includes(targetLocalId)) {
        nextDeps = cleaned.filter((d) => d !== targetLocalId);
      } else {
        nextDeps = [...cleaned, targetLocalId];
      }
    }

    handleUpdateTask(taskIndex, 'dependsOn', nextDeps.length > 0 ? nextDeps : null);
  };

  const staffById = React.useMemo(() => {
    const map = new Map<string, TeamMember>();
    projectTeam.forEach((m) => map.set(m.id, m));
    return map;
  }, [projectTeam]);

  return (
    <div className="space-y-3 notion-line-items" data-testid="task-line-items">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-[#0A0A0A] uppercase tracking-wider font-mono">
          Tasks ({tasks.length})
        </h4>
        <span className="text-xs text-[#4A4945] font-mono">
          Paste a list — we'll split it
        </span>
      </div>

      {/* Cycle Detection Warning Banner */}
      {cycleResult.hasCycle && (
        <div
          className="p-2.5 bg-[#FAF9F5] border-2 border-[#E61919] rounded-none flex items-center gap-2 text-xs font-mono text-[#E61919]"
          data-testid="dependency-cycle-warning"
        >
          <AlertTriangle className="h-4 w-4 text-[#E61919] shrink-0" />
          <span>{cycleResult.error || 'Circular dependency detected between tasks.'}</span>
        </div>
      )}

      {/* Line Items Container */}
      <div className="border-2 border-[#0A0A0A] rounded-none divide-y divide-[#C8C5BC] bg-[#FAF9F5] font-mono">
        {tasks.map((task, index) => {
          const isExpanded = expandedRow === task.localId;
          const tokenizer = parseTaskDelimiterInput(task.title);

          // Predecessors candidate calculation:
          // Named tasks only, excluding self
          const namedCandidates = tasks.filter((t) => {
            if (t.localId !== task.localId && t.title.trim().length > 0) {
              if (task.phase === 'pre_processing' && t.phase === 'processing') return false;
              return true;
            }
            return false;
          });
          const precedingNamed = tasks
            .slice(0, index)
            .filter((t) => {
              if (!t.title.trim()) return false;
              if (task.phase === 'pre_processing' && t.phase === 'processing') return false;
              return true;
            });

          const currentDeps = task.dependsOn
            ? Array.isArray(task.dependsOn)
              ? task.dependsOn
              : [task.dependsOn]
            : [];

          const depDisplayText = (() => {
            if (currentDeps.includes('*')) return 'All Tasks (*)';
            if (currentDeps.length === 0) return '— No dependency —';
            const titles = currentDeps
              .map((id) => tasks.find((t) => t.localId === id)?.title || id)
              .filter(Boolean);
            return titles.join(', ') || '— No dependency —';
          })();

          return (
            <div
              key={task.localId}
              className={`p-2.5 space-y-2 transition-colors ${
                isExpanded ? 'bg-[#EAE8E3]/60' : 'hover:bg-[#EAE8E3]/30'
              }`}
              data-testid={`task-row-${task.localId}`}
            >
              {/* Primary Row Controls */}
              <div className="flex flex-wrap items-center gap-1.5">

                {/* Expand / Collapse Toggle */}
                <button
                  type="button"
                  onClick={() => toggleExpand(task.localId)}
                  className="text-[#4A4945] hover:text-[#0A0A0A] p-0.5 rounded-none focus:outline-none"
                  aria-label="Toggle task details"
                  data-testid={`task-expand-toggle-${task.localId}`}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>

                {/* Task Title Input */}
                <div className="min-w-48 flex-[1_1_12rem]">
                  <Input
                    value={task.title}
                    onChange={(e) => handleUpdateTask(index, 'title', e.target.value)}
                    placeholder="Task title"
                    aria-label={`Task ${index + 1} title`}
                    disabled={disabled}
                    className="h-8 text-xs font-mono bg-[#FAF9F5] border border-[#0A0A0A] rounded-none text-[#0A0A0A]"
                    data-testid={`task-title-input-${task.localId}`}
                  />
                </div>

                {/* Phase Badge / Selector (immutable in edit mode) */}
                <div className="w-24 shrink-0">
                  <Select
                    value={task.phase}
                    onValueChange={(val) =>
                      handleUpdateTask(index, 'phase', val as CreatablePhase)
                    }
                    disabled={disabled || Boolean(task.id)}
                  >
                    <SelectTrigger className="h-8 text-xs font-mono bg-[#FAF9F5] border border-[#0A0A0A] rounded-none px-2 text-[#0A0A0A]" aria-label="Task phase">
                      <SelectValue>{task.phase === 'pre_processing' ? 'Pre-process' : 'Processing'}</SelectValue>
                    </SelectTrigger>
                    <SelectContent className="rounded-none border border-[#0A0A0A] bg-[#FAF9F5]">
                      <SelectItem
                        value="pre_processing"
                        className="text-xs font-mono"
                        disabled={isEditMode && defaultPhase === 'processing'}
                      >
                        Pre-processing{isEditMode && defaultPhase === 'processing' ? ' (Phase Ended)' : ''}
                      </SelectItem>
                      <SelectItem value="processing" className="text-xs font-mono">
                        Processing
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Primary Assignee Dropdown */}
                <div className="w-28 shrink-0">
                  <Select
                    value={task.assigneeId || 'unassigned'}
                    onValueChange={(val) => {
                      const newId = val === 'unassigned' ? null : val;
                      handleUpdateTask(index, 'assigneeId', newId);
                    }}
                    disabled={disabled}
                  >
                    <SelectTrigger className="h-8 text-xs font-mono bg-[#FAF9F5] border border-[#0A0A0A] rounded-none px-2 [&>span]:truncate text-[#0A0A0A]" aria-label="Primary assignee">
                      <SelectValue placeholder="Assignee" />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border border-[#0A0A0A] bg-[#FAF9F5]">
                      <SelectItem value="unassigned" className="font-mono text-xs">Unassigned</SelectItem>
                      {projectTeam.map((m) => (
                        <SelectItem key={m.id} value={m.id} className="text-xs font-mono">
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Task Due Date */}
                <div className="w-32 shrink-0">
                  <Input
                    type="date"
                    value={task.dueDate || ''}
                    onChange={(e) => handleUpdateTask(index, 'dueDate', e.target.value || null)}
                    disabled={disabled}
                    className="h-8 text-xs font-mono tabular-nums bg-[#FAF9F5] border border-[#0A0A0A] rounded-none px-1.5 text-[#0A0A0A]"
                    aria-label="Task due date"
                    title="Task Due Date"
                    data-testid={`task-due-date-input-${task.localId}`}
                  />
                </div>

                {/* Dependency Selector Dropdown Trigger */}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      setActiveDepDropdown(
                        activeDepDropdown === task.localId ? null : task.localId
                      )
                    }
                    disabled={disabled}
                    className="h-8 px-2 shrink-0 text-xs font-mono border border-[#0A0A0A] rounded-none bg-[#FAF9F5] text-[#0A0A0A] hover:bg-[#EAE8E3] flex items-center gap-1 focus:outline-none"
                    data-testid={`task-dep-btn-${task.localId}`}
                    title={`Dependencies: ${depDisplayText}`}
                    aria-label={`Dependencies: ${depDisplayText}`}
                    aria-expanded={activeDepDropdown === task.localId}
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    <span>{currentDeps.includes('*') ? 'All' : currentDeps.length || '—'}</span>
                  </button>

                  {/* Dependency Dropdown Popover */}
                  {activeDepDropdown === task.localId && (
                    <div className="absolute right-0 top-9 z-50 w-80 max-w-[calc(100vw-3rem)] p-2 bg-[#FAF9F5] rounded-none shadow-[4px_4px_0px_#0A0A0A] border-2 border-[#0A0A0A] text-xs font-mono space-y-1">
                      <div className="font-bold text-[#0A0A0A] pb-1 border-b border-[#0A0A0A] text-xs uppercase tracking-wider">
                        Select Predecessor Tasks
                      </div>

                      {namedCandidates.length === 0 ? (
                        <div className="text-[#4A4945] italic py-1 text-center text-xs">
                          No named tasks available
                        </div>
                      ) : (
                        <div className="max-h-40 overflow-y-auto space-y-1 py-1">
                          {/* Preceding all wildcard */}
                          {precedingNamed.length > 0 && (
                            <label className="flex items-center gap-2 p-1 hover:bg-[#EAE8E3] rounded-none cursor-pointer font-bold text-[#0A0A0A]">
                              <input
                                type="checkbox"
                                checked={currentDeps.includes('*')}
                                onChange={() => handleToggleDependency(index, '*')}
                                className="rounded-none text-[#0A0A0A]"
                              />
                              <span>All Tasks (*)</span>
                            </label>
                          )}

                          {namedCandidates.map((cand) => (
                            <label
                              key={cand.localId}
                              className="flex items-center gap-2 p-1 hover:bg-[#EAE8E3] rounded-none cursor-pointer text-[#0A0A0A]"
                            >
                              <input
                                type="checkbox"
                                checked={
                                  currentDeps.includes(cand.localId) ||
                                  currentDeps.includes('*')
                                }
                                disabled={currentDeps.includes('*')}
                                onChange={() =>
                                  handleToggleDependency(index, cand.localId)
                                }
                                className="rounded-none text-[#0A0A0A]"
                              />
                              <span className="truncate">{cand.title}</span>
                            </label>
                          ))}
                        </div>
                      )}

                      <div className="pt-1 border-t border-[#0A0A0A] text-right">
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => setActiveDepDropdown(null)}
                          className="h-6 text-xs font-mono text-[#0A0A0A] hover:bg-[#EAE8E3] rounded-none uppercase"
                        >
                          Done
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Remove Task Row */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleRemoveTask(index)}
                  disabled={disabled || tasks.length <= 1}
                  className="text-[#4A4945] hover:text-[#E61919] hover:bg-[#EAE8E3] rounded-none"
                  aria-label="Remove task"
                  data-testid={`task-remove-btn-${task.localId}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Delimiter Tokenizer Live Preview */}
              {tokenizer.shouldSplit && (
                <div
                  className="p-2 bg-[#EAE8E3] border border-[#0A0A0A] rounded-none text-xs font-mono space-y-1.5 ml-6"
                  data-testid={`task-tokenizer-preview-${task.localId}`}
                >
                  <div className="flex items-center justify-between text-[#0A0A0A] font-semibold">
                    <span>
                      Delimiter detected: will split into {tokenizer.count} sibling tasks
                    </span>
                    {tokenizer.exceedsLimit && (
                      <Badge variant="destructive" size="compact" className="rounded-none font-mono text-xs">
                        Exceeds 50 task limit!
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {tokenizer.tokens.slice(0, 10).map((tok, ti) => (
                      <Badge
                        key={ti}
                        variant="secondary"
                        size="compact"
                        className="bg-[#FAF9F5] border border-[#0A0A0A] text-[#0A0A0A] text-xs font-mono rounded-none"
                      >
                        {tok}
                      </Badge>
                    ))}
                    {tokenizer.tokens.length > 10 && (
                      <span className="text-xs font-mono text-[#0A0A0A] font-semibold self-center">
                        +{tokenizer.tokens.length - 10} more
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Co-Assignees & Subtasks Action Row */}
              <div className="flex flex-wrap items-center justify-between gap-2 pl-6 text-xs">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[#4A4945] text-xs font-mono uppercase tracking-wider shrink-0">Co-Assignees:</span>
                  <div className="flex flex-wrap gap-1 items-center">
                    {task.coAssignees.map((cid) => {
                      const member = staffById.get(cid);
                      return (
                        <Badge
                          key={cid}
                          variant="secondary"
                          size="compact"
                          className="bg-[#FAF9F5] border border-[#0A0A0A] text-[#0A0A0A] text-xs font-mono rounded-none flex items-center gap-1"
                        >
                          <span>{member?.name || cid}</span>
                          {!disabled && (
                            <button
                              type="button"
                              onClick={() => {
                                const filtered = task.coAssignees.filter((id) => id !== cid);
                                handleUpdateTask(index, 'coAssignees', filtered);
                              }}
                              className="text-[#4A4945] hover:text-[#E61919] focus:outline-none"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          )}
                        </Badge>
                      );
                    })}
                    {!disabled && (
                      <Select
                        value=""
                        onValueChange={(val) => {
                          if (val && !task.coAssignees.includes(val)) {
                            handleUpdateTask(index, 'coAssignees', [
                              ...task.coAssignees,
                              val,
                            ]);
                          }
                        }}
                      >
                        <SelectTrigger className="h-6 text-xs font-mono px-1.5 py-0 border-dashed border-[#0A0A0A] rounded-none w-auto min-w-20 bg-[#FAF9F5] text-[#4A4945]">
                          <SelectValue placeholder="+ Co-worker" />
                        </SelectTrigger>
                        <SelectContent className="rounded-none border border-[#0A0A0A] bg-[#FAF9F5]">
                          {projectTeam
                            .filter(
                              (m) =>
                                m.id !== task.assigneeId &&
                                !task.coAssignees.includes(m.id)
                            )
                            .map((m) => (
                              <SelectItem key={m.id} value={m.id} className="text-xs font-mono">
                                {m.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                {/* Subtasks / Checklist Quick Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {task.checklist && task.checklist.length > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => toggleExpand(task.localId)}
                      className="h-6 text-xs font-mono px-1.5 py-0 bg-[#FAF9F5] border border-[#0A0A0A] text-[#0A0A0A] hover:bg-[#EAE8E3] rounded-none flex items-center gap-1 font-medium"
                      title={isExpanded ? 'Collapse subtasks checklist' : 'Expand subtasks checklist'}
                      data-testid={`task-checklist-badge-${task.localId}`}
                    >
                      <CheckSquare className="h-3 w-3 text-[#0A0A0A]" />
                      <span>
                        Subtasks ({task.checklist.filter((c) => c.completed).length}/{task.checklist.length})
                      </span>
                    </Button>
                  ) : null}

                  {!disabled && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        if (!isExpanded) {
                          setExpandedRow(task.localId);
                        }
                        const current = task.checklist || [];
                        const newItem: ChecklistItemData = {
                          id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                            ? crypto.randomUUID()
                            : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                                const r = (Math.random() * 16) | 0;
                                return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
                              }),
                          text: '',
                          completed: false,
                          category: 'subtask',
                        };
                        handleUpdateTask(index, 'checklist', [...current, newItem]);
                      }}
                      className="h-6 text-xs font-mono px-1.5 py-0 border border-dashed border-[#0A0A0A] rounded-none text-[#0A0A0A] hover:bg-[#EAE8E3] flex items-center gap-1"
                      data-testid={`task-add-checklist-btn-${task.localId}`}
                    >
                      <Plus className="h-3 w-3 text-[#0A0A0A]" />
                      <span>+ Subtask</span>
                    </Button>
                  )}
                </div>
              </div>

              {/* Expanded Sub-Panel: Description & Checklist Items */}
              {isExpanded && (
                <div className="pl-6 pt-2 space-y-3 border-t border-[#C8C5BC] mt-2 font-mono">
                  {/* Task Description */}
                  <div>
                    <label className="text-xs font-mono uppercase tracking-wider text-[#4A4945] mb-1 block">
                      Description & Deliverables
                    </label>
                    <textarea
                      value={task.description || ''}
                      onChange={(e) =>
                        handleUpdateTask(index, 'description', e.target.value)
                      }
                      placeholder="Add details, instructions, or acceptance criteria (paste a list — we'll split it)..."
                      disabled={disabled}
                      rows={2}
                      className="w-full text-xs font-mono p-2 border border-[#0A0A0A] rounded-none bg-[#FAF9F5] text-[#0A0A0A] placeholder:text-[#4A4945] focus:outline-none focus:ring-1 focus:ring-[#0A0A0A]"
                    />
                  </div>

                  {/* Checklist Items */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#0A0A0A] flex items-center gap-1.5">
                        <CheckSquare className="h-3.5 w-3.5 text-[#0A0A0A]" />
                        Checklist & Subtasks ({task.checklist?.length || 0})
                      </span>
                      {!disabled && (
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => {
                            const currentChecklist = task.checklist || [];
                            const newItem: ChecklistItemData = {
                              id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                                ? crypto.randomUUID()
                                : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                                    const r = (Math.random() * 16) | 0;
                                    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
                                  }),
                              text: '',
                              completed: false,
                              category: 'subtask',
                            };
                            handleUpdateTask(index, 'checklist', [
                              ...currentChecklist,
                              newItem,
                            ]);
                          }}
                          className="h-6 text-xs font-mono uppercase tracking-wider text-[#0A0A0A] hover:bg-[#EAE8E3] border border-[#0A0A0A] rounded-none gap-1"
                          data-testid={`add-subtask-btn-${task.localId}`}
                        >
                          <Plus className="h-3 w-3 mr-0.5" />
                          Add Subtask
                        </Button>
                      )}
                    </div>

                    {task.checklist && task.checklist.length > 0 ? (
                      <div className="space-y-1.5 bg-[#EAE8E3] p-2 rounded-none border border-[#0A0A0A]">
                        {task.checklist.map((item, ci) => {
                          const isBlocked =
                            item.dependsOn &&
                            task.checklist?.some(
                              (other) =>
                                other.id === item.dependsOn && !other.completed
                            );

                          return (
                            <div
                              key={item.id}
                              className="flex items-center gap-2 text-xs"
                            >
                              {/* Checkbox */}
                              <input
                                type="checkbox"
                                checked={item.completed}
                                disabled={disabled || Boolean(isBlocked)}
                                onChange={(e) => {
                                  const updatedChecklist = [...(task.checklist || [])];
                                  const targetItem = updatedChecklist[ci];
                                  if (targetItem) {
                                    updatedChecklist[ci] = {
                                      ...targetItem,
                                      completed: e.target.checked,
                                    };
                                    handleUpdateTask(index, 'checklist', updatedChecklist);
                                  }
                                }}
                                className="rounded-none text-[#0A0A0A]"
                              />

                              {/* Title input */}
                              <input
                                type="text"
                                value={item.text}
                                disabled={disabled}
                                onChange={(e) => {
                                  const updatedChecklist = [...(task.checklist || [])];
                                  const targetItem = updatedChecklist[ci];
                                  if (targetItem) {
                                    updatedChecklist[ci] = {
                                      ...targetItem,
                                      text: e.target.value,
                                    };
                                    handleUpdateTask(index, 'checklist', updatedChecklist);
                                  }
                                }}
                                placeholder="Checklist item text..."
                                className="flex-1 text-xs font-mono border-0 bg-transparent focus:ring-0 p-0 text-[#0A0A0A] placeholder:text-[#4A4945]"
                              />

                              {/* Category toggle: Doc vs Subtask */}
                              <button
                                type="button"
                                disabled={disabled}
                                onClick={() => {
                                  const updatedChecklist = [...(task.checklist || [])];
                                  const targetItem = updatedChecklist[ci];
                                  if (targetItem) {
                                    const nextCat =
                                      targetItem.category === 'document'
                                        ? 'subtask'
                                        : 'document';
                                    updatedChecklist[ci] = {
                                      ...targetItem,
                                      category: nextCat,
                                    };
                                    handleUpdateTask(index, 'checklist', updatedChecklist);
                                  }
                                }}
                                className="px-1.5 py-0.5 text-xs font-mono rounded-none border border-[#0A0A0A] bg-[#FAF9F5] text-[#0A0A0A] hover:bg-[#EAE8E3]"
                              >
                                {item.category === 'document' ? (
                                  <span className="flex items-center gap-1 text-[#0A0A0A]">
                                    <FileText className="h-2.5 w-2.5" /> Doc
                                  </span>
                                ) : (
                                  <span>Sub-task</span>
                                )}
                              </button>

                              {/* Period Year (if document) */}
                              {item.category === 'document' && (
                                <input
                                  type="number"
                                  value={item.periodYear || new Date().getFullYear()}
                                  disabled={disabled}
                                  onChange={(e) => {
                                    const updatedChecklist = [...(task.checklist || [])];
                                    const targetItem = updatedChecklist[ci];
                                    if (targetItem) {
                                      updatedChecklist[ci] = {
                                        ...targetItem,
                                        periodYear: parseInt(e.target.value, 10) || null,
                                      };
                                      handleUpdateTask(
                                        index,
                                        'checklist',
                                        updatedChecklist
                                      );
                                    }
                                  }}
                                  className="w-14 text-xs font-mono p-0.5 border border-[#0A0A0A] rounded-none bg-[#FAF9F5] text-center"
                                />
                              )}

                              {/* Blocked lock icon */}
                              {isBlocked && (
                                <span
                                  className="text-xs text-[#E61919] flex items-center gap-0.5"
                                  title={`🔒 Waiting for prerequisite`}
                                >
                                  <Lock className="h-3 w-3" />
                                </span>
                              )}

                              {/* Remove checklist item */}
                              {!disabled && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updatedChecklist = (
                                      task.checklist || []
                                    ).filter((_, i) => i !== ci);
                                    handleUpdateTask(index, 'checklist', updatedChecklist);
                                  }}
                                  className="text-[#4A4945] hover:text-[#E61919]"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-xs font-mono text-[#4A4945] italic">
                        No checklist items.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Task Button */}
      {!disabled && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddTask}
          data-testid="add-task-btn"
          className="w-full border-dashed border-[#0A0A0A] text-xs font-mono uppercase tracking-wider text-[#0A0A0A] hover:bg-[#EAE8E3] rounded-none h-8"
        >
          <Plus className="h-3.5 w-3.5 mr-1 text-[#0A0A0A]" />
          Add task
        </Button>
      )}
    </div>
  );
}
