/**
 * Transmittal Print / PDF Preview Modal (UAT2-3)
 *
 * Verbatim 1:1 port of prototype transmittal preview layout (erp_prototype/js/transmittal.js),
 * omitting the prototype's 12-row filler loop to match backend PDF behavior (item-rows-only).
 * Features entity-aware date formatting, Manila company address, TO 4-line block,
 * boxed document table, centered signature block, and dynamic "RECEIVED" stamp on Acknowledged status.
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

  // Date formatting (Entity-aware: ATA = uppercase full month, LTA = M/D/YYYY)
  const formattedDate = (() => {
    const rawDate = transmittal.sent_at || transmittal.created_at || new Date().toISOString();
    const d = new Date(rawDate);
    if (isATA) {
      return d
        .toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
        .toUpperCase();
    }
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  })();

  const isAcknowledged = transmittal.status === 'Acknowledged';
  const acknowledgedDateFormatted = transmittal.acknowledged_at
    ? new Date(transmittal.acknowledged_at)
        .toLocaleDateString('en-US', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
        .toUpperCase()
    : '';

  // TO parsing per prototype lines 2848-2873
  const clientName = transmittal.clients?.name || '';
  const pocName = transmittal.recipient_name || '';
  const toLine1 = pocName || clientName || '';
  let toLine2 = '';
  if (pocName && clientName) {
    toLine2 = isATA ? `(${clientName})` : clientName;
  }

  const address = transmittal.clients?.address || '';
  let toLine3 = '';
  let toLine4 = '';
  if (address) {
    const firstComma = address.indexOf(',');
    if (firstComma !== -1) {
      toLine3 = address.slice(0, firstComma).trim();
      toLine4 = address.slice(firstComma + 1).trim();
    } else {
      toLine3 = address;
    }
  }

  // Acknowledgment info for signature block
  let sigName = '';
  let sigDate = '';
  if (isAcknowledged) {
    sigName = (transmittal.received_by_name || transmittal.recipient_name || '').toUpperCase();
    if (transmittal.acknowledged_at) {
      const dObj = new Date(transmittal.acknowledged_at);
      sigDate = `${dObj.getMonth() + 1}/${dObj.getDate()}/${String(dObj.getFullYear()).slice(-2)}`;
    }
  }

  // Item-rows-only: strictly map real items without filler rows
  const items = transmittal.items || [];

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-4xl max-h-[92vh] overflow-y-auto p-0 print:p-0 print:m-0 print:max-w-none print:max-h-none print:w-full print:static print:transform-none print:border-none print:shadow-none print:overflow-visible print:bg-white print:rounded-none"
        data-testid="transmittal-print-modal"
      >
        {/* Print Stylesheet: ensures document prints authentically without modal screenshot artifacts */}
        <style>{`
          @media print {
            @page {
              size: letter portrait;
              margin: 10mm 15mm;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              color: #000000 !important;
              width: 100% !important;
              height: auto !important;
              min-height: 0 !important;
              overflow: visible !important;
            }
            #root,
            body > *:not([data-radix-portal]) {
              display: none !important;
              visibility: hidden !important;
            }
            [data-radix-portal] {
              position: static !important;
              width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            [data-radix-portal] > [class*="fixed"][class*="inset-0"],
            [data-radix-portal] [data-state*="open"][class*="bg-black"],
            div[class*="backdrop-blur"] {
              display: none !important;
              visibility: hidden !important;
              background: transparent !important;
              opacity: 0 !important;
            }
            [data-testid="transmittal-print-modal"],
            [data-radix-portal] [role="dialog"] {
              position: static !important;
              inset: auto !important;
              top: 0 !important;
              left: 0 !important;
              transform: none !important;
              margin: 0 !important;
              padding: 0 !important;
              width: 100% !important;
              max-width: 100% !important;
              max-height: none !important;
              height: auto !important;
              box-shadow: none !important;
              border: none !important;
              border-radius: 0 !important;
              background: #ffffff !important;
              overflow: visible !important;
            }
            [data-testid="transmittal-print-modal"] > header,
            [data-testid="transmittal-print-modal"] > footer,
            [data-testid="transmittal-print-modal"] button,
            [data-testid="print-action-btn"],
            [data-testid="print-close-btn"],
            button[class*="absolute right-4 top-4"],
            .print\\:hidden {
              display: none !important;
              visibility: hidden !important;
            }
            #transmittal-print-area {
              display: block !important;
              visibility: visible !important;
              position: static !important;
              top: 0 !important;
              left: 0 !important;
              margin: 0 !important;
              margin-left: 0 !important;
              margin-right: 0 !important;
              margin-top: 0 !important;
              padding: 0 !important;
              padding-top: 0 !important;
              width: 100% !important;
              max-width: 100% !important;
              box-shadow: none !important;
              border: none !important;
            }
            #transmittal-print-area * {
              visibility: visible !important;
            }
            #transmittal-print-area table {
              width: 100% !important;
              border-collapse: collapse !important;
              page-break-inside: auto;
            }
            #transmittal-print-area tr {
              page-break-inside: avoid;
            }
          }
        `}</style>

        <DialogHeader className="p-4 border-b bg-slate-50 flex flex-row items-center justify-between print:hidden">
          <DialogTitle className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Printer className="h-4 w-4 text-blue-600" />
            Transmittal Letter Preview
          </DialogTitle>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={handlePrint}
              className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1 cursor-pointer print:hidden"
              data-testid="print-action-btn"
            >
              <Printer className="h-3.5 w-3.5" />
              Print Document
            </Button>
          </div>
        </DialogHeader>

        {/* Printable Document Sheet (Verbatim 1:1 Prototype Boxed Form) */}
        <div
          ref={printAreaRef}
          className="p-6 pt-2 bg-white text-black font-sans text-xs space-y-4 w-full box-border text-left m-0 ml-0 mr-auto print:p-0 print:m-0 print:pt-0 print:mt-0 print:w-full print:max-w-none print:space-y-4"
          id="transmittal-print-area"
        >
          {/* Header Box Table (preview-header-table) */}
          <table
            className="w-full border-2 border-black border-collapse mb-4 table-fixed"
            style={{ border: '2px solid #000' }}
          >
            <colgroup>
              <col style={{ width: '55%' }} />
              <col style={{ width: '45%' }} />
            </colgroup>
            <tbody>
              {/* Row 1: Title */}
              <tr>
                <td
                  colSpan={2}
                  className="border-2 border-black text-center font-bold text-[12pt] tracking-[0.5px] p-2 text-black"
                  style={{ border: '2px solid #000' }}
                >
                  DOCUMENT TRANSMITTAL FORM
                </td>
              </tr>

              {/* Row 2: Tracking Number & Date */}
              <tr>
                <td
                  className="border-2 border-black p-2.5 align-top break-words text-black"
                  style={{ width: '55%', border: '2px solid #000' }}
                >
                  <span className="text-[#c2272d] font-bold mr-1.5">TRANSMITTAL DOC NO.:</span>
                  <span className="font-bold font-mono" data-testid="print-tracking-number">
                    {transmittal.tracking_number}
                  </span>
                </td>
                <td
                  className="border-2 border-black p-2.5 align-top break-words text-black"
                  style={{ width: '45%', border: '2px solid #000' }}
                >
                  <span className="font-bold mr-1.5">DATE:</span>
                  <span className="font-bold">{formattedDate}</span>
                </td>
              </tr>

              {/* Row 3: FROM & TO */}
              <tr>
                <td
                  className="border-2 border-black p-2.5 align-top break-words leading-relaxed text-black"
                  style={{ width: '55%', border: '2px solid #000' }}
                >
                  <strong>FROM:</strong> <strong>{companyName}</strong>
                  <br />
                  {companyAddress}
                  <br />
                  <span className="text-[10px] font-mono text-slate-500">{companyTin}</span>
                </td>
                <td
                  className="border-2 border-black p-2.5 align-top break-words leading-relaxed text-black"
                  style={{ width: '45%', border: '2px solid #000' }}
                >
                  <div className="flex gap-2 items-start">
                    <strong className="mt-0.5">TO:</strong>
                    <div className="flex-1 flex flex-col">
                      <div
                        className="border-b-[1.5px] border-black min-h-[16px] mt-0.5 pb-0.5 font-bold text-black"
                        data-testid="print-recipient-name"
                      >
                        {toLine1}
                      </div>
                      <div
                        className="border-b-[1.5px] border-black min-h-[16px] mt-0.5 pb-0.5 font-bold text-black"
                        data-testid="print-client-name"
                      >
                        {toLine2}
                      </div>
                      <div className="border-b-[1.5px] border-black min-h-[16px] mt-0.5 pb-0.5 font-bold text-black">
                        {toLine3}
                      </div>
                      <div className="border-b-[1.5px] border-black min-h-[16px] mt-0.5 pb-0.5 font-bold text-black">
                        {toLine4}
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          {/* Document Box Container (preview-document-box) */}
          <div
            className="border-2 border-black relative mb-4 w-full box-border"
            style={{ border: '2px solid #000' }}
          >
            <div
              className="font-bold px-2.5 py-1.5 border-b-2 border-black bg-white text-[10pt] text-black"
              style={{ borderBottom: '2px solid #000' }}
            >
              Received the following documents and/or records:
            </div>

            {/* Document Table (preview-document-table) */}
            <table className="w-full border-collapse table-fixed" data-testid="print-items-table">
              <colgroup>
                <col style={{ width: '35%' }} />
                <col style={{ width: '65%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th
                    className="border-b-2 border-r-2 border-black px-2.5 py-1.5 font-bold text-left text-[10pt] text-black bg-white"
                    style={{
                      width: '35%',
                      borderBottom: '2px solid #000',
                      borderRight: '2px solid #000',
                    }}
                  >
                    CATEGORY
                  </th>
                  <th
                    className="border-b-2 border-black px-2.5 py-1.5 font-bold text-left text-[10pt] text-black bg-white"
                    style={{ width: '65%', borderBottom: '2px solid #000' }}
                  >
                    DOCUMENT
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr
                    key={item.id || `manifest-row-${idx}`}
                    className="h-[22px]"
                    data-testid={`print-item-row-${idx}`}
                  >
                    <td
                      className="px-2.5 py-1 text-[10pt] font-bold align-top break-words text-black border-r border-black"
                      style={{
                        width: '35%',
                        borderRight: '1px solid #000',
                        borderBottom: idx < items.length - 1 ? '1px solid #000' : 'none',
                      }}
                    >
                      {(item.document_type || item.documentType || 'Others').toUpperCase()}
                    </td>
                    <td
                      className="px-2.5 py-1 text-[10pt] align-top break-words text-black"
                      style={{
                        width: '65%',
                        borderBottom: idx < items.length - 1 ? '1px solid #000' : 'none',
                      }}
                    >
                      {(item.description || '').toUpperCase()}
                      {item.quantity && item.quantity > 1 ? ` (QTY: ${item.quantity})` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Dynamic "RECEIVED" Stamp */}
            {isAcknowledged && (
              <div
                className="absolute right-[12%] top-1/2 -translate-y-1/2 border-4 border-double border-blue-800 text-blue-900 px-3 py-1.5 text-center bg-white/95 rounded-xl font-mono font-bold pointer-events-none z-10"
                style={{ transform: 'translateY(-50%) rotate(-7deg)' }}
                data-testid="print-received-stamp"
              >
                <div className="text-base font-extrabold tracking-widest border-b-2 border-blue-800 pb-0.5 mb-1">
                  RECEIVED
                </div>
                {(transmittal.received_by_name || transmittal.recipient_name) && (
                  <div
                    className="text-[10px] font-bold uppercase"
                    data-testid="stamp-recipient-name"
                  >
                    {transmittal.received_by_name || transmittal.recipient_name}
                  </div>
                )}
                <div
                  className="text-[10px] text-blue-700 font-semibold"
                  data-testid="stamp-acknowledged-date"
                >
                  {acknowledgedDateFormatted || 'Date Recorded'}
                </div>
              </div>
            )}
          </div>

          {/* Notes (if any) */}
          {transmittal.notes && (
            <div className="my-2.5 italic text-[9.5pt] text-slate-600">
              Notes: {transmittal.notes}
            </div>
          )}

          {/* Centered Signature Box (preview-signature-container) */}
          <div className="mt-8 w-full max-w-[400px] mx-auto text-center">
            <div className="flex justify-between px-5 font-bold text-[11pt] min-h-[20px] text-black">
              <span className="flex-[2] text-center">{sigName}</span>
              <span className="flex-1 text-right">{sigDate}</span>
            </div>
            <div className="border-t-[1.5px] border-black mt-0.5" />
            <div className="text-[9pt] text-slate-600 mt-1.5">
              Signature over Printed name / Date Received
            </div>
          </div>
        </div>

        <DialogFooter className="p-3 border-t bg-slate-50 flex items-center justify-end print:hidden">
          <Button
            size="sm"
            variant="outline"
            onClick={onClose}
            className="h-8 text-xs cursor-pointer print:hidden"
            data-testid="print-close-btn"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
