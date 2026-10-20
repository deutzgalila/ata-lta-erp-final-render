import { PRINT_DETAIL_FIELDS } from '../utils/printDetailFields';
import { Input } from '@/components/ui/input';
import type { InvoicePrintDetails } from '@/lib/printDocuments';

export function InvoicePrintDetailsFields({
  value,
  onChange,
}: {
  value: InvoicePrintDetails;
  onChange: (value: InvoicePrintDetails) => void;
}) {
  return (
    <fieldset className="border-t border-[#E2E8F0] pt-3 space-y-3">
      <legend className="text-sm font-semibold">Statement details</legend>
      <p className="text-xs text-[#475569]">
        Payment details are printed on the statement. Record payments separately to update the
        payment ledger.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {PRINT_DETAIL_FIELDS.map(([key, label]) => (
          <label key={key} className="text-xs font-medium text-[#1E293B] space-y-1">
            <span>{label}</span>
            <Input
              aria-label={label}
              value={value[key] ?? ''}
              maxLength={500}
              onChange={(e) => onChange({ ...value, [key]: e.target.value })}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}
