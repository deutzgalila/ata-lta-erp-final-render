/**
 * Formatting and date utility helpers for reports feature.
 */

export function formatCurrency(amount: number | string | undefined | null): string {
  const num =
    typeof amount === 'number'
      ? isNaN(amount)
        ? 0
        : amount
      : parseFloat(String(amount || 0)) || 0;

  return `₱${num.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDate(dateStr: string | undefined | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export function formatDateIso(dateStr: string | undefined | null): string {
  if (!dateStr) return '—';
  return dateStr.slice(0, 10);
}

export function getTodayString(): string {
  // Manila date or ISO UTC date
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export function getCurrentMonthString(): string {
  return getTodayString().slice(0, 7);
}

/**
 * Computes Monday (start) and Sunday (end) of the week containing a date.
 * Parity implementation matching backend service.
 */
export function getWeekBounds(dateStr: string): { start: string; end: string } {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diffToMon);

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
}
