import React, { useState, useEffect } from 'react';
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
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/api';
import { useSessionStore } from '@/lib/session';
import { DISBURSEMENT_CATEGORIES, FUND_SOURCES } from '../api/schemas';
import { useCreateDisbursement } from '../api/useDisbursements';
import { useWorkRequests } from '@/features/operations/api/useWorkRequests';
import { useWorkRequestTasks } from '@/features/operations/api/useTasks';
import type { ClientSummary } from '@/features/operations/api/useClients';
import type { WorkRequest } from '@/features/operations/api/types';
import type { CreateDisbursementInput, FundSource } from '../api/types';

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

export interface CreateDisbursementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  prefill?: FinancialPrefill;
  defaultWorkRequestId?: string;
  defaultClientId?: string;
}

export function CreateDisbursementModal({
  isOpen,
  onClose,
  onSuccess,
  prefill,
  defaultWorkRequestId = '',
  defaultClientId = '',
}: CreateDisbursementModalProps) {
  const { createWithBlocking, isPending } = useCreateDisbursement();

  const [category, setCategory] = useState<string>(DISBURSEMENT_CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<string>('');
  const [fundSource, setFundSource] = useState<FundSource>('Firm Fund');
  const [linkedWorkRequestId, setLinkedWorkRequestId] = useState(
    prefill?.workRequestId || defaultWorkRequestId || ''
  );
  const [clientId, setClientId] = useState(prefill?.clientId || defaultClientId || '');
  const [selectedTaskId, setSelectedTaskId] = useState(prefill?.taskId || '');
  const [employeeId, setEmployeeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [receiptFilename, setReceiptFilename] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const canFetch = React.useMemo(() => {
    if (!isOpen) return false;
    const isTest =
      (typeof process !== 'undefined' && process.env?.NODE_ENV === 'test') ||
      (typeof import.meta !== 'undefined' &&
        (import.meta as { env?: { MODE?: string } }).env?.MODE === 'test');
    const isMocked =
      typeof globalThis.fetch === 'function' &&
      Boolean((globalThis.fetch as { mock?: unknown }).mock);
    const hasToken =
      typeof window !== 'undefined' && Boolean(window.localStorage?.getItem('erp_access_token'));
    return isTest ? isMocked : hasToken;
  }, [isOpen]);

  const activeEntity = useSessionStore((state) => state.activeEntity);
  const effectiveEntity = activeEntity !== 'ALL' ? activeEntity : undefined;

  const { data: clientsData = [] } = useQuery<ClientSummary[]>({
    queryKey: ['clients', 'list', effectiveEntity, undefined, undefined],
    queryFn: async () => {
      const searchParams = new URLSearchParams();
      if (effectiveEntity) searchParams.append('entity', effectiveEntity);
      const queryStr = searchParams.toString();
      const res = await apiRequest<{ data: ClientSummary[] } | ClientSummary[]>(
        `/clients${queryStr ? `?${queryStr}` : ''}`
      );
      if (Array.isArray(res)) return res;
      return (res as { data?: ClientSummary[] }).data ?? [];
    },
    enabled: canFetch,
  });

  const clients: ClientSummary[] = React.useMemo(() => {
    if (!clientsData) return [];
    if (Array.isArray(clientsData)) return clientsData;
    return (clientsData as { data?: ClientSummary[] }).data ?? [];
  }, [clientsData]);

  const { data: workRequestsData } = useWorkRequests({ archived: false }, { enabled: canFetch });
  const workRequests: WorkRequest[] = React.useMemo(() => {
    if (!workRequestsData) return [];
    if (Array.isArray(workRequestsData)) return workRequestsData;
    return (workRequestsData as { data?: WorkRequest[] }).data ?? [];
  }, [workRequestsData]);

  // Filter available work requests by clientId when client is locked or prefilled (Contract Rule 3)
  const availableWorkRequests = React.useMemo(() => {
    const lockedClientId = prefill?.clientId || defaultClientId;
    if (lockedClientId) {
      return workRequests.filter((wr) => (wr.client_id || wr.clientId) === lockedClientId);
    }
    return workRequests;
  }, [workRequests, prefill?.clientId, defaultClientId]);

  // Synchronize prefill contract and defaults on modal open, reset on close
  useEffect(() => {
    if (isOpen) {
      setLinkedWorkRequestId(prefill?.workRequestId || defaultWorkRequestId || '');
      setClientId(prefill?.clientId || defaultClientId || '');
      setSelectedTaskId(prefill?.taskId || '');
      setErrors({});
    } else {
      setCategory(DISBURSEMENT_CATEGORIES[0]);
      setDescription('');
      setAmount('');
      setFundSource('Firm Fund');
      setLinkedWorkRequestId('');
      setClientId('');
      setSelectedTaskId('');
      setEmployeeId('');
      setDueDate('');
      setNotes('');
      setReceiptFilename('');
      setErrors({});
    }
  }, [isOpen, prefill, defaultWorkRequestId, defaultClientId]);

  // WR-Task query (UAT2-12: populated dynamically from useWorkRequestTasks)
  const { data: tasksData = [] } = useWorkRequestTasks(linkedWorkRequestId || undefined, {
    enabled: canFetch && Boolean(linkedWorkRequestId),
  });
  const tasks = tasksData || [];

  // Auto-detect client from selected work request
  const selectedWr = workRequests.find((wr) => wr.id === linkedWorkRequestId);

  useEffect(() => {
    const isClientLockedByPrefill = Boolean(prefill?.clientId || defaultClientId);
    if (isOpen && linkedWorkRequestId && selectedWr?.client_id && !isClientLockedByPrefill) {
      if (clientId !== selectedWr.client_id) {
        setClientId(selectedWr.client_id);
      }
    }
  }, [isOpen, linkedWorkRequestId, selectedWr, prefill?.clientId, defaultClientId, clientId]);

  const clientDisplayName = React.useMemo(() => {
    if (selectedWr) {
      return (
        selectedWr.clientName ||
        selectedWr.client_name ||
        clients.find((c) => c.id === selectedWr.client_id)?.name ||
        (selectedWr.client_id ? `Client (${selectedWr.client_id})` : '')
      );
    }
    if (clientId) {
      return clients.find((c) => c.id === clientId)?.name || `Client (${clientId})`;
    }
    return '';
  }, [selectedWr, clientId, clients]);

  const handleSelectWorkRequest = (wrId: string) => {
    setLinkedWorkRequestId(wrId);
    setSelectedTaskId('');
    if (errors.linkedWorkRequestId) {
      setErrors((prev) => ({ ...prev, linkedWorkRequestId: '' }));
    }
    const isClientLockedByPrefill = Boolean(prefill?.clientId || defaultClientId);
    if (wrId) {
      const found = workRequests.find((wr) => wr.id === wrId);
      if (found?.client_id && !isClientLockedByPrefill) {
        setClientId(found.client_id);
      }
    } else if (!isClientLockedByPrefill) {
      setClientId('');
    }
  };

  const isWrLocked = Boolean(prefill?.workRequestId);
  const isTaskLocked = Boolean(prefill?.taskId);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!category.trim()) {
      newErrors.category = 'Category is required';
    }
    if (!description.trim()) {
      newErrors.description = 'Description is required';
    } else if (description.trim().length > 2000) {
      newErrors.description = 'Description cannot exceed 2000 characters';
    }
    const numAmount = parseFloat(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      newErrors.amount = 'Amount must be a positive number greater than 0';
    }
    if (!linkedWorkRequestId.trim()) {
      newErrors.linkedWorkRequestId = 'Please select a Work Request';
    }

    if (employeeId.trim()) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(employeeId.trim())) {
        newErrors.employeeId = 'Invalid Employee UUID format';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const resetForm = () => {
    setCategory(DISBURSEMENT_CATEGORIES[0]);
    setDescription('');
    setAmount('');
    setFundSource('Firm Fund');
    setLinkedWorkRequestId(prefill?.workRequestId || defaultWorkRequestId || '');
    setClientId(prefill?.clientId || defaultClientId || '');
    setSelectedTaskId(prefill?.taskId || '');
    setEmployeeId('');
    setDueDate('');
    setNotes('');
    setReceiptFilename('');
    setErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    // Status Anti-Forgery: Notice that `status` is NEVER defined in payload!
    const payload: CreateDisbursementInput = {
      category,
      description: description.trim(),
      amount: parseFloat(amount),
      fundSource,
      linkedWorkRequestId: linkedWorkRequestId.trim(),
      clientId: clientId ? clientId.trim() : null,
      linkedTaskId: selectedTaskId ? selectedTaskId.trim() : null,
      employeeId: employeeId.trim() ? employeeId.trim() : null,
      dueDate: dueDate ? dueDate : null,
      notes: notes.trim() ? notes.trim() : null,
      receiptFilename: receiptFilename.trim() ? receiptFilename.trim() : null,
    };

    try {
      await createWithBlocking(payload);
      resetForm();
      onClose();
      if (onSuccess) onSuccess();
    } catch {
      // Errors handled via BlockingActionModal
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto"
        data-testid="create-disbursement-modal"
      >
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-900">
            New Disbursement Voucher
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-600">
            Submit a new expense or reimbursement voucher. Initial status is assigned automatically
            by the system.
          </DialogDescription>
        </DialogHeader>

        <form
          noValidate
          onSubmit={handleSubmit}
          className="space-y-4"
          data-testid="create-disbursement-form"
        >
          {/* Work Request Dropdown (UAT2-12: eliminates manual WR-id input) */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">
              Linked Work Request <span className="text-red-500">*</span>
            </label>
            <div className="space-y-1.5">
              <select
                value={
                  workRequests.some((w) => w.id === linkedWorkRequestId)
                    ? linkedWorkRequestId
                    : linkedWorkRequestId || ''
                }
                onChange={(e) => handleSelectWorkRequest(e.target.value)}
                disabled={isWrLocked}
                className="w-full text-xs p-2 border rounded-md bg-white border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                data-testid="select-work-request"
              >
                <option value="">Select Work Request...</option>
                {availableWorkRequests.map((wr) => (
                  <option key={wr.id} value={wr.id}>
                    {wr.title} — {wr.clientName || wr.client_name || 'Client'}
                  </option>
                ))}
              </select>
            </div>
            {errors.linkedWorkRequestId && (
              <span className="text-[11px] text-red-600 block" data-testid="error-work-request-id">
                {errors.linkedWorkRequestId}
              </span>
            )}
          </div>

          {/* Associated Client (Auto-Detected, Read-Only) & Linked Task */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                Associated Client (Auto-Detected)
              </label>
              <Input
                type="text"
                readOnly
                disabled
                value={
                  clientDisplayName ||
                  (clientId ? `Client Associated (${clientId.slice(0, 8)})` : '')
                }
                placeholder="Auto-detected from Work Request"
                className="bg-slate-50 text-slate-700 cursor-not-allowed text-xs disabled:opacity-80"
                data-testid="display-client-name"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Linked Task (Optional)</label>
              <select
                value={selectedTaskId}
                onChange={(e) => setSelectedTaskId(e.target.value)}
                disabled={isTaskLocked || !linkedWorkRequestId}
                className="w-full text-xs p-2 border rounded-md bg-white border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:cursor-not-allowed"
                data-testid="select-work-request-task"
              >
                <option value="">
                  {!linkedWorkRequestId
                    ? 'Select a Work Request first...'
                    : 'None (No linked task)'}
                </option>
                {tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Category & Fund Source */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full text-xs p-2 border rounded-md bg-white border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                data-testid="select-category"
              >
                {DISBURSEMENT_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
              {errors.category && (
                <span className="text-[11px] text-red-600 block">{errors.category}</span>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                Fund Source <span className="text-red-500">*</span>
              </label>
              <select
                value={fundSource}
                onChange={(e) => setFundSource(e.target.value as FundSource)}
                className="w-full text-xs p-2 border rounded-md bg-white border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                data-testid="select-fund-source"
              >
                {FUND_SOURCES.map((src) => (
                  <option key={src} value={src}>
                    {src}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Amount & Due Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">
                Amount (PHP) <span className="text-red-500">*</span>
              </label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  if (errors.amount) setErrors((prev) => ({ ...prev, amount: '' }));
                }}
                className={errors.amount ? 'border-red-500' : ''}
                data-testid="input-amount"
              />
              {errors.amount && (
                <span className="text-[11px] text-red-600 block" data-testid="error-amount">
                  {errors.amount}
                </span>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Due Date</label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                data-testid="input-due-date"
              />
            </div>
          </div>

          {/* Employee ID */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">Employee ID (Optional)</label>
            <Input
              type="text"
              placeholder="Employee UUID"
              value={employeeId}
              onChange={(e) => {
                setEmployeeId(e.target.value);
                if (errors.employeeId) setErrors((prev) => ({ ...prev, employeeId: '' }));
              }}
              className={errors.employeeId ? 'border-red-500' : ''}
              data-testid="input-employee-id"
            />
            {errors.employeeId && (
              <span className="text-[11px] text-red-600 block">{errors.employeeId}</span>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">
              Description / Expense Purpose <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                if (errors.description) setErrors((prev) => ({ ...prev, description: '' }));
              }}
              placeholder="e.g. BIR filing documentary stamp tax and notarization fees"
              className={`w-full text-xs p-2.5 border rounded-md bg-white text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                errors.description ? 'border-red-500' : 'border-slate-200'
              }`}
              data-testid="textarea-description"
            />
            {errors.description && (
              <span className="text-[11px] text-red-600 block" data-testid="error-description">
                {errors.description}
              </span>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">
              Internal Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional internal remarks or references..."
              className="w-full text-xs p-2 border rounded-md bg-white border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
              data-testid="textarea-notes"
            />
          </div>

          {/* Receipt Filename */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">
              Receipt Attachment (Optional)
            </label>
            <Input
              type="text"
              placeholder="e.g. bir_official_receipt_48912.pdf"
              value={receiptFilename}
              onChange={(e) => setReceiptFilename(e.target.value)}
              data-testid="input-receipt-filename"
            />
          </div>

          <DialogFooter className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={isPending}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={isPending}
              data-testid="submit-create-disbursement-btn"
              className="text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isPending ? 'Creating...' : 'Create Disbursement'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
