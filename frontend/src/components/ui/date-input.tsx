import { forwardRef, useEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { cn } from '@/lib/utils';

dayjs.extend(customParseFormat);

function parseDate(raw: string | undefined, format: string) {
  if (!raw) return null;
  const parsed = dayjs(raw, format, true);
  return parsed.isValid() ? parsed : null;
}

export interface DateInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'defaultValue' | 'onChange' | 'type' | 'min' | 'max' | 'size'
> {
  value: string | undefined;
  onValueChange: (value: string) => void;
  type?: 'date' | 'month';
  min?: string;
  max?: string;
  'data-testid'?: string;
}

/** Calendar-only values never pass through UTC or acquire a time component. */
export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
  {
    value,
    onValueChange,
    type = 'date',
    min,
    max,
    className,
    disabled,
    readOnly,
    required,
    autoFocus,
    name,
    id,
    ...inputProps
  },
  forwardedRef
) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const format = type === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD';
  // Retain invalid/incomplete edits locally so they cannot save stale parent values.
  const [draft, setDraft] = useState(() => parseDate(value, format));
  const invalidEdit = useRef(false);
  useEffect(() => {
    invalidEdit.current = false;
    setDraft(parseDate(value, format));
  }, [value, format]);
  useEffect(() => {
    // A report may replace clearing with today's date, even if its value did not change.
    if (invalidEdit.current) return;
    const accepted = parseDate(value, format);
    if (draft?.valueOf() !== accepted?.valueOf()) setDraft(accepted);
  }, [draft, value, format]);
  // Keep calendar portals inside Radix modal focus/dismiss boundaries.
  const portalContainer = () =>
    inputRef.current?.closest<HTMLElement>('[role="dialog"]') ?? document.body;

  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <DatePicker
        value={draft}
        onChange={(next, context) => {
          invalidEdit.current = context.validationError != null;
          setDraft(next);
          if (context.validationError == null) onValueChange(next ? next.format(format) : '');
        }}
        onError={(error) =>
          inputRef.current?.setCustomValidity(
            error ? 'Enter a valid date within the allowed range.' : ''
          )
        }
        format={format}
        views={type === 'month' ? ['year', 'month'] : ['year', 'month', 'day']}
        openTo={type === 'month' ? 'month' : 'day'}
        minDate={parseDate(min, format) ?? dayjs('2000-01-01').year(1)}
        maxDate={parseDate(max, format) ?? dayjs('9999-12-31', 'YYYY-MM-DD', true)}
        disabled={disabled}
        readOnly={readOnly}
        autoFocus={autoFocus}
        name={name}
        className={cn('h-9 w-full min-w-0 text-sm', className)}
        inputRef={(element: HTMLInputElement | null) => {
          inputRef.current = element;
          if (typeof forwardedRef === 'function') forwardedRef(element);
          else if (forwardedRef) forwardedRef.current = element;
        }}
        slotProps={{
          textField: {
            id,
            required,
            size: 'small',
            slotProps: {
              htmlInput: { ...inputProps, id, required },
              input: { 'aria-label': inputProps['aria-label'] },
            },
          },
          field: { clearable: !required },
          popper: { container: portalContainer, className: 'erp-date-picker-popup' },
          dialog: { container: portalContainer, className: 'erp-date-picker-popup' },
          actionBar: { actions: required ? ['cancel', 'accept'] : ['clear', 'cancel', 'accept'] },
        }}
        sx={{
          '& .MuiPickersInputBase-root': {
            height: '100%',
            minHeight: 28,
            fontSize: 'inherit',
            borderRadius: '6px',
            backgroundColor: 'white',
          },
          '& .MuiPickersOutlinedInput-notchedOutline': { borderColor: '#f0f0f5' },
          '& .MuiIconButton-root': { padding: '4px' },
          '& .MuiSvgIcon-root': { fontSize: '18px' },
        }}
      />
    </LocalizationProvider>
  );
});
