/**
 * Transmittal Print / PDF Preview Modal
 *
 * Implements the item-rows-only fix (eliminates legacy 12 blank rows filler logic).
 * Features dynamic "RECEIVED" stamp when transmittal is acknowledged.
 */

import { useRef } from 'react';
import { Printer } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Transmittal } from '../api/types';

export interface TransmittalPrintModalProps {
  transmittal: Transmittal | null;
  isOpen: boolean;
  onClose: () => void;
}

export function TransmittalPrintModal({
  transmittal,
  isOpen,
  onClose,
}: TransmittalPrintModalProps) {
  const printAreaRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !transmittal) return null;

  const entityCode = transmittal.entity_code || 'ATA';
  const isATA = entityCode === 'ATA';

  const companyName = isATA
    ? 'ATA BUSINESS CONSULTANCY SERVICES'
    : 'LTA BUSINESS CONSULTANCY SERVICES';

  const companyAddress =
    'RM 307 Republic Supermarket Bldg, Soler St., cor. F.Torres St., Sta. Cruz, Manila';

  const companyTin = isATA ? 'TIN: 234-567-890-000' : 'TIN: 345-678-901-000';

  // Format date based on entity convention
  const formattedDate = (() => {
    const d = new Date(transmittal.created_at);
    if (isATA) {
      return d.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }
    // LTA MM/DD/YYYY
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  })();

  const isAcknowledged = transmittal.status === 'Acknowledged';
  const acknowledgedDateFormatted = transmittal.acknowledged_at
    ? new Date(transmittal.acknowledged_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  const items = transmittal.items || [];
  const TOTAL_MANIFEST_ROWS = 12;
  const manifestRows = Array.from({ length: TOTAL_MANIFEST_ROWS }, (_, idx) => items[idx] || null);

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-3xl max-h-[92vh] overflow-y-auto p-0"
        data-testid="transmittal-print-modal"
      >
        <DialogHeader className="p-4 border-b bg-slate-50 flex flex-row items-center justify-between">
          <DialogTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Printer className="h-4 w-4 text-blue-600" />
            Transmittal Letter Preview
          </DialogTitle>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handlePrint}
              className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1"
              data-testid="print-action-btn"
            >
              <Printer className="h-3.5 w-3.5" />
              Print Document
            </Button>
          </div>
        </DialogHeader>

        {/* Printable Document Sheet */}
        <div
          ref={printAreaRef}
          className="p-8 bg-white text-slate-900 font-sans text-xs space-y-6 print:p-0 print:m-0"
          id="transmittal-print-area"
        >
          {/* Company Letterhead */}
          <div className="text-center border-b pb-4 space-y-1">
            <h1 className="text-base font-bold tracking-tight text-slate-900 uppercase">
              {companyName}
            </h1>
            <p className="text-[11px] text-slate-600 max-w-lg mx-auto">
              {companyAddress}
            </p>
            <p className="text-[10px] text-slate-500 font-mono">{companyTin}</p>
          </div>

          {/* Letter Title & Manifest Meta */}
          <div className="flex items-start justify-between border-b pb-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-800">
                Document Transmittal Form
              </h2>
              <div className="text-xs text-slate-500 mt-1">
                Date: <span className="font-semibold text-slate-800">{formattedDate}</span>
              </div>
            </div>

            <div className="text-right">
              <div className="text-[11px] text-slate-500 uppercase font-semibold">
                Transmittal Tracking No.
              </div>
              <div className="font-mono font-bold text-sm text-blue-800" data-testid="print-tracking-number">
                {transmittal.tracking_number}
              </div>
            </div>
          </div>

          {/* TO / Recipient Section */}
          <div className="grid grid-cols-2 gap-4 p-3 bg-slate-50 rounded border border-slate-200">
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">
                Deliver To:
              </span>
              <div className="font-bold text-sm text-slate-900" data-testid="print-client-name">
                {transmittal.clients?.name || 'N/A'}
              </div>
              {transmittal.clients?.address && (
                <div className="text-xs text-slate-600">{transmittal.clients.address}</div>
              )}
            </div>

            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">
                Attention / Contact Person:
              </span>
              <div className="font-bold text-xs text-slate-900" data-testid="print-recipient-name">
                {transmittal.recipient_name || 'Authorized Representative'}
              </div>
              {transmittal.recipient_details && (
                <div className="text-xs text-slate-600">{transmittal.recipient_details}</div>
              )}
            </div>
          </div>

          {/* Document Line Items Table (12-Row Fixed Manifest Table per Prototype Parity) */}
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-700 uppercase">
              Enclosed Documents / Deliverables:
            </div>

            <table
              className="w-full border-collapse border border-slate-300 text-xs"
              data-testid="print-items-table"
            >
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-[11px] font-bold text-slate-700">
                  <th className="border border-slate-300 py-1.5 px-2 w-10 text-center">#</th>
                  <th className="border border-slate-300 py-1.5 px-3 w-36 text-left">Category</th>
                  <th className="border border-slate-300 py-1.5 px-3 text-left">Description</th>
                  <th className="border border-slate-300 py-1.5 px-2 w-16 text-center">Quantity</th>
                </tr>
              </thead>
              <tbody>
                {manifestRows.map((item, idx) => (
                  <tr
                    key={item?.id || `manifest-row-${idx}`}
                    className="border-b border-slate-200 h-6"
                    data-testid={`print-item-row-${idx}`}
                  >
                    <td className="border border-slate-300 py-1.5 px-2 text-center font-mono text-slate-500">
                      {idx + 1}
                    </td>
                    <td className="border border-slate-300 py-1.5 px-3 font-semibold text-slate-800">
                      {item ? (item.document_type || item.documentType || 'Others') : '\u00A0'}
                    </td>
                    <td className="border border-slate-300 py-1.5 px-3 text-slate-900">
                      {item ? item.description : '\u00A0'}
                    </td>
                    <td className="border border-slate-300 py-1.5 px-2 text-center font-mono font-bold text-slate-800">
                      {item ? item.quantity : '\u00A0'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Delivery Notes / Remarks */}
          {transmittal.notes && (
            <div className="p-3 border border-slate-200 rounded text-xs space-y-1 bg-slate-50">
              <span className="font-bold text-slate-700 uppercase text-[10px]">Remarks:</span>
              <p className="text-slate-600 italic whitespace-pre-wrap">{transmittal.notes}</p>
            </div>
          )}

          {/* Bottom Sign-off Section & Dynamic "RECEIVED" Stamp */}
          <div className="relative pt-6 border-t border-slate-200 mt-8 grid grid-cols-2 gap-12">
            {/* Sender Sign-off */}
            <div className="space-y-8">
              <div className="text-xs font-semibold text-slate-700">Transmitted By:</div>
              <div className="border-t border-slate-400 pt-1 text-center">
                <div className="font-bold text-xs uppercase">Authorized Documentation Officer</div>
                <div className="text-[10px] text-slate-500">{companyName}</div>
              </div>
            </div>

            {/* Recipient Acknowledgment Section */}
            <div className="relative space-y-8">
              <div className="text-xs font-semibold text-slate-700">Received By:</div>
              <div className="border-t border-slate-400 pt-1 text-center">
                <div className="font-bold text-xs">
                  {transmittal.recipient_name || 'Signature over Printed Name'}
                </div>
                <div className="text-[10px] text-slate-500">Date & Time Received</div>
              </div>

              {/* Dynamic RECEIVED Stamp */}
              {isAcknowledged && (
                <div
                  className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  data-testid="print-received-stamp"
                >
                  <div className="transform -rotate-12 border-4 border-double border-blue-800 text-blue-900 px-4 py-2 text-center rounded font-mono shadow-sm bg-white/90">
                    <div className="text-base font-extrabold tracking-widest">RECEIVED</div>
                    <div className="text-[10px] font-bold mt-0.5" data-testid="stamp-recipient-name">
                      {transmittal.recipient_name || 'Authorized Recipient'}
                    </div>
                    <div className="text-[9px] text-blue-700 font-semibold mt-0.5" data-testid="stamp-acknowledged-date">
                      {acknowledgedDateFormatted || 'Date Recorded'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="p-3 border-t bg-slate-50 flex items-center justify-end">
          <Button
            size="sm"
            variant="outline"
            onClick={onClose}
            className="h-8 text-xs"
            data-testid="print-close-btn"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
