import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Layers, Calendar, Search, AlertTriangle } from 'lucide-react';
import { useRetainerTemplates, useRetainerMutations } from '../api/useRetainers';
import { useClients } from '../api/useClients';
import { useTeam } from '../api/useTeam';
import { AssignerSelect } from './AssignerSelect';
import { runBlockingAction } from './BlockingActionModal';
import { operationsKeys } from '../api/queryKeys';
import { useSessionStore } from '@/lib/session';
import { toast } from '@/components/ui/toast';
import type {
  RetainerGenerateResponse,
  RetainerTemplateTask,
  ChecklistItemData,
  Priority,
  CreatablePhase,
} from '../api/types';

export interface OtherTemplateGenerateModalProps {
  isOpen: boolean;
  onClose: () => void;
  preselectedTemplateId?: string | null;
  onSuccess?: (res: RetainerGenerateResponse) => void;
}

interface BlueprintTask {
  local_id: string;
  title: string;
  description?: string | null;
  phase: CreatablePhase;
  assignees: string[];
  depends_on?: string | null;
  dueDate?: string | null;
  checklist?: ChecklistItemData[];
}

export function OtherTemplateGenerateModal({
  isOpen,
  onClose,
  preselectedTemplateId,
  onSuccess,
}: OtherTemplateGenerateModalProps) {
  const navigate = useNavigate();
  const [templateId, setTemplateId] = useState<string>('');
  const [clientId, setClientId] = useState<string>('');
  const [clientSearch, setClientSearch] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [priority, setPriority] = useState<Priority>('Normal');
  const [description, setDescription] = useState<string>('');
  const [assignedTo, setAssignedTo] = useState<string | null>(null);
  const [coAssignees, setCoAssignees] = useState<string[]>([]);
  const [blueprintTasks, setBlueprintTasks] = useState<BlueprintTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [managerError, setManagerError] = useState<string | null>(null);

  const { data: allTemplates = [], isLoading: isTemplatesLoading } =
    useRetainerTemplates({ enabled: isOpen, type: 'other' });
  const { data: clients = [] } = useClients(undefined, { enabled: isOpen });
  const { data: team = [] } = useTeam();
  const { generateFromTemplate } = useRetainerMutations();
  const activeEntity = useSessionStore((state) => state.activeEntity);

  // Filter templates to only 'other' templates
  const otherTemplates = useMemo(() => {
    return allTemplates.filter(
      (t) => (t.template_type || t.templateType) === 'other' || !t.schedule
    );
  }, [allTemplates]);

  // Set initial template
  useEffect(() => {
    if (preselectedTemplateId) {
      setTemplateId(preselectedTemplateId);
    } else if (otherTemplates.length > 0 && !templateId && otherTemplates[0]) {
      setTemplateId(otherTemplates[0].id);
    }
  }, [preselectedTemplateId, otherTemplates, templateId]);

  const selectedTemplate = otherTemplates.find((t) => t.id === templateId);

  // Sync template description and tasks when selected
  useEffect(() => {
    if (!selectedTemplate) {
      setDescription('');
      setBlueprintTasks([]);
      return;
    }

    setDescription(selectedTemplate.description || '');

    const tasksFromTemplate = Array.isArray(selectedTemplate.tasks)
      ? selectedTemplate.tasks
      : [];

    setBlueprintTasks(
      tasksFromTemplate.map((t: RetainerTemplateTask, idx: number) => {
        const localId =
          t.local_id || t.localId || t.id || `task_${idx + 1}`;
        const rawAssignees =
          Array.isArray(t.assignees) && t.assignees.length > 0
            ? t.assignees
            : Array.isArray(t.default_assignees) && t.default_assignees.length > 0
            ? t.default_assignees
            : Array.isArray(t.defaultAssignees) && t.defaultAssignees.length > 0
            ? t.defaultAssignees
            : [];

        const dependsOn =
          t.depends_on ??
          t.dependsOn ??
          t.depends_on_local_id ??
          t.dependsOnLocalId ??
          null;

        return {
          local_id: localId,
          title: t.title,
          description: t.description || null,
          phase: (t.phase === 'processing'
            ? 'processing'
            : 'pre_processing') as CreatablePhase,
          assignees: Array.isArray(rawAssignees) ? rawAssignees : [],
          depends_on: dependsOn,
          dueDate: t.dueDate || t.due_date || null,
          checklist: t.checklist || [],
        };
      })
    );
  }, [selectedTemplate]);

  // Search filter for clients
  const filteredClients = useMemo(() => {
    if (!clientSearch.trim()) return clients;
    const q = clientSearch.toLowerCase();
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.tin && c.tin.toLowerCase().includes(q))
    );
  }, [clients, clientSearch]);

  // Project Team Members strictly: Manager (assignedTo) + Co-Assignees
  const projectTeam = useMemo(() => {
    return team.filter(
      (m) => (assignedTo && m.id === assignedTo) || coAssignees.includes(m.id)
    );
  }, [team, assignedTo, coAssignees]);

  const projectTeamIds = useMemo(() => {
    return new Set(projectTeam.map((m) => m.id));
  }, [projectTeam]);

  // Check for any tasks assigned to members outside the project team
  const unmappedTasks = useMemo(() => {
    return blueprintTasks.filter((t) =>
      t.assignees.some((id) => !projectTeamIds.has(id))
    );
  }, [blueprintTasks, projectTeamIds]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setClientError(null);
    setManagerError(null);

    if (!templateId) {
      setError('Please select an Other Template.');
      return;
    }

    // Mandatory Client
    if (!clientId) {
      setClientError('Client selection is required.');
      setError('Client selection is required.');
      return;
    }

    // Mandatory Manager Lead governance
    if (!assignedTo) {
      setManagerError('Manager Lead (assignedTo) is required.');
      setError('Manager Lead (assignedTo) is required.');
      return;
    }

    // Strict task assignee scoping check
    if (unmappedTasks.length > 0) {
      setError(
        'All task assignees must belong to the selected project team. Please update unmapped assignees.'
      );
      return;
    }

    await runBlockingAction({
      title: 'Generating Work Request',
      message: `Generating work request from template "${selectedTemplate?.name}"...`,
      apiCall: async () => {
        return await generateFromTemplate({
          templateId,
          period_label: null,
          overrides: {
            clientId,
            priority,
            dueDate: dueDate || undefined,
            assignedTo,
            coAssignees,
            description: description.trim() || undefined,
            tasks: blueprintTasks.map((t) => ({
              local_id: t.local_id,
              title: t.title,
              description: t.description || null,
              phase: t.phase,
              assignees: t.assignees,
              depends_on: t.depends_on || null,
              dueDate: t.dueDate || null,
              checklist: t.checklist || [],
            })),
          },
        });
      },
      successTitle: 'Work Request Created',
      successMessage: 'Successfully generated work request from Other Template.',
      invalidateQueries: [
        operationsKeys.workRequests(),
        operationsKeys.workRequestCounts(activeEntity),
        operationsKeys.templates(),
      ],
      onSuccess: (data) => {
        toast.success('Work Request generated successfully');
        if (onSuccess && data) {
          onSuccess(data as RetainerGenerateResponse);
        }
        if (data && 'id' in data) {
          navigate(`/operations?tab=work-requests&view=board&wrId=${data.id}`);
        }
        onClose();
      },
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto rounded-none border-2 border-[#0A0A0A] bg-[#FAF9F5] shadow-[4px_4px_0px_#0A0A0A]"
        data-testid="other-template-generate-modal"
      >
        <DialogHeader>
          <DialogTitle className="text-base font-extrabold tracking-tight text-[#0A0A0A] flex items-center gap-2">
            <Layers className="h-5 w-5 text-[#0A0A0A]" />
            Generate from Other Template
          </DialogTitle>
          <DialogDescription className="text-xs font-mono text-[#4A4945] pt-1">
            Create an ad-hoc work request with client assignment, manager lead governance, and scoped tasks.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleGenerate} className="space-y-4">
          {error && (
            <div
              className="p-3 bg-[#FAF9F5] border border-[#E61919] rounded-none flex items-center gap-2 text-xs font-mono text-[#E61919]"
              data-testid="generate-error-banner"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-[#E61919]" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. Template Dropdown */}
          <div className="space-y-1">
            <label className="text-xs font-mono uppercase tracking-wider text-[#4A4945] block">
              Other Template <span className="text-[#E61919]">*</span>
            </label>
            <Select
              value={templateId}
              onValueChange={(val) => {
                setTemplateId(val);
                setError(null);
              }}
              disabled={isTemplatesLoading}
            >
              <SelectTrigger
                className="h-9 bg-[#FAF9F5] border border-[#0A0A0A] rounded-none font-mono text-xs text-[#0A0A0A]"
                data-testid="other-template-select"
              >
                <SelectValue placeholder="Select an Other Template..." />
              </SelectTrigger>
              <SelectContent className="rounded-none border border-[#0A0A0A] bg-[#FAF9F5]">
                {otherTemplates.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-xs font-mono">
                    {t.name || t.title} ({(t.tasks || []).length} tasks)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 2. Client Selection (Searchable & Required) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-mono uppercase tracking-wider text-[#4A4945]">
                Client <span className="text-[#E61919]">*</span>
              </label>
              {clientSearch && (
                <button
                  type="button"
                  onClick={() => setClientSearch('')}
                  className="text-xs font-mono text-[#4A4945] hover:text-[#0A0A0A]"
                >
                  Clear search
                </button>
              )}
            </div>

            {/* Optional search filter input */}
            <div className="relative mb-1">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-[#4A4945]" />
              <Input
                type="text"
                placeholder="Search client name or TIN..."
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                className="h-8 pl-8 text-xs font-mono bg-[#FAF9F5] border border-[#0A0A0A] rounded-none text-[#0A0A0A] placeholder:text-[#4A4945]"
                data-testid="client-search-input"
              />
            </div>

            <Select
              value={clientId}
              onValueChange={(val) => {
                setClientId(val);
                setClientError(null);
                if (error) setError(null);
              }}
            >
              <SelectTrigger
                className="h-9 bg-[#FAF9F5] border border-[#0A0A0A] rounded-none font-mono text-xs text-[#0A0A0A]"
                data-testid="other-template-client-select"
              >
                <SelectValue placeholder="Select target client..." />
              </SelectTrigger>
              <SelectContent className="rounded-none border border-[#0A0A0A] bg-[#FAF9F5]">
                {filteredClients.length === 0 ? (
                  <div className="p-2 text-xs font-mono text-[#4A4945] text-center">
                    No matching clients found
                  </div>
                ) : (
                  filteredClients.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs font-mono">
                      {c.name} {c.entity ? `(${c.entity})` : ''}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            {clientError && (
              <p className="text-xs font-mono text-[#E61919]" data-testid="client-error">
                {clientError}
              </p>
            )}
          </div>

          {/* 3. Priority & Due Date Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Priority */}
            <div className="space-y-1">
              <label className="text-xs font-mono uppercase tracking-wider text-[#4A4945] block">
                Priority
              </label>
              <Select
                value={priority}
                onValueChange={(val) => setPriority(val as Priority)}
              >
                <SelectTrigger
                  className="h-9 bg-[#FAF9F5] border border-[#0A0A0A] rounded-none font-mono text-xs text-[#0A0A0A]"
                  data-testid="other-template-priority-select"
                >
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent className="rounded-none border border-[#0A0A0A] bg-[#FAF9F5]">
                  <SelectItem value="Low" className="text-xs font-mono">Low</SelectItem>
                  <SelectItem value="Normal" className="text-xs font-mono">Normal</SelectItem>
                  <SelectItem value="High" className="text-xs font-mono">High</SelectItem>
                  <SelectItem value="Urgent" className="text-xs font-mono">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Due Date */}
            <div className="space-y-1">
              <label className="text-xs font-mono uppercase tracking-wider text-[#4A4945] flex items-center gap-1">
                <Calendar className="h-3 w-3 text-[#4A4945]" />
                <span>Due Date (Optional)</span>
              </label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-9 bg-[#FAF9F5] border border-[#0A0A0A] rounded-none font-mono text-xs text-[#0A0A0A]"
                data-testid="other-template-due-date-input"
              />
            </div>
          </div>

          {/* 4. Description / Notes */}
          <div className="space-y-1">
            <label className="text-xs font-mono uppercase tracking-wider text-[#4A4945] block">
              Description / Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Scope details, custom instructions, or client background..."
              className="w-full rounded-none border border-[#0A0A0A] bg-[#FAF9F5] p-2.5 text-xs font-mono text-[#0A0A0A] placeholder:text-[#4A4945] focus:outline-none focus:ring-1 focus:ring-[#0A0A0A]"
              data-testid="other-template-description-textarea"
            />
          </div>

          {/* 5. Team Governance (Mandatory) */}
          <div className="p-3 bg-[#EAE8E3] border border-[#0A0A0A] rounded-none space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-mono font-bold text-[#0A0A0A] uppercase tracking-wider">
                Team Governance (Mandatory)
              </h4>
              <span className="text-xs font-mono text-[#4A4945]">
                Lead Manager + Operations Co-Assignees
              </span>
            </div>

            <AssignerSelect
              availableStaff={team}
              primaryAssigneeId={assignedTo}
              selectedCoAssigneeIds={coAssignees}
              managerOnlyPrimary={true}
              onPrimaryChange={(newMgr) => {
                setAssignedTo(newMgr);
                setError(null);
                setManagerError(null);
              }}
              onCoAssigneesChange={(newCo) => {
                setCoAssignees(newCo);
                setError(null);
              }}
            />

            {managerError && (
              <p className="text-xs font-mono text-[#E61919]" data-testid="manager-error">
                {managerError}
              </p>
            )}
          </div>

          {/* 6. Blueprint Tasks Scoping Preview */}
          {blueprintTasks.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-[#0A0A0A]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#0A0A0A]">
                  Task Blueprint Scoping ({blueprintTasks.length} tasks)
                </span>
                {unmappedTasks.length > 0 && (
                  <Badge variant="destructive" size="compact" className="rounded-none font-mono text-xs">
                    {unmappedTasks.length} unmapped assignee{unmappedTasks.length !== 1 ? 's' : ''}
                  </Badge>
                )}
              </div>

              <div className="max-h-40 overflow-y-auto space-y-1.5 divide-y divide-[#C8C5BC] border border-[#0A0A0A] rounded-none p-2 bg-[#FAF9F5]">
                {blueprintTasks.map((t, idx) => (
                  <div
                    key={t.local_id || idx}
                    className="flex items-center justify-between text-xs font-mono py-1"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <span className="text-[#4A4945] text-xs">#{idx + 1}</span>
                      <span className="font-semibold text-[#0A0A0A] truncate">{t.title}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge
                        variant={t.phase === 'processing' ? 'secondary' : 'default'}
                        size="compact"
                        className="text-xs font-mono rounded-none"
                      >
                        {t.phase === 'processing' ? 'Processing' : 'Pre-Proc'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter className="pt-4 border-t border-[#0A0A0A]">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="rounded-none border border-[#0A0A0A] text-[#0A0A0A] hover:bg-[#EAE8E3] font-mono text-xs uppercase tracking-wider"
              data-testid="other-template-generate-cancel-btn"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="rounded-none bg-[#0A0A0A] text-[#FAF9F5] hover:bg-[#E61919] font-mono text-xs uppercase tracking-wider"
              data-testid="other-template-generate-submit-btn"
            >
              Generate Work Request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
