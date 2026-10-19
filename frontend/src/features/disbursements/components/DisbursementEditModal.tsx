import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/date-input';
import { useSessionStore } from '@/lib/session';
import { apiRequest } from '@/lib/api';
import { useQueryClient } from '@tanstack/react-query';
import { useUpdateDisbursement } from '../api/useDisbursements';
import { disbursementKeys } from '../api/queryKeys';
import { isConcurrencyConflictError } from '@/components/common/ConflictResolutionModal';
import { useBlockingModalStore } from '@/features/operations/components/BlockingActionModal';
import {
  getDisbursementPrintDetails,
  type DisbursementPrintDetails,
} from '@/lib/disbursementDocument';
import type { Disbursement, FundSource } from '../api/types';

const printFields: Array<[keyof DisbursementPrintDetails, string]> = [
  ['requesterName', 'Printed requester name'],
  ['referenceNumber', 'Printed reference number'],
  ['submittedDate', 'Printed submission date'],
  ['workRequestName', 'Printed work request'],
  ['paymentDate', 'Printed payment date'],
  ['paymentMethod', 'Printed payment method'],
  ['paymentReference', 'Printed check / reference'],
  ['paymentBank', 'Printed bank / branch'],
  ['preparedBy', 'Prepared by'],
  ['approvedBy', 'Approved by'],
  ['releasedBy', 'Released by'],
];
export function DisbursementEditModal({
  disbursement,
  isOpen,
  onClose,
  inline = false,
}: {
  disbursement: Disbursement;
  isOpen: boolean;
  onClose: () => void;
  inline?: boolean;
}) {
  const isAdmin = useSessionStore((s) => s.user?.role === 'Admin');
  const { updateWithBlocking } = useUpdateDisbursement();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [fundSource, setFundSource] = useState<FundSource>('Firm Fund');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [printDetails, setPrintDetails] = useState<DisbursementPrintDetails>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    setCategory(disbursement.category);
    setDescription(disbursement.description);
    setAmount(String(disbursement.amount));
    setFundSource(disbursement.fund_source || disbursement.fundSource || 'Firm Fund');
    setDueDate((disbursement.due_date || disbursement.dueDate || '').slice(0, 10));
    setNotes(disbursement.notes || '');
    setPrintDetails(getDisbursementPrintDetails(disbursement));
    setError('');
    setConflict(false);
  }, [isOpen, disbursement]);
  if (!isOpen || !isAdmin) return null;
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const total = Math.round(Number(amount) * 100) / 100;
    if (
      !amount.trim() ||
      !Number.isFinite(total) ||
      total <= 0 ||
      !category.trim() ||
      !description.trim()
    ) {
      setError('Enter a category, description, and an amount greater than zero.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await updateWithBlocking({
        id: disbursement.id,
        data: {
          category: category.trim(),
          description: description.trim(),
          amount: total,
          fundSource,
          dueDate: dueDate || null,
          notes: notes.trim() || null,
          printDetails,
          expectedVersion: disbursement.version,
        },
      });
      onClose();
    } catch (err) {
      if (isConcurrencyConflictError(err)) {
        useBlockingModalStore.getState().close();
        setConflict(true);
        setError(
          'This voucher changed elsewhere. Your edits are preserved. Load the latest values before editing again.'
        );
      } else setError(err instanceof Error ? err.message : 'Unable to save the voucher.');
    } finally {
      setSaving(false);
    }
  };
  const loadLatest = async () => {
    try {
      const latest = await apiRequest<{ data: Disbursement }>(`/disbursements/${disbursement.id}`);
      queryClient.setQueryData(disbursementKeys.detail(disbursement.id), latest.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to refresh the voucher.');
    }
  };
  const title = `Edit Voucher ${disbursement.disbursement_number || disbursement.disbursementNumber || ''}`;
  const content = (
    <>
      {inline ? (
        <h3 className="text-base font-semibold">{title}</h3>
      ) : (
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
      )}
      <form onSubmit={save} className="space-y-4" noValidate>
        {error && (
          <div role="alert" className="text-sm text-red-700">
            {error}
            {conflict && (
              <Button type="button" variant="outline" size="sm" onClick={loadLatest}>
                Load latest values
              </Button>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm space-y-1">
            Category
            <Input
              aria-label="Category"
              value={category}
              maxLength={50}
              onChange={(e) => setCategory(e.target.value)}
            />
          </label>
          <label className="text-sm space-y-1">
            Amount (PHP)
            <Input
              aria-label="Amount (PHP)"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </label>
          <label className="text-sm space-y-1 sm:col-span-2">
            Description
            <textarea
              aria-label="Description"
              className="w-full border-[#E2E8F0] rounded-[6px] p-2"
              rows={3}
              maxLength={2000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="text-sm space-y-1">
            Fund source
            <select
              aria-label="Fund source"
              className="w-full border-[#E2E8F0] rounded-[6px] p-2"
              value={fundSource}
              onChange={(e) => setFundSource(e.target.value as FundSource)}
            >
              <option>Firm Fund</option>
              <option>Client Fund</option>
            </select>
          </label>
          <label className="text-sm space-y-1">
            Due date
            <DateInput aria-label="Due date" value={dueDate} onValueChange={setDueDate} />
          </label>
          <label className="text-sm space-y-1 sm:col-span-2">
            Notes
            <textarea
              aria-label="Notes"
              className="w-full border-[#E2E8F0] rounded-[6px] p-2"
              rows={2}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
        </div>
        <fieldset className="border-t border-[#E2E8F0] pt-3 space-y-3">
          <legend className="text-sm font-semibold">Printed voucher details</legend>
          <p className="text-xs text-[#475569]">
            These values appear on the document. Use Edit Payment Details to correct the recorded
            payment.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {printFields.map(([key, label]) => (
              <label key={key} className="text-sm space-y-1">
                {label}
                <Input
                  aria-label={label}
                  value={printDetails[key] ?? ''}
                  maxLength={500}
                  onChange={(e) => setPrintDetails({ ...printDetails, [key]: e.target.value })}
                />
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || conflict} data-testid="save-disbursement-edit">
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </>
  );
  return inline ? (
    <section
      className="bg-white border-[#E2E8F0] rounded-[6px] p-4 space-y-3"
      data-testid="disbursement-inline-editor"
    >
      {content}
    </section>
  ) : (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        data-testid="disbursement-edit-modal"
      >
        {content}
      </DialogContent>
    </Dialog>
  );
}
