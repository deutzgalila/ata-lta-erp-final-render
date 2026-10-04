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
  const entityFullName =
    entityCode === 'ATA' ? 'Amaya Tan & Associates' : 'LTA — Lanting Tan & Associates';
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

  const handlePrint = () => {
    // Explicit trigger decoupled from modal open
    window.print();
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
        className="max-w-4xl max-h-[92vh] overflow-y-auto p-0 rounded-xl bg-slate-100"
        data-testid="print-preview-modal"
      >
        <DialogHeader className="p-4 bg-white border-b border-slate-200 sticky top-0 z-10 flex flex-row items-center justify-between">
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
            className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-xs text-emerald-800"
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
        <div className="p-6 flex justify-center">
          <div
            className="w-full max-w-[210mm] min-h-[297mm] bg-white text-slate-900 p-10 shadow-lg rounded-sm border border-slate-200 flex flex-col justify-between"
            data-testid="a4-document-sheet"
          >
            <div>
              {/* 1. Header & Entity Branding */}
              <div className="border-b-2 border-slate-900 pb-5 mb-6 flex justify-between items-start">
                <div>
                  <h1 className="text-xl font-black tracking-tight text-slate-950 uppercase">
                    {entityFullName}
                  </h1>
                  <p className="text-xs text-slate-600 font-medium">{entityTagline}</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Metro Manila, Philippines • Tax Identification Number: 000-123-456-000
                  </p>
                </div>
                <div className="text-right">
                  <div className="inline-block bg-slate-900 text-white font-bold text-xs uppercase px-3 py-1 tracking-wider rounded-xs mb-1">
                    STATEMENT OF ACCOUNT
                  </div>
                  <p className="text-xs font-semibold text-slate-800">
                    No: <span className="font-mono">{invoice.invoice_number}</span>
                  </p>
                </div>
              </div>

              {/* 2. Metadata Grid */}
              <div className="grid grid-cols-2 gap-6 mb-6 text-xs">
                {/* Bill To Box */}
                <div
                  className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 space-y-2"
                  data-testid="bill-to-box"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-[11px] text-slate-500 uppercase tracking-wider">
                      BILL TO:
                    </span>
                    {canEditAddress ? (
                      !isEditingAddress && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsEditingAddress(true);
                            setAddressInput(currentAddress);
                          }}
                          className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                          data-testid="edit-client-address-button"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Edit Address</span>
                        </button>
                      )
                    ) : (
                      <span
                        className="text-[10px] text-slate-400 flex items-center gap-1"
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
                  {invoice.clients?.tin && (
                    <p className="text-slate-600 font-mono text-[11px]">
                      TIN: {invoice.clients.tin}
                    </p>
                  )}

                  {/* Address Section with Field-Level Security Inline Edit */}
                  <div className="pt-1">
                    {isEditingAddress ? (
                      <div className="space-y-2" data-testid="inline-address-editor">
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
                        className="text-slate-700 text-xs leading-relaxed"
                        data-testid="client-address-display"
                      >
                        {currentAddress}
                      </p>
                    )}
                  </div>
                </div>

                {/* Invoice Details Box */}
                <div className="bg-slate-50 p-3.5 rounded-lg border border-slate-200 flex flex-col justify-between space-y-2">
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-medium">Invoice Date:</span>
                      <span className="font-semibold text-slate-900 font-mono">
                        {invoice.issue_date?.slice(0, 10)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-medium">Payment Due:</span>
                      <span className="font-semibold text-slate-900 font-mono">
                        {invoice.due_date?.slice(0, 10)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 font-medium">Status:</span>
                      <span
                        className={`inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-semibold border ${getStatusBadgeVariant(
                          invoice.status
                        )}`}
                      >
                        {invoice.status}
                      </span>
                    </div>
                  </div>

                  {invoice.terms && (
                    <div className="pt-2 border-t border-slate-200">
                      <span className="text-slate-500 text-[11px] block">Payment Terms:</span>
                      <span className="text-slate-700 text-[11px]">{invoice.terms}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Line Items Table */}
              <div className="mb-6">
                <table className="w-full text-xs border-collapse" data-testid="line-items-table">
                  <thead>
                    <tr className="border-b-2 border-slate-800 bg-slate-100 text-slate-800">
                      <th className="py-2 px-3 text-left w-12 font-bold">#</th>
                      <th className="py-2 px-3 text-left font-bold">DESCRIPTION</th>
                      <th className="py-2 px-3 text-left w-36 font-bold">CATEGORY</th>
                      <th className="py-2 px-3 text-right w-32 font-bold">AMOUNT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(invoice.line_items || []).map((item, idx) => (
                      <tr
                        key={item.id || idx}
                        className="border-b border-slate-200 text-slate-800 hover:bg-slate-50/50"
                      >
                        <td className="py-2.5 px-3 font-mono text-slate-500">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-medium">{item.description}</td>
                        <td className="py-2.5 px-3 text-slate-600">{item.type}</td>
                        <td className="py-2.5 px-3 text-right font-mono font-medium">
                          {formatCurrency(item.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 4. Financial Totals (total = subtotal) */}
              <div className="flex justify-end mb-8">
                <div className="w-72 space-y-1.5 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal:</span>
                    <span className="font-mono">{formatCurrency(invoice.subtotal)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-1.5">
                    <span>Total Amount Due:</span>
                    <span className="font-mono text-sm" data-testid="invoice-total">
                      {formatCurrency(invoice.total)}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>Amount Paid:</span>
                    <span className="font-mono text-emerald-600">
                      {formatCurrency(invoice.amount_paid || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-900 border-t border-slate-200 pt-1.5">
                    <span>Outstanding Balance:</span>
                    <span
                      className={`font-mono text-sm ${
                        Number(invoice.balance || 0) > 0 ? 'text-amber-600' : 'text-slate-500'
                      }`}
                      data-testid="invoice-balance"
                    >
                      {formatCurrency(invoice.balance)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {invoice.notes && (
                <div className="mb-6 p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                  <span className="font-bold text-slate-700 block mb-1">Notes:</span>
                  <p className="text-slate-600 whitespace-pre-wrap">{invoice.notes}</p>
                </div>
              )}
            </div>

            {/* 5. BIR / Official Regulatory Footer */}
            <div className="border-t-2 border-slate-800 pt-4 mt-8 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-8 text-[11px] text-slate-600">
                <div>
                  <p className="font-bold text-slate-900 mb-1">Remittance Instructions:</p>
                  <p>Please make all checks payable to &quot;{entityFullName}&quot;.</p>
                  <p>Bank: Bank of the Philippine Islands (BPI)</p>
                  <p>Account No.: 1234-5678-90</p>
                </div>
                <div className="text-right flex flex-col justify-end">
                  <div className="w-48 ml-auto border-b border-slate-400 pb-1 mb-1 text-center">
                    Authorized Signatory
                  </div>
                  <p className="text-[10px] text-slate-400 text-center w-48 ml-auto">
                    ATA & LTA Accounting Department
                  </p>
                </div>
              </div>

              <div className="p-2 bg-slate-100 rounded text-[10px] text-slate-500 text-center leading-tight">
                NOTICE: THIS STATEMENT OF ACCOUNT IS NOT VALID FOR CLAIM OF INPUT VAT UNDER
                NATIONAL INTERNAL REVENUE CODE UNLESS BIR-REGISTERED OFFICIAL RECEIPT IS ISSUED
                UPON PAYMENT.
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="p-4 bg-white border-t border-slate-200 sticky bottom-0 z-10 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs cursor-pointer">
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
