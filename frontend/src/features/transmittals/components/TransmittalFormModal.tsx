/**
 * Transmittal Creation and Editing Modal
 *
 * Implements dynamic line-item manager requiring >= 1 valid document row.
 * Integrates client selector and work request selector.
 */

import React, { useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  FileText,
  AlertCircle,
  Building,
  Briefcase,
  User,
  Hash,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const Label = ({ className = '', children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
  <label className={`block text-xs font-semibold text-slate-700 ${className}`} {...props}>
    {children}
  </label>
);

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = '', ...props }, ref) => (
    <textarea
      ref={ref}
      className={`flex min-h-[60px] w-full rounded-md border border-slate-200 bg-transparent px-3 py-2 text-xs shadow-xs placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useClients } from '@/features/operations/api/useClients';
import { useWorkRequests } from '@/features/operations/api/useWorkRequests';
import { useWorkRequestTasks } from '@/features/operations/api/useTasks';
import { useCreateTransmittal, useUpdateTransmittal } from '../api/useTransmittals';
import { DOCUMENT_CATEGORIES } from '../api/schemas';
import type {
  Transmittal,
  CreateTransmittalItemInput,
} from '../api/types';

/**
 * Frozen Financial Prefill Contract (UAT2-7-contract-side)
 * Integration surface for W2-OPS TaskDetailModal and cross-module deep links.
 * Prefilled fields must be locked where linkage defines them (client from WR).
 */
export interface FinancialPrefill {
  workRequestId?: string;
  taskId?: string;
  clientId?: string;
}

export interface TransmittalFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  transmittalToEdit?: Transmittal | null;
  prefill?: FinancialPrefill;
}

interface FormLineItem {
  id: string; // temporary key for rendering
  description: string;
  documentType: string;
  quantity: number;
}

export function TransmittalFormModal({
  isOpen,
  onClose,
  transmittalToEdit,
  prefill,
}: TransmittalFormModalProps) {
  const isEditMode = Boolean(transmittalToEdit);

  const createMutation = useCreateTransmittal();
  const updateMutation = useUpdateTransmittal();

  // Load clients and work requests for selection
  const { data: clients = [] } = useClients();
  const { data: workRequestsData } = useWorkRequests({ archived: false });
  const workRequests = React.useMemo(() => {
    if (!workRequestsData) return [];
    if (Array.isArray(workRequestsData)) return workRequestsData;
    return workRequestsData.data ?? [];
  }, [workRequestsData]);

  // Form Fields State
  const [clientId, setClientId] = useState('');
  const [workRequestId, setWorkRequestId] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientDetails, setRecipientDetails] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<FormLineItem[]>([
    { id: 'item-1', description: '', documentType: 'Contract', quantity: 1 },
  ]);

  // Form validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Tasks query for selected work request
  const { data: tasksData = [] } = useWorkRequestTasks(
    workRequestId || undefined,
    { enabled: isOpen && Boolean(workRequestId) }
  );
  const tasks = tasksData || [];

  // Reset or Populate form on open/change
  useEffect(() => {
    if (transmittalToEdit) {
      setClientId(transmittalToEdit.client_id || '');
      setWorkRequestId(transmittalToEdit.work_request_id || '');
      setSelectedTaskId(transmittalToEdit.linked_task_id || transmittalToEdit.linkedTaskId || '');
      setTrackingNumber(transmittalToEdit.tracking_number || '');
      setRecipientName(transmittalToEdit.recipient_name || '');
      setRecipientDetails(transmittalToEdit.recipient_details || '');
      setNotes(transmittalToEdit.notes || '');

      if (transmittalToEdit.items && transmittalToEdit.items.length > 0) {
        setItems(
          transmittalToEdit.items.map((item, idx) => ({
            id: item.id || `item-${idx}`,
            description: item.description,
            documentType: item.document_type || item.documentType || 'Contract',
            quantity: item.quantity || 1,
          }))
        );
      } else {
        setItems([{ id: 'item-1', description: '', documentType: 'Contract', quantity: 1 }]);
      }
    } else {
      // Create defaults
      const autoTracking = `TR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      setTrackingNumber(autoTracking);
      setWorkRequestId(prefill?.workRequestId || '');
      setClientId(prefill?.clientId || '');
      setSelectedTaskId(prefill?.taskId || '');
      setRecipientName('');
      setRecipientDetails('');
      setNotes('');
      setItems([{ id: 'item-1', description: '', documentType: 'Contract', quantity: 1 }]);
    }
    setErrors({});
  }, [transmittalToEdit, isOpen, prefill]);

  // Auto-detect client from work request in create mode
  useEffect(() => {
    if (isOpen && !isEditMode && workRequestId && workRequests.length > 0) {
      const matchedWr = workRequests.find((w) => w.id === workRequestId);
      if (matchedWr?.client_id && !clientId) {
        setClientId(matchedWr.client_id);
      }
    }
  }, [isOpen, isEditMode, workRequestId, workRequests, clientId]);

  const handleWorkRequestChange = (newWrId: string) => {
    setWorkRequestId(newWrId);
    setSelectedTaskId('');
    const matchedWr = workRequests.find((w) => w.id === newWrId);
    if (matchedWr?.client_id) {
      setClientId(matchedWr.client_id);
    }
  };

  const isClientLocked = Boolean(!isEditMode && (prefill?.workRequestId || prefill?.clientId));
  const isWrLocked = Boolean(!isEditMode && prefill?.workRequestId);
  const isTaskLocked = Boolean(!isEditMode && prefill?.taskId);

  // Line Items Controls
  const handleAddItem = () => {
    const newItem: FormLineItem = {
      id: `item-${Date.now()}-${Math.random()}`,
      description: '',
      documentType: 'Contract',
      quantity: 1,
    };
    setItems((prev) => [...prev, newItem]);
  };

  const handleRemoveItem = (id: string) => {
    if (items.length <= 1) {
      setErrors((prev) => ({
        ...prev,
        items: 'At least 1 document line item is required.',
      }));
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleItemChange = (
    id: string,
    field: keyof Omit<FormLineItem, 'id'>,
    value: string | number
  ) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id === id) {
          return { ...i, [field]: value };
        }
        return i;
      })
    );
    // Clear items error
    if (errors.items) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.items;
        return next;
      });
    }
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};

    if (!clientId) {
      newErrors.clientId = 'Please select a client';
    }
    if (!workRequestId && !isEditMode) {
      newErrors.workRequestId = 'Please select a work request';
    }
    if (!trackingNumber.trim()) {
      newErrors.trackingNumber = 'Tracking number is required';
    }
    if (items.length === 0) {
      newErrors.items = 'At least 1 document row is required';
    }

    const invalidRow = items.find((i) => !i.description.trim());
    if (invalidRow) {
      newErrors.items = 'All document rows must have a valid description';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const sanitizedItems: CreateTransmittalItemInput[] = items.map((i) => ({
      description: i.description.trim(),
      documentType: i.documentType || 'Others',
      quantity: Number(i.quantity) || 1,
    }));

    try {
      if (isEditMode && transmittalToEdit) {
        await updateMutation.mutateAsync({
          id: transmittalToEdit.id,
          data: {
            clientId,
            workRequestId: workRequestId || null,
            linkedTaskId: selectedTaskId || null,
            trackingNumber: trackingNumber.trim(),
            items: sanitizedItems,
            recipientName: recipientName.trim() || null,
            recipientDetails: recipientDetails.trim() || null,
            notes: notes.trim() || null,
            expectedVersion: transmittalToEdit.version,
          },
        });
      } else {
        await createMutation.mutateAsync({
          clientId,
          workRequestId,
          linkedTaskId: selectedTaskId || null,
          trackingNumber: trackingNumber.trim(),
          items: sanitizedItems,
          recipientName: recipientName.trim() || null,
          recipientDetails: recipientDetails.trim() || null,
          notes: notes.trim() || null,
        });
      }
      onClose();
    } catch {
      // Error handled by BlockingActionModal
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto"
        data-testid="transmittal-form-modal"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <FileText className="h-5 w-5 text-blue-600" />
            {isEditMode ? 'Edit Transmittal' : 'Create New Transmittal'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5 pt-2">
          {/* General Information Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Tracking Number */}
            <div className="space-y-1.5">
              <Label htmlFor="trackingNumber" className="text-xs font-semibold flex items-center gap-1 text-slate-700">
                <Hash className="h-3.5 w-3.5" />
                Tracking Number *
              </Label>
              <Input
                id="trackingNumber"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.target.value)}
                placeholder="e.g. TR-ATA-2026-0001"
                className="font-mono text-xs"
                data-testid="tracking-number-input"
              />
              {errors.trackingNumber && (
                <p className="text-[11px] text-rose-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.trackingNumber}
                </p>
              )}
            </div>

            {/* Client Picker */}
            <div className="space-y-1.5">
              <Label htmlFor="client" className="text-xs font-semibold flex items-center gap-1 text-slate-700">
                <Building className="h-3.5 w-3.5" />
                Client *
              </Label>
              <Select value={clientId} onValueChange={setClientId} disabled={isClientLocked}>
                <SelectTrigger id="client" className="text-xs" data-testid="client-select">
                  <SelectValue placeholder="Select client..." />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} ({c.entity})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.clientId && (
                <p className="text-[11px] text-rose-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.clientId}
                </p>
              )}
            </div>

            {/* Work Request linkage */}
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="workRequest" className="text-xs font-semibold flex items-center gap-1 text-slate-700">
                <Briefcase className="h-3.5 w-3.5" />
                Work Request {isEditMode ? '(Optional)' : '*'}
              </Label>
              <Select value={workRequestId} onValueChange={handleWorkRequestChange} disabled={isWrLocked}>
                <SelectTrigger id="workRequest" className="text-xs" data-testid="work-request-select">
                  <SelectValue placeholder="Link to work request..." />
                </SelectTrigger>
                <SelectContent>
                  {workRequests.map((wr) => (
                    <SelectItem key={wr.id} value={wr.id}>
                      {wr.tracking_number || wr.title} — {wr.client_name || 'Client'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.workRequestId && (
                <p className="text-[11px] text-rose-600 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {errors.workRequestId}
                </p>
              )}
            </div>

            {/* Linked Task (Optional) */}
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="workRequestTask" className="text-xs font-semibold flex items-center gap-1 text-slate-700">
                <Briefcase className="h-3.5 w-3.5" />
                Linked Task (Optional)
              </Label>
              <Select
                value={selectedTaskId || '__none__'}
                onValueChange={(val) => setSelectedTaskId(val === '__none__' ? '' : val)}
                disabled={isTaskLocked || !workRequestId}
              >
                <SelectTrigger id="workRequestTask" className="text-xs" data-testid="task-select">
                  <SelectValue
                    placeholder={
                      !workRequestId
                        ? 'Select work request first...'
                        : 'Select linked task (optional)...'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None (No linked task)</SelectItem>
                  {tasks.map((task) => (
                    <SelectItem key={task.id} value={task.id}>
                      {task.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Recipient Person Name */}
            <div className="space-y-1.5">
              <Label htmlFor="recipientName" className="text-xs font-semibold flex items-center gap-1 text-slate-700">
                <User className="h-3.5 w-3.5" />
                Recipient Name
              </Label>
              <Input
                id="recipientName"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="Target contact person..."
                className="text-xs"
                data-testid="recipient-name-input"
              />
            </div>

            {/* Recipient Details / Address */}
            <div className="space-y-1.5">
              <Label htmlFor="recipientDetails" className="text-xs font-semibold text-slate-700">
                Delivery Address / Contact
              </Label>
              <Input
                id="recipientDetails"
                value={recipientDetails}
                onChange={(e) => setRecipientDetails(e.target.value)}
                placeholder="Office suite, building, phone..."
                className="text-xs"
                data-testid="recipient-details-input"
              />
            </div>
          </div>

          {/* Line Items Manager Section */}
          <div className="space-y-3 pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Document Line Items *
                </Label>
                <p className="text-[11px] text-slate-500">
                  Add documents to transmit (at least 1 line item required).
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAddItem}
                className="h-7 text-xs gap-1 border-blue-200 text-blue-700 hover:bg-blue-50"
                data-testid="add-item-row-btn"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Document Row
              </Button>
            </div>

            {errors.items && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-rose-700 text-xs flex items-center gap-2" data-testid="items-error-message">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errors.items}</span>
              </div>
            )}

            {/* Line Items Table */}
            <div className="space-y-2">
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200"
                  data-testid={`transmittal-form-item-row-${index}`}
                >
                  <span className="text-xs font-mono font-semibold text-slate-400 w-5 text-center shrink-0">
                    #{index + 1}
                  </span>

                  {/* Document Category */}
                  <div className="w-36 shrink-0">
                    <Select
                      value={item.documentType}
                      onValueChange={(val) => handleItemChange(item.id, 'documentType', val)}
                    >
                      <SelectTrigger className="h-8 text-xs bg-white" data-testid={`item-category-select-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DOCUMENT_CATEGORIES.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Description Input */}
                  <div className="flex-1 min-w-0">
                    <Input
                      placeholder="Document title or description..."
                      value={item.description}
                      onChange={(e) => handleItemChange(item.id, 'description', e.target.value)}
                      className="h-8 text-xs bg-white"
                      data-testid={`item-description-input-${index}`}
                    />
                  </div>

                  {/* Quantity Input */}
                  <div className="w-20 shrink-0">
                    <Input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => handleItemChange(item.id, 'quantity', Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="h-8 text-xs bg-white text-center"
                      title="Quantity"
                      data-testid={`item-quantity-input-${index}`}
                    />
                  </div>

                  {/* Remove row */}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemoveItem(item.id)}
                    className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50 shrink-0"
                    title="Remove item"
                    data-testid={`remove-item-row-btn-${index}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1.5 pt-2 border-t border-slate-200">
            <Label htmlFor="notes" className="text-xs font-semibold text-slate-700">
              Delivery Notes / Instructions
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Instructions for courier, handling remarks, or client notes..."
              rows={2}
              className="text-xs"
              data-testid="notes-textarea"
            />
          </div>

          {/* Modal Footer */}
          <DialogFooter className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="h-8 text-xs"
              data-testid="cancel-form-btn"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium"
              data-testid="submit-transmittal-btn"
            >
              {isEditMode ? 'Save Changes' : 'Create Transmittal'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
