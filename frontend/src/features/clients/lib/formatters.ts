/**
 * Input formatters, guards, and locks for Clients Module (Parcel CLI / Module #8)
 *
 * Enforces BIR TIN standard (000-000-000-00000: 14 digits, 17 chars formatted),
 * RDO alphanumeric input lock (max 4 chars), and contact channel formats.
 */

import type { ContactDetailType } from '../api/types';

/**
 * Format and input-lock TIN to accurate BIR Philippine standard:
 * 14 digits (9 digits registration + 5 digits branch code).
 * Formatted with hyphens: XXX-XXX-XXX-XXXXX (17 characters max).
 * If the user has already entered 14 digits, no more digits are accepted.
 */
export function formatTin(newVal: string, prevVal = ''): string {
  let valToFormat = newVal;
  // If user hit backspace on a trailing hyphen, drop the preceding digit so backspace is seamless
  if (prevVal.length > newVal.length && newVal.endsWith('-')) {
    valToFormat = newVal.slice(0, -1);
  }

  const digits = valToFormat.replace(/\D/g, '').slice(0, 14);
  if (!digits) return '';
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}-${digits.slice(9, 14)}`;
}

/**
 * Format and input-lock RDO Code:
 * Up to 4 alphanumeric characters (e.g. 044, 047, 034A).
 * Input lock: max 4 characters, uppercase alphanumeric only.
 */
export function formatRdoCode(val: string): string {
  return val.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4);
}

/**
 * Format and input-lock contact detail values based on contact channel type.
 * - Mobile: 11 digits (e.g. 09123456789), input locked at 11 digits
 * - Phone / Landline: 7-10 digits, input locked at 10 digits
 * - Email / Other: max 255 chars
 */
export function formatContactValue(type: ContactDetailType, val: string): string {
  if (type === 'mobile') {
    return val.replace(/\D/g, '').slice(0, 11);
  }
  if (type === 'phone' || type === 'landline') {
    return val.replace(/\D/g, '').slice(0, 10);
  }
  return val.slice(0, 255);
}

/**
 * Placeholder for contact value based on channel type.
 */
export function getContactPlaceholder(type: ContactDetailType): string {
  switch (type) {
    case 'mobile':
      return 'e.g. 09123456789 (11 digits)';
    case 'phone':
    case 'landline':
      return 'e.g. 0281234567 (7-10 digits)';
    case 'email':
      return 'e.g. client@company.com';
    default:
      return 'Contact details...';
  }
}

/**
 * Max input length for contact value based on channel type.
 */
export function getContactMaxLength(type: ContactDetailType): number | undefined {
  switch (type) {
    case 'mobile':
      return 11;
    case 'phone':
    case 'landline':
      return 10;
    case 'email':
    case 'other':
      return 255;
    default:
      return undefined;
  }
}
