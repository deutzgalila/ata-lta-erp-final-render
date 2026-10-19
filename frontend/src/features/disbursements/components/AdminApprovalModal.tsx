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
import { DateInput } from '@/components/ui/date-input';
import { CheckCircle2 } from 'lucide-react';
import { useApproveDisbursement } from '../api/useDisbursements';
import { approveDisbursementSchema } from '../api/schemas';
import { isConcurrencyConflictError } from '@/components/common/ConflictResolutionModal';
import { useBlockingModalStore } from '@/features/operations/components/BlockingActionModal';
import type { Disbursement } from '../api/types';

export interface AdminApprovalModalProps {
  isOpen: boolean;
  disbursement: Disbursement | null;
  onClose: () => void;
  onSuccess?: () => void;
  onConflict?: (err: unknown) => void;
}

export function AdminApprovalModal({
  isOpen,
  disbursement,
  onClose,
  onSuccess,
  onConflict,
}: AdminApprovalModalProps) {
  const { approveWithBlocking } = useApproveDisbursement();

  const [method, setMethod] = useState('Bank Transfer');
  const [reference, setReference] = useState('');
  const [bank, setBank] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0] ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      setMethod('Bank Transfer');
      setReference('');
      setBank('');
      setDate(new Date().toISOString().split('T')[0] ?? '');
      setErrors({});
    }
  }, [isOpen, disbursement]);

  if (!isOpen || !disbursement) return null;

  const validate = (): boolean => {
    const payload = {
      method: method.trim(),
      reference: reference.trim() || null,
      bank: bank.trim() || null,
      date,
      expectedVersion: disbursement.version ?? 1,
    };

    const result = approveDisbursementSchema.safeParse(payload);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (field) {
          fieldErrors[String(field)] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return false;
    }

    setErrors({});
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      await approveWithBlocking({
        id: disbursement.id,
        method: method.trim(),
        reference: reference.trim() || null,
        bank: bank.trim() || null,
        date,
        expectedVersion: disbursement.version,
      });
      onClose();
      if (onSuccess) onSuccess();
    } catch (err: unknown) {
      if (isConcurrencyConflictError(err)) {
        useBlockingModalStore.getState().close();
        onClose();
        if (onConflict) {
          onConflict(err);
          return;
        }
      }
      // Errors handled via BlockingActionModal / OCC modal
    }
  };

  const disbNumber =
    disbursement.disbursement_number ||
    disbursement.disbursementNumber ||
    `DISB-${disbursement.id.slice(0, 8)}`;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-md p-6 space-y-4"
        data-testid="admin-approval-modal"
      >
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <span>Admin Direct Approval & Release</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-600">
            Adjudicate and authorize disbursement{' '}
            <span className="font-mono font-semibold text-slate-800">
              {disbNumber}
            </span>
            . Saving payment details will directly transition this voucher to{' '}
            <strong className="text-purple-700">Released</strong> status.
          </DialogDescription>
        </DialogHeader>

        {/* Financial Summary Card */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-slate-500">Amount to Release:</span>
            <span className="font-bold text-slate-900 text-sm" data-testid="approval-amount">
              ₱{disbursement.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500">Fund Source:</span>
            <span className="font-semibold text-blue-700">
              {disbursement.fund_source || disbursement.fundSource}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500">Category:</span>
            <span className="font-medium text-slate-700">{disbursement.category}</span>
          </div>
          <div className="pt-1 border-t border-slate-200 text-slate-600 line-clamp-2">
            <span className="text-slate-400">Purpose: </span>
            {disbursement.description}
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3" data-testid="admin-approval-form">
          {/* Payment Method */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">
              Payment Method <span className="text-red-500">*</span>
            </label>
            <select
              value={method}
              onChange={(e) => {
                setMethod(e.target.value);
                if (errors.method) setErrors((prev) => ({ ...prev, method: '' }));
              }}
              className={`w-full text-xs p-2 border rounded-md bg-white border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                errors.method ? 'border-red-500' : ''
              }`}
              data-testid="select-payment-method"
            >
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Check">Check</option>
              <option value="Cash">Cash</option>
              <option value="GCash / Maya">GCash / Maya</option>
              <option value="Other">Other</option>
            </select>
            {errors.method && (
              <span className="text-[11px] text-red-600 block">{errors.method}</span>
            )}
          </div>

          {/* Reference Number */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">
              Payment Reference / Check Number (Optional)
            </label>
            <Input
              type="text"
              placeholder="e.g. TXN-884920 or CHK-00129"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="text-xs h-8"
              data-testid="input-payment-reference"
            />
          </div>

          {/* Bank */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">
              Bank / Institution (Optional)
            </label>
            <Input
              type="text"
              placeholder="e.g. BDO Unibank, BPI, Metrobank"
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              className="text-xs h-8"
              data-testid="input-payment-bank"
            />
          </div>

          {/* Date */}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-slate-700">
              Payment Date <span className="text-red-500">*</span>
            </label>
            <DateInput
              aria-label="Payment date"
              type="date"
              value={date}
              onValueChange={(val) => {
                setDate(val);
                if (errors.date) setErrors((prev) => ({ ...prev, date: '' }));
              }}
              className="text-xs h-8"
              data-testid="input-payment-date"
            />
            {errors.date && (
              <span className="text-[11px] text-red-600 block">{errors.date}</span>
            )}
          </div>

          <DialogFooter className="pt-2 gap-2 flex items-center justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs"
              data-testid="btn-cancel-approve"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              data-testid="btn-confirm-approve"
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Authorize & Release
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
