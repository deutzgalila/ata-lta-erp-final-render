import { useState, useEffect } from 'react';
import {
  Printer,
  Download,
  Lock,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useInvoiceDetail } from '../api/useInvoices';
import { updateClientAddressAction, fetchInvoicePdfUrl } from '../api/useBillingMutations';
import { usePermission } from '@/lib/permissions';
import { printStatementDocument } from '@/lib/printDocuments';
import { formatCurrency, getStatusBadgeVariant } from '../utils/formatters';
import type { Invoice } from '../api/types';

export interface PrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceId?: string | null;
  initialInvoice?: Invoice | null;
}

export function PrintPreviewModal({
  isOpen,
  onClose,
  invoiceId,
  initialInvoice,
}: PrintPreviewModalProps) {
  const effectiveId = invoiceId || initialInvoice?.id;
  const { data: fetchedInvoice, refetch } = useInvoiceDetail(effectiveId, {
    enabled: isOpen && !!effectiveId,
  });

  const invoice = fetchedInvoice || initialInvoice;

  // Field-level address editing state
  const canEditAddress = usePermission('billing:edit_client_address');
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [addressInput, setAddressInput] = useState('');
  const [addressSuccessMessage, setAddressSuccessMessage] = useState<string | null>(null);

  // Sync address input when invoice changes
  useEffect(() => {
    if (invoice) {
      setAddressInput(invoice.address || invoice.clients?.address || '');
    }
    setIsEditingAddress(false);
    setAddressSuccessMessage(null);
  }, [invoice]);

  if (!invoice) return null;

  const currentAddress = invoice.address || invoice.clients?.address || 'No address provided';
  const entityCode = invoice.entity_code || 'ATA';
  const entityTagline = 'Certified Public Accountants & Management Consultants';

  const handleSaveAddress = async () => {
    if (!invoice.id) return;
    try {
      await updateClientAddressAction(
        invoice.id,
        addressInput,
        invoice.version,
        invoice.entity_id
      );
      setAddressSuccessMessage(
        'Updated invoice snapshot address only. Master client record remains unchanged.'
      );
      setIsEditingAddress(false);
      refetch();
    } catch {
      // Error is caught and handled in BlockingActionModal
    }
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handlePrint = () => {
    // Print via a fresh window containing the prototype-verbatim statement
    // layout (erp_prototype/js/billing.js generateInvoice) — Chromium output
    // matches the legacy document 1:1, independent of the in-app modal CSS.
    printStatementDocument(invoice);
  };

  const handleDownloadPdf = async () => {
    try {
      const url = await fetchInvoicePdfUrl(invoice.id);
      if (url) {
        window.open(url, '_blank');
      }
    } catch {
      // Error handled by BlockingActionModal / toast
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-w-4xl max-h-[92vh] overflow-y-auto p-0 rounded-xl bg-slate-100 print:p-0 print:m-0 print:max-w-none print:max-h-none print:w-full print:static print:transform-none print:border-none print:shadow-none print:overflow-visible print:bg-white print:rounded-none"
        data-testid="print-preview-modal"
      >
        {/* Dedicated Print Stylesheet: authentic prototype print fidelity */}
        <style>{`
          @media print {
            @page {
              size: A4 portrait;
              margin: 15mm 20mm;
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
              font-family: 'Segoe UI', Arial, sans-serif !important;
              font-size: 11pt !important;
              line-height: 1.5 !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            #root,
            [data-state*="open"][class*="fixed"][class*="inset-0"],
            div[class*="backdrop-blur"],
            body > *:not([role="dialog"]):not([data-testid*="modal"]),
            [data-testid="print-preview-modal"] > header,
            [data-testid="print-preview-modal"] > footer,
            [data-testid="print-preview-modal"] button,
            [data-testid="download-pdf-button"],
            [data-testid="print-document-button"],
            button,
            .print\\:hidden {
              display: none !important;
              visibility: hidden !important;
            }
            [data-testid="print-preview-modal"],
            [role="dialog"] {
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
            [data-testid="print-preview-modal"] > div.p-6,
            div:has(> [data-testid="a4-document-sheet"]) {
              padding: 0 !important;
              margin: 0 !important;
              display: block !important;
            }
            [data-testid="a4-document-sheet"] {
              position: static !important;
              width: 100% !important;
              max-width: 210mm !important;
              min-height: 0 !important;
              margin: 0 auto !important;
              padding: 0 !important;
              box-shadow: none !important;
              border: none !important;
              border-radius: 0 !important;
              background: #ffffff !important;
            }
            [data-testid="a4-document-sheet"] * {
              visibility: visible !important;
            }
            .slanted-block-lta {
              background-color: #1e293b !important;
              color: #ffffff !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .logo-banner-lta {
              background-color: #007cc0 !important;
              color: #ffffff !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .details-table td,
            .items-table td,
            .items-table th,
            .col-bill-to,
            .payment-details-box,
            .total-table td {
              border-color: #000000 !important;
            }
            .header-container-ata,
            .header-container-lta,
            .two-col,
            .items-table,
            .bottom-container,
            .signature-row,
            .footer-container {
              page-break-inside: avoid;
            }
          }
        `}</style>

        <DialogHeader className="p-4 bg-white border-b border-slate-200 sticky top-0 z-10 flex flex-row items-center justify-between print:hidden">
          <div>
            <DialogTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Printer className="w-4 h-4 text-blue-600" />
              <span>Print Document Preview</span>
              <Badge variant="outline" className="text-xs">
                {invoice.invoice_number}
              </Badge>
            </DialogTitle>
            <p className="text-xs text-slate-500">
              On-screen rendering of official document layout. Click &quot;Print Document&quot; to print.
            </p>
          </div>

          <div className="flex items-center gap-2 pr-8">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPdf}
              className="text-xs h-8 gap-1.5 cursor-pointer"
              data-testid="download-pdf-button"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PDF</span>
            </Button>
            <Button
              onClick={handlePrint}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-8 gap-1.5 shadow-xs cursor-pointer"
              data-testid="print-document-button"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Document</span>
            </Button>
          </div>
        </DialogHeader>

        {/* Success Banner if address updated */}
        {addressSuccessMessage && (
          <div
            className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-xs text-emerald-800 print:hidden"
            data-testid="address-update-success-banner"
          >
            <span>{addressSuccessMessage}</span>
            <button
              type="button"
              onClick={() => setAddressSuccessMessage(null)}
              className="text-emerald-600 hover:text-emerald-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* A4 Sheet Container */}
        <div className="p-6 flex justify-center print:p-0 print:m-0 print:block">
          <div
            className="w-full max-w-[210mm] min-h-[297mm] bg-white text-slate-900 p-10 shadow-lg rounded-sm border border-slate-200 flex flex-col justify-between print:p-0 print:m-0 print:border-none print:shadow-none print:min-h-0 print:rounded-none"
            data-testid="a4-document-sheet"
          >
            <div>
              {/* 1. Header & Entity Branding (Prototype Parity) */}
              {entityCode === 'ATA' ? (
                <div>
                  <div className="header-container-ata flex justify-between items-center mb-1">
                    <div className="logo-area-ata flex items-center bg-gradient-to-r from-sky-100 via-sky-100 to-transparent py-1.5 px-4 rounded-l-full w-[70%]">
                      <div className="logo-oval-ata w-[110px] h-[65px] bg-[#00A3E0] rounded-[50%/50%] flex justify-center items-center overflow-hidden mr-4 shrink-0 shadow-xs">
                        <img
                          src="/ERP_Assets/ATA-LOGO.jpg"
                          alt="ATA Logo"
                          className="w-[90%] h-[90%] object-contain"
                          onError={(e) => {
                            (e.currentTarget as HTMLElement).style.display = 'none';
                          }}
                        />
                        <span className="text-white font-black text-2xl tracking-wider font-sans sr-only">ATA</span>
                      </div>
                      <div>
                        <div className="company-name-ata text-base font-extrabold text-[#002D62] tracking-wide font-sans">
                          A.T.A. BUSINESS CONSULTANCY
                        </div>
                        <div className="text-[11px] text-slate-700 font-medium">
                          Amaya Tan & Associates
                        </div>
                        <div className="text-[10px] text-slate-500 print:hidden">
                          {entityTagline} • Metro Manila, Philippines
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="statement-title-ata text-3xl font-extrabold tracking-widest text-slate-950">
                        STATEMENT
                      </div>
                      <p className="text-xs font-semibold text-slate-800 mt-1">
                        No: <span className="font-mono">{invoice.invoice_number}</span>
                      </p>
                    </div>
                  </div>
                  <div className="header-divider-ata border-b-2 border-black mb-5" />
                </div>
              ) : (
                <div className="header-container-lta flex items-stretch h-[60px] mb-5 border-b-2 border-black pb-1.5">
                  <div className="logo-banner-lta flex items-center bg-[#007cc0] text-white px-4 flex-1">
                    <img
                      src="/ERP_Assets/LTA-LOGO.jpg"
                      alt="LTA Logo"
                      className="logo-img-lta h-10 w-10 rounded-xl bg-white p-0.5 mr-3 object-contain shrink-0"
                      onError={(e) => {
                        (e.currentTarget as HTMLElement).style.display = 'none';
                      }}
                    />
                    <span className="company-name-lta text-[13pt] font-bold tracking-wide">
                      LTA BUSINESS MANAGEMENT CORP
                    </span>
                  </div>
                  <div
                    className="slanted-block-lta bg-[#1e293b] text-white flex items-center px-6 text-[13pt] font-bold -ml-4"
                    style={{ clipPath: 'polygon(15px 0, 100% 0, 100% 100%, 0 100%)' }}
                  >
                    STATEMENT
                  </div>
                </div>
              )}

              {/* 2. Metadata Grid: Bill To Box & Details Table */}
              <div className="two-col flex justify-between gap-6 mb-6 text-xs">
                {/* Bill To Box (1.5px solid border) */}
                <div
                  className="col-bill-to w-[55%] border-[1.5px] border-black p-3.5 bg-white space-y-2"
                  data-testid="bill-to-box"
                >
                  <div className="flex items-center justify-between border-b border-black pb-1 mb-1">
                    <span className="bill-to-title font-bold text-[11px] text-slate-900 uppercase tracking-wider">
                      {entityCode === 'ATA' ? 'BILL TO' : 'BILL TO:'}
                    </span>
                    {canEditAddress ? (
                      !isEditingAddress && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingAddress(true);
                            setAddressInput(currentAddress);
                          }}
                          className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer print:hidden"
                          data-testid="edit-client-address-button"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Edit Address</span>
                        </button>
                      )
                    ) : (
                      <span
                        className="text-[10px] text-slate-400 flex items-center gap-1 print:hidden"
                        title="billing:edit_client_address permission required"
                        data-testid="address-locked-indicator"
                      >
                        <Lock className="w-3 h-3" />
                        <span>Address Locked</span>
                      </span>
                    )}
                  </div>

                  <p className="font-bold text-slate-900 text-sm">
                    {invoice.clients?.name || 'Client Name Unavailable'}
                  </p>
                  {(invoice.clients as unknown as { trade_name?: string })?.trade_name && (
                    <p className="text-slate-800 text-xs">
                      {entityCode === 'ATA'
                        ? `(${(invoice.clients as unknown as { trade_name?: string }).trade_name})`
                        : (invoice.clients as unknown as { trade_name?: string }).trade_name}
                    </p>
                  )}

                  {/* Address Section with Field-Level Security Inline Edit */}
                  <div className="pt-1">
                    {isEditingAddress ? (
                      <div className="space-y-2 print:hidden" data-testid="inline-address-editor">
                        <Input
                          value={addressInput}
                          onChange={(e) => setAddressInput(e.target.value)}
                          placeholder="Enter snapshot address..."
                          className="h-8 text-xs bg-white"
                          data-testid="address-input"
                        />
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            onClick={handleSaveAddress}
                            className="h-6 text-[11px] bg-blue-600 hover:bg-blue-700 text-white px-2 cursor-pointer"
                            data-testid="save-address-button"
                          >
                            <Check className="w-3 h-3 mr-1" />
                            Save Snapshot
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setIsEditingAddress(false)}
                            className="h-6 text-[11px] text-slate-600 px-2 cursor-pointer"
                            data-testid="cancel-address-button"
                          >
                            <X className="w-3 h-3 mr-1" />
                            Cancel
                          </Button>
                        </div>
                        <p className="text-[10px] text-slate-500 italic">
                          Updates invoice snapshot address only. Master client record remains unchanged.
                        </p>
                      </div>
                    ) : (
                      <p
                        className="text-slate-800 text-xs leading-relaxed"
                        data-testid="client-address-display"
                      >
                        {currentAddress}
                      </p>
                    )}
                  </div>

                  {invoice.clients?.tin && (
                    <p className="text-slate-700 font-mono text-[11px]">
                      TIN: {invoice.clients.tin}
                    </p>
                  )}
                </div>

                {/* Invoice Details Table (1.5px solid border) */}
                <div className="col-details w-[40%] flex justify-end">
                  <table className="details-table w-full border-collapse border-[1.5px] border-black text-xs">
                    <tbody>
                      <tr>
                        <td className="details-label font-bold bg-slate-50 p-2 border border-black w-[55%] text-slate-800">
                          STATEMENT NUMBER
                        </td>
                        <td className="details-value text-right font-mono font-semibold p-2 border border-black text-slate-900">
                          {invoice.invoice_number}
                        </td>
                      </tr>
                      <tr>
                        <td className="details-label font-bold bg-slate-50 p-2 border border-black text-slate-800">
                          STATEMENT DATE
                        </td>
                        <td className="details-value text-right font-mono p-2 border border-black text-slate-900">
                          {formatDate(invoice.issue_date)}
                        </td>
                      </tr>
                      <tr className="print:hidden">
                        <td className="details-label font-bold bg-slate-50 p-2 border border-black text-slate-800">
                          PAYMENT DUE
                        </td>
                        <td className="details-value text-right font-mono p-2 border border-black text-slate-900">
                          {formatDate(invoice.due_date)}
                        </td>
                      </tr>
                      <tr className="print:hidden">
                        <td className="details-label font-bold bg-slate-50 p-2 border border-black text-slate-800">
                          STATUS
                        </td>
                        <td className="details-value text-right p-2 border border-black">
                          <span
                            className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold border ${getStatusBadgeVariant(
                              invoice.status
                            )}`}
                          >
                            {invoice.status}
                          </span>
                        </td>
                      </tr>
                      {invoice.terms && (
                        <tr className="print:hidden">
                          <td className="details-label font-bold bg-slate-50 p-2 border border-black text-slate-800">
                            TERMS
                          </td>
                          <td className="details-value text-right p-2 border border-black text-[11px] text-slate-700">
                            {invoice.terms}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 3. Items Table (1.5px solid border, uppercase headers) */}
              <div className="mb-6">
                <table className="items-table w-full text-xs border-collapse border-[1.5px] border-black" data-testid="line-items-table">
                  <thead>
                    <tr className="bg-slate-50 border-b border-black text-slate-900">
                      <th className="border border-black py-2 px-3 text-left font-bold uppercase text-[9pt] w-[15%]">
                        DATE
                      </th>
                      <th className={`border border-black py-2 px-3 text-left font-bold uppercase text-[9pt] ${entityCode === 'ATA' ? 'w-[65%]' : 'w-[55%]'}`}>
                        DESCRIPTION
                      </th>
                      {entityCode !== 'ATA' && (
                        <th className="border border-black py-2 px-3 w-[10%]" />
                      )}
                      <th className="border border-black py-2 px-3 text-right font-bold uppercase text-[9pt] w-[20%]">
                        AMOUNT DUE
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-black text-slate-900">
                      <td className="border border-black py-2 px-3" />
                      <td className="border border-black py-2 px-3 font-bold text-right text-slate-900">
                        BALANCE FORWARD:
                      </td>
                      {entityCode !== 'ATA' && <td className="border border-black py-2 px-3" />}
                      <td className="border border-black py-2 px-3" />
                    </tr>
                    {(invoice.line_items || []).map((item, idx) => (
                      <tr
                        key={item.id || idx}
                        className="border-b border-black text-slate-900"
                      >
                        <td className="border border-black py-2 px-3 font-mono text-slate-800">
                          {idx === 0 ? formatDate(invoice.issue_date) : ''}
                        </td>
                        <td className="border border-black py-2 px-3 font-medium">{item.description}</td>
                        {entityCode !== 'ATA' && <td className="border border-black py-2 px-3" />}
                        <td className="border border-black py-2 px-3 text-right font-mono font-semibold num">
                          {formatCurrency(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 4. Bottom Layout: Payment Details Grid & Double-Border Totals */}
              <div className="bottom-container flex justify-between gap-6 items-start mb-6">
                {/* Payment Details Box (1.5px solid border) */}
                <div className="payment-details-box border-[1.5px] border-black p-3.5 w-[45%] text-xs space-y-2 bg-white">
                  <div className="payment-details-title font-bold text-slate-900 uppercase border-b border-black pb-1 mb-2">
                    PAYMENT DETAILS:
                  </div>
                  <div className="payment-details-row flex items-baseline gap-2 text-[11px]">
                    <span className="font-semibold text-slate-700 min-w-[100px] whitespace-nowrap">DATE:</span>
                    <span className="fill-line border-b border-dotted border-black flex-1 min-h-[16px] font-mono px-1 font-bold">
                      {invoice.payments && invoice.payments.length > 0
                        ? formatDate(invoice.payments[0]?.payment_date)
                        : ''}
                    </span>
                  </div>
                  <div className="payment-details-row flex items-baseline gap-2 text-[11px]">
                    <span className="font-semibold text-slate-700 min-w-[100px] whitespace-nowrap">CASH:</span>
                    <span className="fill-line border-b border-dotted border-black flex-1 min-h-[16px] font-mono px-1 font-bold">
                      {invoice.payments && invoice.payments.length > 0 && invoice.payments[0]?.payment_method === 'Cash'
                        ? formatCurrency(invoice.payments[0]?.amount)
                        : ''}
                    </span>
                  </div>
                  <div className="payment-details-row flex items-baseline gap-2 text-[11px]">
                    <span className="font-semibold text-slate-700 min-w-[100px] whitespace-nowrap">DATE/CHECK NO.:</span>
                    <span className="fill-line border-b border-dotted border-black flex-1 min-h-[16px] font-mono px-1 font-bold">
                      {invoice.payments && invoice.payments.length > 0
                        ? invoice.payments[0]?.reference_number || ''
                        : ''}
                    </span>
                  </div>
                  <div className="payment-details-row flex items-baseline gap-2 text-[11px]">
                    <span className="font-semibold text-slate-700 min-w-[100px] whitespace-nowrap">BANK/BRANCH:</span>
                    <span className="fill-line border-b border-dotted border-black flex-1 min-h-[16px] px-1 font-bold">
                      {invoice.payments && invoice.payments.length > 0
                        ? invoice.payments[0]?.payment_method || ''
                        : ''}
                    </span>
                  </div>
                </div>

                {/* Total Table (2px double border) */}
                <div className="total-box-container w-[50%] flex justify-end">
                  <table className="total-table w-full border-collapse border-2 border-double border-black text-xs">
                    <tbody>
                      <tr>
                        <td className="total-label bg-slate-50 p-2.5 font-bold border border-black text-slate-800 w-[50%] text-[11pt]">
                          TOTAL AMOUNT DUE
                        </td>
                        <td className="total-currency text-center font-bold p-2.5 border border-black w-[15%] text-slate-700 text-[11pt]">
                          PHP
                        </td>
                        <td className="total-value text-right font-mono font-bold text-sm p-2.5 border border-black w-[35%] text-slate-950 text-[12pt]" data-testid="invoice-total">
                          <span className="hidden print:inline">
                            {formatCurrency(invoice.total).replace('₱', '').trim()}
                          </span>
                          <span className="print:hidden">
                            {formatCurrency(invoice.total)}
                          </span>
                        </td>
                      </tr>
                      <tr className="print:hidden">
                        <td className="bg-slate-50 p-2 font-medium border border-black text-slate-600">
                          Amount Paid
                        </td>
                        <td className="text-center p-2 border border-black text-slate-500">
                          PHP
                        </td>
                        <td className="text-right font-mono p-2 border border-black text-emerald-700 font-semibold">
                          {formatCurrency(invoice.amount_paid || 0)}
                        </td>
                      </tr>
                      <tr className="print:hidden">
                        <td className="bg-slate-50 p-2 font-bold border border-black text-slate-900">
                          Outstanding Balance
                        </td>
                        <td className="text-center font-bold p-2 border border-black text-slate-700">
                          PHP
                        </td>
                        <td
                          className={`text-right font-mono font-bold p-2 border border-black ${
                            Number(invoice.balance || 0) > 0 ? 'text-amber-700' : 'text-slate-600'
                          }`}
                          data-testid="invoice-balance"
                        >
                          {formatCurrency(invoice.balance)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Notes */}
              {invoice.notes && (
                <div className="mb-6 p-3 border-[1.5px] border-black bg-white text-xs">
                  <span className="font-bold text-slate-900 block mb-1 uppercase text-[11px]">Notes:</span>
                  <p className="text-slate-700 whitespace-pre-wrap">{invoice.notes}</p>
                </div>
              )}

              {/* 5. Signatures (3-box row matching prototype) */}
              <div className="signature-row flex justify-between gap-8 mt-10 mb-6">
                <div className="signature-box flex-1 flex flex-col justify-between">
                  <div className="signature-label text-xs font-bold text-slate-800 mb-8">Noted by:</div>
                  <div className="signature-line-container border-t-[1.5px] border-black pt-1.5 text-center">
                    <div className="signature-name-printed text-xs font-bold text-slate-900 uppercase">
                      HENRY WONG
                    </div>
                  </div>
                </div>
                <div className="signature-box flex-1 flex flex-col justify-between">
                  <div className="signature-label text-xs font-bold text-slate-800 mb-8">Prepared by:</div>
                  <div className="signature-line-container border-t-[1.5px] border-black pt-1.5 text-center">
                    <div className="signature-name-printed text-xs font-bold text-slate-900 uppercase">
                      &nbsp;
                      <span className="print:hidden block">Authorized Signatory</span>
                    </div>
                    <div className="text-[10px] text-slate-500 print:hidden">
                      ATA & LTA Accounting Department
                    </div>
                  </div>
                </div>
                <div className="signature-box flex-1 flex flex-col justify-between">
                  <div className="signature-label text-xs font-bold text-slate-800 mb-8">Received by:</div>
                  <div className="signature-line-container border-t-[1.5px] border-black pt-1.5 text-center">
                    <div className="signature-name-printed text-xs font-bold text-slate-900 uppercase">
                      &nbsp;
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 6. Footer (Prototype Parity) */}
            <div className="footer-container border-t-2 border-black pt-4 mt-8 space-y-3 text-xs text-center">
              <div className="thank-you text-base font-extrabold tracking-widest text-slate-950 uppercase">
                THANK YOU !!!
              </div>
              {entityCode === 'LTA' ? (
                <div className="footer-text underline font-bold text-[9pt] text-slate-900">
                  Should you have any enquiries concerning this statement, please contact us on 742-8582/404-4928
                </div>
              ) : (
                <div className="footer-text font-bold text-slate-700 uppercase text-[11px]">
                  customer&apos;s copy
                </div>
              )}
              <div className="p-2 border border-slate-300 bg-slate-50 text-[10px] text-slate-600 text-center leading-tight print:hidden">
                NOTICE: THIS STATEMENT OF ACCOUNT IS NOT VALID FOR CLAIM OF INPUT VAT UNDER
                NATIONAL INTERNAL REVENUE CODE UNLESS BIR-REGISTERED OFFICIAL RECEIPT IS ISSUED
                UPON PAYMENT.
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="p-4 bg-white border-t border-slate-200 sticky bottom-0 z-10 flex justify-end print:hidden">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs cursor-pointer">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
