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
import { DISBURSEMENT_CATEGORIES, FUND_SOURCES } from '../api/schemas';
import { useCreateDisbursement } from '../api/useDisbursements';
import type { CreateDisbursementInput, FundSource } from '../api/types';

export interface CreateDisbursementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultWorkRequestId?: string;
  defaultClientId?: string;
}

export function CreateDisbursementModal({
  isOpen,
  onClose,
  onSuccess,
  defaultWorkRequestId = '',
  defaultClientId = '',
}: CreateDisbursementModalProps) {
  const { createWithBlocking, isPending } = useCreateDisbursement();

  const [category, setCategory] = useState<string>(DISBURSEMENT_CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<string>('');
  const [fundSource, setFundSource] = useState<FundSource>('Firm Fund');
  const [linkedWorkRequestId, setLinkedWorkRequestId] = useState(defaultWorkRequestId);
  const [clientId, setClientId] = useState(defaultClientId);
  const [employeeId, setEmployeeId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [receiptFilename, setReceiptFilename] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

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
      newErrors.linkedWorkRequestId = 'Work Request UUID is required';
    } else {
      // Basic UUID format check
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(linkedWorkRequestId.trim())) {
        newErrors.linkedWorkRequestId = 'Invalid Work Request UUID format';
      }
    }

    if (clientId.trim()) {
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(clientId.trim())) {
        newErrors.clientId = 'Invalid Client UUID format';
      }
    }

    if (employeeId.trim()) {
      const uuidRegex =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
    setLinkedWorkRequestId(defaultWorkRequestId);
    setClientId(defaultClientId);
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
      clientId: clientId.trim() ? clientId.trim() : null,
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
            Submit a new expense or reimbursement voucher. Initial status is
            assigned automatically by the system.
          </DialogDescription>
        </DialogHeader>

        <form noValidate onSubmit={handleSubmit} className="space-y-4" data-testid="create-disbursement-form">
          {/* Work Request ID */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">
              Linked Work Request ID <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              placeholder="e.g. 11111111-1111-1111-1111-111111111111"
              value={linkedWorkRequestId}
              onChange={(e) => {
                setLinkedWorkRequestId(e.target.value);
                if (errors.linkedWorkRequestId) {
                  setErrors((prev) => ({ ...prev, linkedWorkRequestId: '' }));
                }
              }}
              className={errors.linkedWorkRequestId ? 'border-red-500' : ''}
              data-testid="input-work-request-id"
            />
            {errors.linkedWorkRequestId && (
              <span className="text-[11px] text-red-600 block" data-testid="error-work-request-id">
                {errors.linkedWorkRequestId}
              </span>
            )}
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

          {/* Optional Client ID & Employee ID */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700">Client ID (Optional)</label>
              <Input
                type="text"
                placeholder="Client UUID"
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  if (errors.clientId) setErrors((prev) => ({ ...prev, clientId: '' }));
                }}
                className={errors.clientId ? 'border-red-500' : ''}
                data-testid="input-client-id"
              />
              {errors.clientId && (
                <span className="text-[11px] text-red-600 block">{errors.clientId}</span>
              )}
            </div>

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
            <label className="text-xs font-semibold text-slate-700">Internal Notes (Optional)</label>
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
            <label className="text-xs font-semibold text-slate-700">Receipt Attachment (Optional)</label>
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
