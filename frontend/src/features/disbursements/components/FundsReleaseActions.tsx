import { DateInput } from '@/components/ui/date-input';
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
import { DollarSign, CheckCheck } from 'lucide-react';
import {
  useReleaseDisbursement,
  useFundDisbursement,
} from '../api/useDisbursements';
import { useSessionStore } from '@/lib/session';
import { hasPermission } from '@/lib/permissions';
import type { Disbursement, ReleasePaymentInput } from '../api/types';

export interface ReleaseFundsModalProps {
  isOpen: boolean;
  disbursement: Disbursement | null;
  onClose: () => void;
  onSuccess?: () => void;
}

export function ReleaseFundsModal({
  isOpen,
  disbursement,
  onClose,
  onSuccess,
}: ReleaseFundsModalProps) {
  const { releaseWithBlocking, isPending } = useReleaseDisbursement();

  const [method, setMethod] = useState('Bank Transfer');
  const [reference, setReference] = useState('');
  const [bank, setBank] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0] ?? '');

  const resetForm = () => {
    setMethod('Bank Transfer');
    setReference('');
    setBank('');
    setDate(new Date().toISOString().split('T')[0] ?? '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disbursement) return;

    const payload: ReleasePaymentInput = {
      method: method.trim() || undefined,
      reference: reference.trim() || null,
      bank: bank.trim() || null,
      date: date || undefined,
      expectedVersion: disbursement.version,
    };

    try {
      await releaseWithBlocking({
        id: disbursement.id,
        data: payload,
        expectedVersion: disbursement.version,
      });
      resetForm();
      onClose();
      if (onSuccess) onSuccess();
    } catch {
      // Handled via BlockingActionModal
    }
  };

  if (!disbursement) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="space-y-4 border-[#0A0A0A] border-2 p-6 shadow-[4px_4px_0px_#0A0A0A] rounded-none bg-[#FAF9F5] max-w-md"
        data-testid="release-funds-modal"
      >
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-[#0A0A0A]">
            Release Funds for Payment
          </DialogTitle>
          <DialogDescription className="text-xs text-[#4A4945]">
            Record payment details to transition disbursement{' '}
            <span className="font-mono font-semibold text-[#0A0A0A]">
              {disbursement.disbursement_number ||
                disbursement.disbursementNumber ||
                disbursement.id}
            </span>{' '}
            from Approved to Released.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3" data-testid="release-funds-form">
          <div className="p-3 bg-[#EAE8E3] border border-[#0A0A0A] rounded-none text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-[#4A4945]">Amount to Release:</span>
              <span className="font-bold text-[#0A0A0A]">
                ₱{disbursement.amount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#4A4945]">Fund Source:</span>
              <span className="font-semibold text-[#0A0A0A]">
                {disbursement.fund_source || disbursement.fundSource}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#0A0A0A]">Payment Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full text-xs p-2 border rounded-none bg-white border-[#0A0A0A] focus:outline-none focus:ring-1 focus:ring-blue-500"
              data-testid="select-release-method"
            >
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Check">Check</option>
              <option value="Cash">Cash</option>
              <option value="GCash / Maya">GCash / Maya</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#0A0A0A]">
              Payment Reference / Check Number
            </label>
            <Input
              type="text"
              placeholder="e.g. CHK-2026-9021 or Ref # 882910"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              data-testid="input-release-reference"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#0A0A0A]">Bank / Institution</label>
            <Input
              type="text"
              placeholder="e.g. BDO, BPI, Metrobank"
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              data-testid="input-release-bank"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-[#0A0A0A]">Release Date</label>
            <DateInput
              aria-label="Release date"
              type="date"
              value={date}
              onValueChange={(value) => setDate(value)}
              data-testid="input-release-date"
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
              data-testid="submit-release-funds-btn"
              className="text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white"
            >
              {isPending ? 'Processing...' : 'Confirm Release'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface FundsReleaseActionsProps {
  disbursement: Disbursement;
  onSuccess?: () => void;
}

export function FundsReleaseActions({
  disbursement,
  onSuccess,
}: FundsReleaseActionsProps) {
  const permissions = useSessionStore((state) => state.permissions);
  const canMarkReleased = hasPermission(permissions, 'disbursement:mark_released');

  const { fundWithBlocking } = useFundDisbursement();
  const [isReleaseModalOpen, setIsReleaseModalOpen] = useState(false);

  if (!canMarkReleased) {
    return null;
  }

  const handleFund = async () => {
    try {
      await fundWithBlocking(disbursement.id);
      if (onSuccess) onSuccess();
    } catch {
      // Handled via BlockingActionModal
    }
  };

  return (
    <div className="inline-flex items-center gap-1.5" data-testid="funds-release-actions">
      {disbursement.status === 'Approved' && (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsReleaseModalOpen(true)}
            className="text-xs h-7 text-purple-700 border-purple-200 hover:bg-purple-50"
            data-testid={`release-btn-${disbursement.id}`}
          >
            <DollarSign className="h-3.5 w-3.5 mr-1" />
            Release Funds
          </Button>
          <ReleaseFundsModal
            isOpen={isReleaseModalOpen}
            disbursement={disbursement}
            onClose={() => setIsReleaseModalOpen(false)}
            onSuccess={onSuccess}
          />
        </>
      )}

      {disbursement.status === 'Released' && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleFund}
          className="text-xs h-7 text-emerald-700 border-emerald-200 hover:bg-emerald-50"
          data-testid={`fund-btn-${disbursement.id}`}
        >
          <CheckCheck className="h-3.5 w-3.5 mr-1" />
          Mark Funded
        </Button>
      )}
    </div>
  );
}
