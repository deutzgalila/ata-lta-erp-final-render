import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TransmittalPrintModal } from '../components/TransmittalPrintModal';
import type { Transmittal } from '../api/types';

const mockTransmittal: Transmittal = {
  id: 'tx-print-layout-01',
  tracking_number: 'TR-2026-PRINT-001',
  entity_id: 'ent-ata',
  entity_code: 'ATA',
  client_id: 'c-client-01',
  clients: {
    name: 'Megaworld Corporation',
    address: 'Alliance Global Tower, 36th Street, Uptown Bonifacio, Taguig City',
    tin: '123-456-789-000',
  },
  work_request_id: 'wr-1',
  linked_task_id: null,
  status: 'Draft',
  approved: true,
  board_order: 1,
  notes: 'Documents for BIR tax compliance filing.',
  recipient_name: 'Atty. Fernando Cruz',
  recipient_details: 'Chief Legal Counsel',
  received_by_name: null,
  sent_at: '2026-10-05T08:00:00.000Z',
  created_at: '2026-10-05T07:30:00.000Z',
  archived: false,
  version: 1,
  items: [
    {
      id: 'item-1',
      transmittal_id: 'tx-print-layout-01',
      description: 'BIR Form 1702-RT (Annual Income Tax Return)',
      document_type: 'Tax',
      quantity: 3,
      sort_order: 1,
    },
    {
      id: 'item-2',
      transmittal_id: 'tx-print-layout-01',
      description: 'Audited Financial Statements 2025',
      document_type: 'Financial',
      quantity: 1,
      sort_order: 2,
    },
  ],
};

describe('Transmittal Print Layout — Authentic Printable Document Verification', () => {
  let originalPrint: () => void;

  beforeEach(() => {
    originalPrint = window.print;
    window.print = vi.fn();
  });

  afterEach(() => {
    window.print = originalPrint;
  });

  it('renders document without horizontal centering (no mx-auto, left-aligned) and without top whitespace', () => {
    render(<TransmittalPrintModal transmittal={mockTransmittal} isOpen={true} onClose={vi.fn()} />);

    const printArea = screen.getByTestId('transmittal-print-modal').querySelector('#transmittal-print-area');
    expect(printArea).toBeInTheDocument();

    const className = printArea?.className || '';

    // Must NOT be horizontally centered with mx-auto
    expect(className).not.toContain('mx-auto');
    expect(className).toContain('text-left');
    expect(className).toContain('ml-0');
    expect(className).toContain('w-full');

    // Must NOT have large top padding (p-8 removed, pt-2 used for minimal header gap)
    expect(className).not.toContain('p-8');
    expect(className).toContain('pt-2');

    // Print specific overrides: flush to top-left, zero margin, full width
    expect(className).toContain('print:p-0');
    expect(className).toContain('print:m-0');
    expect(className).toContain('print:pt-0');
    expect(className).toContain('print:mt-0');
    expect(className).toContain('print:w-full');
    expect(className).toContain('print:max-w-none');
  });

  it('strips modal chrome on print: DialogContent neutralizes positioning, header/footer/buttons are hidden', () => {
    render(<TransmittalPrintModal transmittal={mockTransmittal} isOpen={true} onClose={vi.fn()} />);

    const modalDialog = screen.getByTestId('transmittal-print-modal');
    const modalClass = modalDialog.className;

    // DialogContent print overrides: static positioning, no transforms, no borders/shadows
    expect(modalClass).toContain('print:static');
    expect(modalClass).toContain('print:transform-none');
    expect(modalClass).toContain('print:border-none');
    expect(modalClass).toContain('print:shadow-none');
    expect(modalClass).toContain('print:overflow-visible');
    expect(modalClass).toContain('print:w-full');
    expect(modalClass).toContain('print:max-w-none');

    // Modal action buttons must be hidden in print mode
    const printBtn = screen.getByTestId('print-action-btn');
    expect(printBtn.className).toContain('print:hidden');

    const closeBtn = screen.getByTestId('print-close-btn');
    expect(closeBtn.className).toContain('print:hidden');
  });

  it('embeds dedicated @media print stylesheet for true print document isolation', () => {
    render(<TransmittalPrintModal transmittal={mockTransmittal} isOpen={true} onClose={vi.fn()} />);

    const modalDialog = screen.getByTestId('transmittal-print-modal');
    const styleEl = modalDialog.querySelector('style');
    expect(styleEl).toBeInTheDocument();

    const cssText = styleEl?.textContent || '';
    expect(cssText).toContain('@media print');
    expect(cssText).toContain('@page');
    expect(cssText).toContain('#root');
    expect(cssText).toContain('#transmittal-print-area');
    expect(cssText).toContain('margin-left: 0 !important');
    expect(cssText).toContain('padding-top: 0 !important');
    expect(cssText).toContain('width: 100% !important');
  });

  it('opens the prototype-verbatim print window when clicking Print Document button', () => {
    // Print output is generated in a fresh about:blank window (prototype parity);
    // the modal itself no longer calls in-page window.print().
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    render(<TransmittalPrintModal transmittal={mockTransmittal} isOpen={true} onClose={vi.fn()} />);

    const printBtn = screen.getByTestId('print-action-btn');
    fireEvent.click(printBtn);

    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith('', '_blank');
    openSpy.mockRestore();
  });

  it('renders official document header, FROM, TO, line items, and signature elements', () => {
    render(<TransmittalPrintModal transmittal={mockTransmittal} isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText('DOCUMENT TRANSMITTAL FORM')).toBeInTheDocument();
    expect(screen.getByTestId('print-tracking-number')).toHaveTextContent('TR-2026-PRINT-001');
    expect(screen.getByTestId('print-recipient-name')).toHaveTextContent('Atty. Fernando Cruz');
    expect(screen.getByTestId('print-client-name')).toHaveTextContent('(Megaworld Corporation)');

    // Table rows
    const itemsTable = screen.getByTestId('print-items-table');
    expect(itemsTable).toBeInTheDocument();
    expect(screen.getByTestId('print-item-row-0')).toBeInTheDocument();
    expect(screen.getByTestId('print-item-row-1')).toBeInTheDocument();

    // Signature label
    expect(screen.getByText('Signature over Printed name / Date Received')).toBeInTheDocument();
  });
});
