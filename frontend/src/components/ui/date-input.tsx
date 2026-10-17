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
        className={cn(
          'h-9 w-full min-w-0 text-sm font-sans',
          type === 'month' ? 'sm:min-w-[184px]' : 'sm:min-w-[176px]',
          className
        )}
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
          popper: {
            container: portalContainer,
            className: 'erp-date-picker-popup font-sans',
            sx: {
              '& .MuiPaper-root': {
                fontFamily: 'var(--font-sans)',
                borderRadius: '12px',
                boxShadow: '0 15px 35px rgba(0, 0, 0, 0.08), 0 5px 15px rgba(0, 0, 0, 0.04)',
                border: '1px solid #e2e8f0',
              },
              '& *': {
                fontFamily: 'var(--font-sans) !important',
              },
              '& .MuiPickersCalendarHeader-label': {
                fontSize: '14px',
                fontWeight: 600,
                color: '#1e293b',
              },
              '& .MuiDayCalendar-weekDayLabel': {
                fontSize: '12px',
                fontWeight: 500,
                color: '#64748b',
              },
              '& .MuiPickersDay-root': {
                fontSize: '13px',
                fontWeight: 400,
                color: '#1e293b',
                fontVariantNumeric: 'tabular-nums',
                '&:hover': {
                  backgroundColor: '#f1f5f9',
                },
                '&.Mui-selected': {
                  backgroundColor: '#2563eb !important',
                  color: '#ffffff !important',
                  fontWeight: 600,
                  '&:hover': {
                    backgroundColor: '#1d4ed8 !important',
                  },
                },
                '&.MuiPickersDay-today': {
                  borderColor: '#2563eb',
                  fontWeight: 600,
                },
              },
              '& .MuiMonthCalendar-root .MuiPickersMonth-monthButton, & .MuiYearCalendar-root .MuiPickersYear-yearButton': {
                fontSize: '13px',
                fontFamily: 'var(--font-sans)',
                '&.Mui-selected': {
                  backgroundColor: '#2563eb !important',
                  color: '#ffffff !important',
                  fontWeight: 600,
                },
              },
              '& .MuiDialogActions-root button': {
                fontFamily: 'var(--font-sans)',
                fontSize: '13px',
                fontWeight: 500,
                textTransform: 'none',
              },
            },
          },
          dialog: {
            container: portalContainer,
            className: 'erp-date-picker-popup font-sans',
            sx: {
              '& .MuiPaper-root': {
                fontFamily: 'var(--font-sans)',
                borderRadius: '12px',
              },
              '& *': {
                fontFamily: 'var(--font-sans) !important',
              },
              '& .MuiPickersDay-root.Mui-selected': {
                backgroundColor: '#2563eb !important',
                color: '#ffffff !important',
              },
            },
          },
          actionBar: { actions: required ? ['cancel', 'accept'] : ['clear', 'cancel', 'accept'] },
        }}
        sx={{
          height: '100%',
          '& .MuiPickersInputBase-root': {
            height: '100%',
            minHeight: 'inherit',
            fontFamily: 'var(--font-sans)',
            fontSize: 'inherit',
            borderRadius: '8px',
            backgroundColor: 'white',
            color: '#1e293b',
            boxSizing: 'border-box',
          },
          '& .MuiPickersSectionList-root': {
            fontFamily: 'var(--font-sans)',
            fontSize: 'inherit',
            letterSpacing: 'normal',
          },
          '& .MuiPickersSectionList-section': {
            fontFamily: 'var(--font-sans)',
            fontSize: 'inherit',
          },
          '& .MuiPickersSectionList-sectionContent': {
            fontFamily: 'var(--font-sans)',
            fontSize: 'inherit',
            fontVariantNumeric: 'tabular-nums',
          },
          '& .MuiPickersSectionList-sectionSeparator': {
            fontFamily: 'var(--font-sans)',
            fontSize: 'inherit',
            color: '#94a3b8',
          },
          '& .MuiPickersOutlinedInput-notchedOutline': {
            borderColor: '#e2e8f0',
            transition: 'border-color 0.15s ease',
          },
          '&:hover .MuiPickersOutlinedInput-notchedOutline': {
            borderColor: '#cbd5e1',
          },
          '&.Mui-focused .MuiPickersOutlinedInput-notchedOutline, & .MuiPickersInputBase-root.Mui-focused .MuiPickersOutlinedInput-notchedOutline': {
            borderColor: '#2563eb',
            borderWidth: '1.5px',
          },
          '& .MuiIconButton-root': {
            padding: '4px',
            color: '#64748b',
            '&:hover': {
              color: '#1e293b',
              backgroundColor: '#f1f5f9',
            },
          },
          '& .MuiSvgIcon-root': { fontSize: '18px' },
        }}
      />
    </LocalizationProvider>
  );
});
