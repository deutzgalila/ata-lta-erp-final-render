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
          'h-9 w-full min-w-0 text-sm font-sans rounded-[6px]',
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
                borderRadius: '8px',
                boxShadow: 'var(--shadow-float)',
                border: '1px solid #CBD5E1',
                backgroundColor: '#FFFFFF',
                color: '#0F172A',
                overscrollBehavior: 'contain',
              },
              '& *': {
                fontFamily: 'var(--font-sans) !important',
              },
              '& .MuiPickersCalendarHeader-root': {
                borderBottom: '1px solid #CBD5E1',
                backgroundColor: '#F1F5F9',
                margin: 0,
                padding: '8px 12px',
              },
              '& .MuiPickersCalendarHeader-label': {
                fontSize: '13px',
                fontWeight: 600,
                color: '#0F172A',
                fontFamily: 'var(--font-sans) !important',
              },
              '& .MuiDayCalendar-weekDayLabel': {
                fontSize: '12px',
                fontWeight: 600,
                color: '#475569',
                fontFamily: 'var(--font-sans) !important',
              },
              '& .MuiPickersDay-root': {
                fontSize: '13px',
                fontWeight: 400,
                color: '#0F172A',
                borderRadius: '6px',
                fontVariantNumeric: 'tabular-nums',
                '&:hover': {
                  backgroundColor: '#F1F5F9',
                },
                '&.Mui-selected': {
                  backgroundColor: '#1D4ED8 !important',
                  color: '#FFFFFF !important',
                  fontWeight: 600,
                  borderRadius: '6px',
                  '&:hover': {
                    backgroundColor: '#1E40AF !important',
                  },
                },
                '&.MuiPickersDay-today': {
                  borderColor: '#1D4ED8',
                  borderWidth: '1px',
                  fontWeight: 600,
                },
              },
              '& .MuiMonthCalendar-root .MuiPickersMonth-monthButton, & .MuiYearCalendar-root .MuiPickersYear-yearButton': {
                fontSize: '13px',
                fontFamily: 'var(--font-sans)',
                borderRadius: '6px',
                '&.Mui-selected': {
                  backgroundColor: '#1D4ED8 !important',
                  color: '#FFFFFF !important',
                  fontWeight: 600,
                },
                '&:hover': {
                  backgroundColor: '#F1F5F9',
                },
              },
              '& .MuiDialogActions-root': {
                borderTop: '1px solid #CBD5E1',
                backgroundColor: '#F1F5F9',
                padding: '8px 12px',
              },
              '& .MuiDialogActions-root button': {
                fontFamily: 'var(--font-sans)',
                fontSize: '12px',
                fontWeight: 500,
                borderRadius: '6px',
                color: '#0F172A',
                '&:hover': {
                  backgroundColor: '#E2E8F0',
                },
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
                border: '1px solid #CBD5E1',
                boxShadow: 'var(--shadow-float)',
                backgroundColor: '#FFFFFF',
                color: '#0F172A',
                overscrollBehavior: 'contain',
              },
              '& *': {
                fontFamily: 'var(--font-sans) !important',
              },
              '& .MuiPickersDay-root.Mui-selected': {
                backgroundColor: '#1D4ED8 !important',
                color: '#FFFFFF !important',
                borderRadius: '6px',
              },
            },
          },
          actionBar: { actions: required ? ['cancel', 'accept'] : ['clear', 'cancel', 'accept'] },
        }}
        sx={{
          '& .MuiPickersInputBase-root': {
            height: '100%',
            minHeight: 0,
            fontFamily: 'var(--font-sans)',
            fontSize: 'inherit',
            lineHeight: 'inherit',
            borderRadius: '6px',
            backgroundColor: '#FFFFFF',
            color: '#0F172A',
            boxSizing: 'border-box',
            boxShadow: 'var(--shadow-soft)',
            paddingLeft: '12px',
            paddingRight: '6px',
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          },
          '& .MuiPickersSectionList-root, & .MuiPickersInputBase-sectionsContainer': {
            padding: 0,
            height: '100%',
            display: 'flex',
            alignItems: 'center',
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
            color: '#64748B',
          },
          '& .MuiPickersOutlinedInput-notchedOutline': {
            borderColor: '#64748B',
            borderRadius: '6px',
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          },
          '&:hover .MuiPickersOutlinedInput-notchedOutline': {
            borderColor: '#334155',
          },
          '&.Mui-focused .MuiPickersOutlinedInput-notchedOutline, & .MuiPickersInputBase-root.Mui-focused .MuiPickersOutlinedInput-notchedOutline': {
            borderColor: '#1D4ED8',
            borderWidth: '2px',
          },
          '&.Mui-error .MuiPickersOutlinedInput-notchedOutline, & .MuiPickersInputBase-root.Mui-error .MuiPickersOutlinedInput-notchedOutline': {
            borderColor: '#DC2626',
          },
          '&.Mui-disabled, & .MuiPickersInputBase-root.Mui-disabled': {
            cursor: 'not-allowed',
            opacity: 0.5,
            backgroundColor: '#F1F5F9',
          },
          '&.Mui-disabled .MuiPickersOutlinedInput-notchedOutline, & .MuiPickersInputBase-root.Mui-disabled .MuiPickersOutlinedInput-notchedOutline': {
            borderColor: '#CBD5E1',
          },
          '& .MuiInputAdornment-root': {
            height: '100%',
            maxHeight: 'none',
            margin: 0,
            marginRight: 0,
          },
          '& .MuiIconButton-root, & .MuiIconButton-edgeEnd': {
            margin: 0,
            marginRight: 0,
            padding: '4px',
            borderRadius: '4px',
            color: '#475569',
            '&:hover': {
              color: '#0F172A',
              backgroundColor: '#F1F5F9',
            },
          },
          '& .MuiSvgIcon-root': { fontSize: '18px' },
        }}
      />
    </LocalizationProvider>
  );
});
