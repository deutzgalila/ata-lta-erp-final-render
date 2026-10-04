import React, { useState } from 'react';
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
import { useRetainerTemplates, useRetainerMutations } from '../api/useRetainers';
import { useClients } from '../api/useClients';
import { runBlockingAction } from './BlockingActionModal';
import { operationsKeys } from '../api/queryKeys';
import { useSessionStore } from '@/lib/session';
import type { RetainerGenerateResponse } from '../api/types';

export interface RetainerGenerateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (res: RetainerGenerateResponse) => void;
}

export function RetainerGenerateModal({
  isOpen,
  onClose,
  onSuccess,
}: RetainerGenerateModalProps) {
  const [templateId, setTemplateId] = useState<string>('');
  const [periodLabel, setPeriodLabel] = useState<string>(
    String(new Date().getFullYear())
  );
  const [clientId, setClientId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const { data: templates = [], isLoading: isTemplatesLoading } =
    useRetainerTemplates();
  const { data: clients = [] } = useClients();
  const { generateFromTemplate } = useRetainerMutations();
  const activeEntity = useSessionStore((state) => state.activeEntity);

  const selectedTemplate = templates.find((t) => t.id === templateId);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateId) {
      setError('Please select a retainer template.');
      return;
    }

    if (selectedTemplate?.recurrence === 'annual' && !periodLabel.trim()) {
      setError('Period label is required for annual recurring templates.');
      return;
    }
    setError(null);

    await runBlockingAction({
      title: 'Generating Work Requests',
      message: `Generating work requests from template "${selectedTemplate?.name}"...`,
      apiCall: async () => {
        return await generateFromTemplate({
          templateId,
          period_label: periodLabel.trim() || undefined,
          overrides: clientId ? { clientId } : undefined,
        });
      },
      successTitle: 'Work Requests Generated',
      successMessage: 'Successfully generated work requests from retainer template.',
      invalidateQueries: [
        operationsKeys.workRequests(),
        operationsKeys.workRequestCounts(activeEntity),
      ],
      onSuccess: (data) => {
        if (onSuccess && data) {
          onSuccess(data as RetainerGenerateResponse);
        }
        onClose();
      },
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-md p-6 space-y-4"
        data-testid="retainer-generate-modal"
      >
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-slate-900">
            Generate from Retainer Template
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-600 pt-1">
            Create pre-configured recurring work requests from an authorized template.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleGenerate} className="space-y-4">
          {/* Template Selection */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">
              Retainer Template <span className="text-red-500">*</span>
            </label>
            <Select
              value={templateId || 'unselected'}
              onValueChange={(val) => {
                setTemplateId(val === 'unselected' ? '' : val);
                if (error) setError(null);
              }}
              disabled={isTemplatesLoading}
            >
              <SelectTrigger
                className="h-9 bg-white"
                data-testid="template-select"
              >
                <SelectValue placeholder="Select Template..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unselected">— Choose Template —</SelectItem>
                {templates.map((tpl) => (
                  <SelectItem key={tpl.id} value={tpl.id}>
                    {tpl.name} ({tpl.entity || tpl.entity_id} • {tpl.recurrence})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Period Label Prompt (especially for annual recurrence) */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">
              Period Label
              {selectedTemplate?.recurrence === 'annual' && (
                <span className="text-red-500"> *</span>
              )}
            </label>
            <Input
              value={periodLabel}
              onChange={(e) => {
                setPeriodLabel(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. 2026, Q1 2026, January 2026"
              className="h-9 bg-white text-xs"
              data-testid="period-label-input"
            />
            <span className="text-[11px] text-slate-400">
              Label appended to generated work request titles (e.g. "Annual Tax Return - 2026")
            </span>
          </div>

          {/* Client Override (Optional) */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">
              Target Client (Optional Override)
            </label>
            <Select
              value={clientId || 'all'}
              onValueChange={(val) => setClientId(val === 'all' ? '' : val)}
            >
              <SelectTrigger className="h-9 bg-white">
                <SelectValue placeholder="All active retainer clients" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">— All Retainer Clients —</SelectItem>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} ({c.entity})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {error && (
            <div className="text-xs text-red-600 font-medium" data-testid="generate-error">
              {error}
            </div>
          )}

          <DialogFooter className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!templateId}
              data-testid="generate-submit-btn"
              className="text-xs font-semibold"
            >
              Generate Work Requests
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
