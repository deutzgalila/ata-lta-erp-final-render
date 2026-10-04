/**
 * Document Lifecycle Transition Modal
 *
 * Allows updating physical lifecycle stage across the 5 enum states:
 * collected -> with_documentations -> scanned -> in_envelope -> stored
 * Guarded by dms:handover.
 */

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2 } from 'lucide-react';
import { DOCUMENT_LIFECYCLE_STAGES } from '../api/types';
import type { DmsDocument, DocumentLifecycle } from '../api/types';
import { LIFECYCLE_LABELS, LIFECYCLE_BADGE_STYLES } from '../constants';

export interface DocumentLifecycleModalProps {
  isOpen: boolean;
  onClose: () => void;
  document: DmsDocument | null;
  onConfirm: (lifecycle: DocumentLifecycle) => Promise<void> | void;
  isLoading?: boolean;
}


const STAGE_DESCRIPTIONS: Record<DocumentLifecycle, string> = {
  collected: 'Physical original document received from client or courier.',
  with_documentations: 'Under processing and review by documentation staff.',
  scanned: 'Digitized and uploaded to Document Management System.',
  in_envelope: 'Placed into physical barcoded envelope for filing.',
  stored: 'Archived into secure physical cabinet / vault location.',
};

export function DocumentLifecycleModal({
  isOpen,
  onClose,
  document,
  onConfirm,
  isLoading = false,
}: DocumentLifecycleModalProps) {
  const [selectedStage, setSelectedStage] = useState<DocumentLifecycle>('collected');

  useEffect(() => {
    if (document) {
      setSelectedStage(document.document_lifecycle);
    }
  }, [document]);

  if (!document) return null;

  const currentStage = document.document_lifecycle;
  const isChanged = selectedStage !== currentStage;

  const handleConfirm = async () => {
    await onConfirm(selectedStage);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg" data-testid="lifecycle-modal">
        <DialogHeader>
          <DialogTitle>Update Physical Lifecycle</DialogTitle>
          <DialogDescription>
            Update custody tracking for <span className="font-semibold text-zinc-900 dark:text-zinc-100">{document.original_name || document.file_name}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="py-3 space-y-4">
          {/* Current Status Pill */}
          <div className="flex items-center justify-between p-3 rounded-md bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-800">
            <span className="text-sm text-zinc-500">Current Stage:</span>
            <Badge
              variant="outline"
              className={LIFECYCLE_BADGE_STYLES[currentStage]}
              data-testid="current-lifecycle-badge"
            >
              {LIFECYCLE_LABELS[currentStage]}
            </Badge>
          </div>

          {/* Sequential Timeline Indicator */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              Custody Pipeline
            </label>
            <div className="grid grid-cols-5 gap-1.5 text-center text-xs">
              {DOCUMENT_LIFECYCLE_STAGES.map((stage, idx) => {
                const isCurrent = stage === currentStage;
                const isSelected = stage === selectedStage;
                return (
                  <div
                    key={stage}
                    className={`p-2 rounded border transition-colors cursor-pointer ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                        : isCurrent
                        ? 'border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800'
                        : 'border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-850'
                    }`}
                    onClick={() => setSelectedStage(stage)}
                    data-testid={`lifecycle-step-${stage}`}
                  >
                    <div className="font-medium truncate">{idx + 1}. {LIFECYCLE_LABELS[stage]}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selection List */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              Select Target Stage
            </label>
            <div className="space-y-2 max-h-56 overflow-y-auto">
              {DOCUMENT_LIFECYCLE_STAGES.map((stage) => {
                const isSelected = selectedStage === stage;
                return (
                  <div
                    key={stage}
                    onClick={() => setSelectedStage(stage)}
                    className={`flex items-start justify-between p-3 rounded-lg border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/40 dark:bg-blue-950/20'
                        : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                    }`}
                    data-testid={`lifecycle-option-${stage}`}
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-zinc-900 dark:text-zinc-100">
                          {LIFECYCLE_LABELS[stage]}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${LIFECYCLE_BADGE_STYLES[stage]}`}
                        >
                          {stage}
                        </Badge>
                      </div>
                      <p className="text-xs text-zinc-500">
                        {STAGE_DESCRIPTIONS[stage]}
                      </p>
                    </div>
                    {isSelected && (
                      <CheckCircle2 className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!isChanged || isLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white"
            data-testid="confirm-lifecycle-button"
          >
            Update Lifecycle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
