import { useState } from 'react';
import {
  Plus,
  Repeat,
  Layers,
  Edit2,
  Trash2,
  AlertCircle,
  FileText,
  Building2,
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
import { useRetainerTemplatesList, useRetainerTemplateMutations } from '../api/useRetainerTemplates';
import { usePermission } from '@/lib/permissions';
import type { RetainerTemplate } from '../api/types';

export interface RetainerTemplateListProps {
  onNewTemplate: () => void;
  onEditTemplate: (template: RetainerTemplate) => void;
}

export function RetainerTemplateList({
  onNewTemplate,
  onEditTemplate,
}: RetainerTemplateListProps) {
  const canEditRetainers = usePermission('retainers:edit');
  const { data: templates = [], isLoading, error } = useRetainerTemplatesList();
  const { deleteTemplate } = useRetainerTemplateMutations();

  const [deleteCandidate, setDeleteCandidate] = useState<RetainerTemplate | null>(null);

  const handleDeleteConfirm = async () => {
    if (!deleteCandidate) return;
    try {
      await deleteTemplate(deleteCandidate.id, deleteCandidate.name);
      setDeleteCandidate(null);
    } catch {
      // Errors handled verbatim by runBlockingAction
    }
  };

  return (
    <div className="space-y-4" data-testid="retainer-template-list-container">
      {/* Header with Title and Add Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            Retainer Template Blueprints
          </h3>
          <p className="text-xs text-slate-500 pt-0.5">
            Standardized multi-task workflow templates for recurring client retainers.
          </p>
        </div>

        {canEditRetainers && (
          <Button
            onClick={onNewTemplate}
            size="sm"
            className="h-9 gap-1.5 text-xs font-semibold bg-[#2563eb] text-white hover:bg-blue-700 shadow-xs shrink-0"
            data-testid="new-template-button"
          >
            <Plus className="h-4 w-4" />
            New Template
          </Button>
        )}
      </div>

      {/* Templates List */}
      {isLoading ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-xs text-slate-500 space-y-2">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
          <p>Loading retainer templates...</p>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-6 text-center text-xs text-rose-700 space-y-1">
          <AlertCircle className="h-5 w-5 mx-auto text-rose-600" />
          <p className="font-semibold">Failed to load retainer templates</p>
          <p>{error.message}</p>
        </div>
      ) : templates.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center text-xs text-slate-500 space-y-2">
          <FileText className="h-8 w-8 mx-auto text-slate-400" />
          <p className="font-semibold text-slate-700">No retainer templates created yet</p>
          <p>Create reusable template blueprints to streamline annual or monthly service generations.</p>
          {canEditRetainers && (
            <Button
              onClick={onNewTemplate}
              variant="outline"
              size="sm"
              className="text-xs mt-2"
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Create First Template
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="template-cards-grid">
          {templates.map((tpl) => {
            const preCount = (tpl.tasks || []).filter((t) => t.phase === 'pre_processing').length;
            const procCount = (tpl.tasks || []).filter((t) => t.phase === 'processing').length;
            const totalTasks = (tpl.tasks || []).length;

            return (
              <div
                key={tpl.id}
                data-testid={`template-card-${tpl.id}`}
                className="flex flex-col justify-between rounded-lg border border-slate-200 bg-white p-4 shadow-xs hover:border-slate-300 transition-all"
              >
                <div className="space-y-3">
                  {/* Card Header & Badges */}
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-bold text-sm text-slate-900 leading-tight" data-testid={`template-name-${tpl.id}`}>
                      {tpl.name}
                    </h4>

                    <div className="flex items-center gap-1 shrink-0">
                      {tpl.recurrence === 'annual' ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] py-0 px-1.5 border-purple-200 bg-purple-50 text-purple-700 font-semibold gap-1"
                          data-testid={`template-recurrence-${tpl.id}`}
                        >
                          <Repeat className="h-3 w-3" />
                          Annual
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-[10px] py-0 px-1.5 border-slate-200 bg-slate-50 text-slate-600"
                        >
                          None
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Description */}
                  {tpl.description && (
                    <p className="text-xs text-slate-600 line-clamp-2">
                      {tpl.description}
                    </p>
                  )}

                  {/* Client & Billing Info */}
                  <div className="space-y-1.5 text-xs text-slate-600 pt-1 border-t border-slate-100">
                    {tpl.clients?.name && (
                      <div className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-slate-400" />
                        <span className="font-medium text-slate-800">{tpl.clients.name}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>Schedule: <strong className="text-slate-700 uppercase">{tpl.schedule || 'None'}</strong></span>
                      <span>Priority: <strong className="text-slate-700">{tpl.priority}</strong></span>
                    </div>
                    {tpl.pf_amount > 0 && (
                      <div className="text-[11px] text-slate-500">
                        PF Amount: <strong className="text-emerald-700">₱{tpl.pf_amount.toLocaleString()}</strong>
                      </div>
                    )}
                  </div>

                  {/* Task Phase Breakdown */}
                  <div className="rounded-md bg-slate-50 p-2 text-xs flex items-center justify-between">
                    <span className="flex items-center gap-1 font-medium text-slate-700">
                      <Layers className="h-3.5 w-3.5 text-blue-600" />
                      {totalTasks} Task{totalTasks !== 1 ? 's' : ''}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {preCount} Pre-Proc • {procCount} Proc
                    </span>
                  </div>
                </div>

                {/* Card Actions Footer */}
                {canEditRetainers && (
                  <div className="flex items-center justify-end gap-1 pt-3 mt-3 border-t border-slate-100">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEditTemplate(tpl)}
                      className="h-8 gap-1 text-xs text-slate-600 hover:text-blue-600"
                      data-testid={`edit-template-btn-${tpl.id}`}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteCandidate(tpl)}
                      className="h-8 gap-1 text-xs text-slate-600 hover:text-rose-600"
                      data-testid={`delete-template-btn-${tpl.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <Dialog
        open={Boolean(deleteCandidate)}
        onOpenChange={(open) => !open && setDeleteCandidate(null)}
      >
        <DialogContent className="max-w-md p-6" data-testid="template-delete-modal">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-slate-900">
              Delete Retainer Template
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500 pt-1">
              Are you sure you want to delete template &quot;{deleteCandidate?.name}&quot;? Existing work requests generated from this template will remain unaffected.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeleteCandidate(null)}
              className="text-xs h-9"
              data-testid="cancel-delete-template-btn"
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDeleteConfirm}
              className="text-xs h-9 bg-rose-600 text-white hover:bg-rose-700"
              data-testid="confirm-delete-template-btn"
            >
              Delete Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
