import { describe, it, expect } from 'vitest';
import {
  formatTin,
  formatRdoCode,
  formatContactValue,
  getContactPlaceholder,
  getContactMaxLength,
} from '../lib/formatters';

describe('Clients Module Formatters, Guards, and Input Locks', () => {
  describe('formatTin', () => {
    it('formats a 9-digit TIN correctly', () => {
      expect(formatTin('123456789')).toBe('123-456-789');
    });

    it('formats a 12-digit TIN correctly', () => {
      expect(formatTin('123456789000')).toBe('123-456-789-000');
    });

    it('formats an accurate 14-digit BIR TIN correctly (000-000-000-00000)', () => {
      expect(formatTin('12345678900000')).toBe('123-456-789-00000');
    });

    it('locks input to maximum 14 digits, discarding any extra characters', () => {
      const extraDigits = '12345678900000999999';
      expect(formatTin(extraDigits)).toBe('123-456-789-00000');
    });

    it('strips non-digit characters on input', () => {
      expect(formatTin('123abc456def789ghi00000')).toBe('123-456-789-00000');
    });

    it('handles backspacing through trailing hyphens smoothly', () => {
      // User is at '123-4' and hits backspace -> browser sets input to '123-'
      // formatTin strips the trailing hyphen and returns '123' without getting stuck
      expect(formatTin('123-', '123-4')).toBe('123');
      // Next backspace from '123' deletes '3' -> input becomes '12'
      expect(formatTin('12', '123')).toBe('12');
    });

    it('handles empty input gracefully', () => {
      expect(formatTin('')).toBe('');
    });
  });

  describe('formatRdoCode', () => {
    it('converts letters to uppercase and strips invalid characters', () => {
      expect(formatRdoCode('044a')).toBe('044A');
      expect(formatRdoCode('34-b')).toBe('34B');
    });

    it('locks input to maximum 4 characters', () => {
      expect(formatRdoCode('044ABCDE')).toBe('044A');
      expect(formatRdoCode('12345')).toBe('1234');
    });

    it('handles empty input gracefully', () => {
      expect(formatRdoCode('')).toBe('');
    });
  });

  describe('formatContactValue', () => {
    it('locks mobile numbers to exactly 11 digits and strips non-digits', () => {
      expect(formatContactValue('mobile', '0917-123-4567')).toBe('09171234567');
      expect(formatContactValue('mobile', '0917123456789999')).toBe('09171234567');
      expect(formatContactValue('mobile', '0917abc12345')).toBe('091712345');
    });

    it('locks phone and landline numbers to maximum 10 digits and strips non-digits', () => {
      expect(formatContactValue('landline', '(02) 8123-4567')).toBe('0281234567');
      expect(formatContactValue('phone', '02812345679999')).toBe('0281234567');
    });

    it('allows emails and other text up to 255 characters without stripping special chars', () => {
      const email = 'client.finance@example-domain.com.ph';
      expect(formatContactValue('email', email)).toBe(email);
      expect(formatContactValue('other', 'Viber: +63 917 123 4567')).toBe('Viber: +63 917 123 4567');
    });
  });

  describe('getContactPlaceholder & getContactMaxLength', () => {
    it('returns accurate placeholders per channel type', () => {
      expect(getContactPlaceholder('mobile')).toContain('11 digits');
      expect(getContactPlaceholder('landline')).toContain('7-10 digits');
      expect(getContactPlaceholder('email')).toContain('@');
    });

    it('returns accurate max length guards per channel type', () => {
      expect(getContactMaxLength('mobile')).toBe(11);
      expect(getContactMaxLength('landline')).toBe(10);
      expect(getContactMaxLength('phone')).toBe(10);
      expect(getContactMaxLength('email')).toBe(255);
    });
  });
});
