import { afterEach, describe, expect, it, vi } from 'vitest';
import { PRINT_PAGE_CSS, wrapPrintPage } from '@/lib/printPage';
import {
  buildStatementDocument,
  printStatementDocument,
  STATEMENT_CSS,
  type StatementPrintInvoice,
} from '@/lib/printDocuments';

const invoice: StatementPrintInvoice = {
  invoice_number: 'ATA-100',
  issue_date: '2026-10-19',
  total: 1500,
  clients: { name: 'Manila Trading', address: 'Manila' },
  line_items: [{ description: '<script>alert(1)</script>', amount: 1500 }],
  print_details: {
    notedBy: 'Reyes & Cruz',
    preparedBy: 'M. Santos',
    receivedBy: 'L. Tan',
    bankBranch: 'BDO Manila',
    cash: '',
    checkNumber: '1234',
  },
};
afterEach(() => vi.restoreAllMocks());
describe('Canonical statement rendering', () => {
  it.each(['ATA', 'LTA'])(
    'shows branding by default and removes name/logo when omitted (%s)',
    (entity) => {
      const branded = buildStatementDocument({ ...invoice, entity_code: entity });
      const plain = buildStatementDocument(
        { ...invoice, entity_code: entity },
        { includeCompanyDetails: false }
      );
      for (const html of [branded, plain]) {
        expect(html).not.toMatch(/Should you have any (?:enquiries|inquiries)/i);
        expect(html).toContain('THANK YOU !!!');
      }
      expect(branded).toContain(`${entity}-LOGO.jpg`);
      expect(plain).not.toContain('<img');
      expect(plain).not.toContain('BUSINESS CONSULTANCY');
      expect(plain).not.toContain('BUSINESS MANAGEMENT');
      expect(plain).toContain('STATEMENT');
      expect(plain).toContain('min-height:65px');
      expect(plain).toContain('Reyes &amp; Cruz');
      expect(plain).toContain('BDO Manila');
      expect(plain).toContain('M. Santos');
      expect(plain).toContain('L. Tan');
      expect(plain).toContain('&lt;script&gt;');
      expect(plain).not.toContain('<script>');
    }
  );
  it('preserves deliberately cleared snapshot values', () => {
    const html = buildStatementDocument({
      ...invoice,
      address: '',
      print_details: { clientName: '', notedBy: '' },
    });
    expect(html).not.toContain('Manila Trading');
    expect(html).not.toContain('HENRY WONG');
    expect(html).not.toContain('No address provided');
  });
  it('prints the same document with no browser header/footer space and padding on every page', () => {
    const write = vi.fn();
    vi.spyOn(window, 'open').mockReturnValue({
      document: { open: vi.fn(), write, close: vi.fn() },
      focus: vi.fn(),
      print: vi.fn(),
    } as unknown as Window);
    vi.spyOn(window, 'setTimeout').mockImplementation(
      () => 0 as unknown as ReturnType<typeof window.setTimeout>
    );
    printStatementDocument(invoice, { includeCompanyDetails: false });
    expect(write.mock.calls[0]![0]).toContain(
      wrapPrintPage(buildStatementDocument(invoice, { includeCompanyDetails: false }))
    );
    expect(write.mock.calls[0]![0]).toContain(STATEMENT_CSS + PRINT_PAGE_CSS);
    expect(PRINT_PAGE_CSS).toContain('@page { size: A4; margin: 0; }');
    expect(PRINT_PAGE_CSS).toContain('height: 15mm');
    expect(PRINT_PAGE_CSS).toContain('padding: 0 20mm');
  });
});
