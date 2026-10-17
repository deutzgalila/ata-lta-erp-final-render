import { useState } from 'react';
import { CreditCard, AlertCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { recordPaymentSchema } from '../api/schemas';
import { recordPaymentAction } from '../api/useBillingMutations';
import { formatCurrency } from '../utils/formatters';
import type { Invoice } from '../api/types';

export interface RecordPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice | null;
  onPaymentRecorded?: () => void;
}

const PAYMENT_METHODS = [
  'Bank Transfer',
  'Check',
  'Cash',
  'Credit Card',
  'Other',
];

export function RecordPaymentModal({
  isOpen,
  onClose,
  invoice,
  onPaymentRecorded,
}: RecordPaymentModalProps) {
  const [amount, setAmount] = useState<string>('');
  const [method, setMethod] = useState<string>('Bank Transfer');
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  if (!invoice) return null;

  const currentBalance = Number(invoice.balance || 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setFormError('Payment amount must be greater than 0.');
      return;
    }

    if (parsedAmount > currentBalance) {
      setFormError(
        `Payment amount cannot exceed remaining balance of ${formatCurrency(currentBalance)}.`
      );
      return;
    }

    const payload = {
      amount: parsedAmount,
      method,
      reference: reference.trim() || null,
      date,
      notes: notes.trim() || null,
    };

    const validation = recordPaymentSchema.safeParse(payload);
    if (!validation.success) {
      setFormError(validation.error.errors[0]?.message || 'Invalid payment parameters.');
      return;
    }

    try {
      await recordPaymentAction(invoice.id, payload, invoice.entity_id);
      onClose();
      if (onPaymentRecorded) {
        onPaymentRecorded();
      }
    } catch {
      // Error is surfaced by BlockingActionModal
    }
  };

  const handlePayFullBalance = () => {
    setAmount(String(currentBalance));
    setFormError(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-md p-6 rounded-xl bg-white"
        data-testid="record-payment-modal"
      >
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-emerald-600" />
            <span>Record Payment</span>
          </DialogTitle>
          <p className="text-xs text-slate-500">
            Apply a payment receipt to invoice #{invoice.invoice_number}
          </p>
        </DialogHeader>

        {/* Invoice Summary Card */}
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs space-y-1.5">
          <div className="flex justify-between">
            <span className="text-slate-500">Client:</span>
            <span className="font-semibold text-slate-800">
              {invoice.clients?.name || 'N/A'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Total Invoice Amount:</span>
            <span className="font-mono text-slate-800">{formatCurrency(invoice.total)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Amount Paid So Far:</span>
            <span className="font-mono text-emerald-600">
              {formatCurrency(invoice.amount_paid || 0)}
            </span>
          </div>
          <div className="flex justify-between pt-1 border-t border-slate-200 font-bold">
            <span className="text-slate-700">Remaining Balance:</span>
            <span className="font-mono text-amber-600 text-sm" data-testid="remaining-balance-value">
              {formatCurrency(currentBalance)}
            </span>
          </div>
        </div>

        {formError && (
          <div
            className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-start gap-2"
            data-testid="payment-form-error"
          >
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate className="space-y-3.5">
          {/* Amount Field */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <label htmlFor="payment-amount" className="text-xs font-semibold text-slate-700">Payment Amount (₱)*</label>
              <button
                type="button"
                onClick={handlePayFullBalance}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
                data-testid="pay-full-balance-button"
              >
                Pay Full Balance
              </button>
            </div>
            <Input
              id="payment-amount"
              type="number"
              step="0.01"
              min="0.01"
              max={currentBalance}
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setFormError(null);
              }}
              placeholder="0.00"
              className="h-9 text-xs"
              required
              data-testid="payment-amount-input"
            />
          </div>

          {/* Payment Method */}
          <div>
            <label htmlFor="payment-method-select" className="text-xs font-semibold text-slate-700 block mb-1">Payment Method*</label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="payment-method-select" className="h-9 text-xs" data-testid="payment-method-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Payment Date */}
          <div>
            <label htmlFor="payment-date" className="text-xs font-semibold text-slate-700 block mb-1">Payment Date*</label>
            <Input
              id="payment-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-9 text-xs"
              required
              data-testid="payment-date-input"
            />
          </div>

          {/* Reference # */}
          <div>
            <label htmlFor="payment-reference" className="text-xs font-semibold text-slate-700 block mb-1">
              Reference # (e.g. Check #, Transaction ID)
            </label>
            <Input
              id="payment-reference"
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Optional check or transaction reference"
              className="h-9 text-xs"
              data-testid="payment-reference-input"
            />
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="payment-notes" className="text-xs font-semibold text-slate-700 block mb-1">Notes</label>
            <Input
              id="payment-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional payment notes"
              className="h-9 text-xs"
              data-testid="payment-notes-input"
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              className="text-xs cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs cursor-pointer"
              data-testid="submit-payment-button"
            >
              Submit Payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
