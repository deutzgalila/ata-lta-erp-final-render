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
          'h-9 w-full min-w-0 text-sm font-sans rounded-none',
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
                borderRadius: '0px',
                boxShadow: '4px 4px 0px #0A0A0A',
                border: '2px solid #0A0A0A',
                backgroundColor: '#FAF9F5',
              },
              '& *': {
                fontFamily: 'var(--font-sans) !important',
              },
              '& .MuiPickersCalendarHeader-root': {
                borderBottom: '1px solid #C8C5BC',
                backgroundColor: '#EAE8E3',
                margin: 0,
                padding: '8px 12px',
              },
              '& .MuiPickersCalendarHeader-label': {
                fontSize: '13px',
                fontWeight: 700,
                color: '#0A0A0A',
                fontFamily: 'var(--font-mono) !important',
                textTransform: 'uppercase',
              },
              '& .MuiDayCalendar-weekDayLabel': {
                fontSize: '12px',
                fontWeight: 600,
                color: '#4A4945',
                fontFamily: 'var(--font-mono) !important',
              },
              '& .MuiPickersDay-root': {
                fontSize: '13px',
                fontWeight: 400,
                color: '#0A0A0A',
                borderRadius: '0px',
                fontVariantNumeric: 'tabular-nums',
                '&:hover': {
                  backgroundColor: '#E4E2DC',
                },
                '&.Mui-selected': {
                  backgroundColor: '#0A0A0A !important',
                  color: '#FAF9F5 !important',
                  fontWeight: 700,
                  borderRadius: '0px',
                  '&:hover': {
                    backgroundColor: '#222220 !important',
                  },
                },
                '&.MuiPickersDay-today': {
                  borderColor: '#E61919',
                  borderWidth: '2px',
                  fontWeight: 700,
                },
              },
              '& .MuiMonthCalendar-root .MuiPickersMonth-monthButton, & .MuiYearCalendar-root .MuiPickersYear-yearButton': {
                fontSize: '13px',
                fontFamily: 'var(--font-sans)',
                borderRadius: '0px',
                '&.Mui-selected': {
                  backgroundColor: '#0A0A0A !important',
                  color: '#FAF9F5 !important',
                  fontWeight: 700,
                },
              },
              '& .MuiDialogActions-root': {
                borderTop: '1px solid #C8C5BC',
                backgroundColor: '#EAE8E3',
                padding: '8px 12px',
              },
              '& .MuiDialogActions-root button': {
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                fontWeight: 600,
                textTransform: 'uppercase',
                borderRadius: '0px',
                color: '#0A0A0A',
              },
            },
          },
          dialog: {
            container: portalContainer,
            className: 'erp-date-picker-popup font-sans',
            sx: {
              '& .MuiPaper-root': {
                fontFamily: 'var(--font-sans)',
                borderRadius: '0px',
                border: '2px solid #0A0A0A',
                boxShadow: '4px 4px 0px #0A0A0A',
                backgroundColor: '#FAF9F5',
              },
              '& *': {
                fontFamily: 'var(--font-sans) !important',
              },
              '& .MuiPickersDay-root.Mui-selected': {
                backgroundColor: '#0A0A0A !important',
                color: '#FAF9F5 !important',
                borderRadius: '0px',
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
            borderRadius: '0px',
            backgroundColor: '#FFFFFF',
            color: '#0A0A0A',
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
            fontFamily: 'var(--font-mono)',
            fontSize: 'inherit',
            fontVariantNumeric: 'tabular-nums',
          },
          '& .MuiPickersSectionList-sectionSeparator': {
            fontFamily: 'var(--font-sans)',
            fontSize: 'inherit',
            color: '#4A4945',
          },
          '& .MuiPickersOutlinedInput-notchedOutline': {
            borderColor: '#111111',
            borderRadius: '0px',
            transition: 'border-color 0.15s ease',
          },
          '&:hover .MuiPickersOutlinedInput-notchedOutline': {
            borderColor: '#0A0A0A',
          },
          '&.Mui-focused .MuiPickersOutlinedInput-notchedOutline, & .MuiPickersInputBase-root.Mui-focused .MuiPickersOutlinedInput-notchedOutline': {
            borderColor: '#E61919',
            borderWidth: '2px',
          },
          '& .MuiIconButton-root': {
            padding: '4px',
            borderRadius: '0px',
            color: '#4A4945',
            '&:hover': {
              color: '#0A0A0A',
              backgroundColor: '#E4E2DC',
            },
          },
          '& .MuiSvgIcon-root': { fontSize: '18px' },
        }}
      />
    </LocalizationProvider>
  );
});
