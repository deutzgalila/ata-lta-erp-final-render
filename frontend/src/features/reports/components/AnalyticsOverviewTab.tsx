import React, { useState } from 'react';
import {
  Users,
  Briefcase,
  FileText,
  Receipt,
  CreditCard,
  Send,
  TrendingUp,
  RefreshCw,
  AlertCircle,
  Building2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { useReportsAnalytics } from '../api/useReports';
import type { AnalyticsData, ConsolidatedAnalyticsData } from '../api/types';
import { formatCurrency } from '../utils/formatters';
import { useSessionStore } from '@/lib/session';

interface MiniStatProps {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
  testId?: string;
}

function MiniStat({ label, value, icon: Icon, accentColor, testId }: MiniStatProps) {
  return (
    <div
      className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex items-center justify-between"
      data-testid={testId}
    >
      <div>
        <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
          {label}
        </span>
        <span className="text-2xl font-bold text-slate-900 mt-1 block">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </span>
      </div>
      <div className={`p-2.5 rounded-lg ${accentColor}`}>
        <Icon className="w-5 h-5" />
      </div>
    </div>
  );
}

function StatusBreakdownList({
  title,
  byStatus,
}: {
  title: string;
  byStatus?: Record<string, number>;
}) {
  const entries = Object.entries(byStatus || {});
  if (entries.length === 0) {
    return (
      <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-400 italic">
        No status data available
      </div>
    );
  }

  return (
    <div className="mt-4 pt-4 border-t border-slate-100">
      <h4 className="text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wider">
        {title}
      </h4>
      <div className="space-y-1.5">
        {entries.map(([status, count]) => (
          <div
            key={status}
            className="flex items-center justify-between text-xs py-1 px-1.5 rounded hover:bg-slate-50 transition-colors"
          >
            <span className="text-slate-600">{status}</span>
            <Badge variant="secondary" className="text-[10px] font-semibold px-2 py-0">
              {count}
            </Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

function SingleAnalyticsView({ data }: { data: AnalyticsData }) {
  const { clients, workRequests, documents, invoices, disbursements, transmittals, revenue } = data;

  return (
    <div className="space-y-6">
      {/* 1. Summary KPI Grid */}
      <div
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3"
        data-testid="analytics-kpi-grid"
      >
        <MiniStat
          label="Clients"
          value={clients?.total ?? 0}
          icon={Users}
          accentColor="bg-blue-50 text-blue-600"
          testId="kpi-clients"
        />
        <MiniStat
          label="Work Requests"
          value={workRequests?.total ?? 0}
          icon={Briefcase}
          accentColor="bg-indigo-50 text-indigo-600"
          testId="kpi-work-requests"
        />
        <MiniStat
          label="Active Documents"
          value={documents?.total ?? 0}
          icon={FileText}
          accentColor="bg-teal-50 text-teal-600"
          testId="kpi-documents"
        />
        <MiniStat
          label="Invoices"
          value={invoices?.total ?? 0}
          icon={Receipt}
          accentColor="bg-amber-50 text-amber-600"
          testId="kpi-invoices"
        />
        <MiniStat
          label="Disbursements"
          value={disbursements?.total ?? 0}
          icon={CreditCard}
          accentColor="bg-purple-50 text-purple-600"
          testId="kpi-disbursements"
        />
        <MiniStat
          label="Transmittals"
          value={transmittals?.total ?? 0}
          icon={Send}
          accentColor="bg-emerald-50 text-emerald-600"
          testId="kpi-transmittals"
        />
      </div>

      {/* 2. Bento Detail Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="analytics-bento-grid">
        {/* Billing Summary */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-amber-600" />
                <span>Billing Summary</span>
              </h3>
              <Badge variant="outline" className="text-xs">
                {invoices?.total ?? 0} Invoices
              </Badge>
            </div>
            <div className="mt-3">
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="text-xs font-medium text-slate-600 py-2">
                      Total Billed
                    </TableCell>
                    <TableCell className="text-xs font-mono font-semibold text-slate-900 text-right py-2">
                      {formatCurrency(invoices?.totalBilled)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-xs font-medium text-slate-600 py-2">
                      Total Collected
                    </TableCell>
                    <TableCell className="text-xs font-mono font-semibold text-emerald-600 text-right py-2">
                      {formatCurrency(invoices?.totalCollected)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-xs font-medium text-slate-600 py-2">
                      Total Outstanding
                    </TableCell>
                    <TableCell className="text-xs font-mono font-semibold text-amber-600 text-right py-2">
                      {formatCurrency(invoices?.totalOutstanding)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
          <StatusBreakdownList title="Invoices by Status" byStatus={invoices?.byStatus} />
        </div>

        {/* Disbursement Summary */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-purple-600" />
                <span>Disbursement Summary</span>
              </h3>
              <Badge variant="outline" className="text-xs">
                {disbursements?.total ?? 0} Requests
              </Badge>
            </div>
            <div className="mt-3">
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="text-xs font-medium text-slate-600 py-2">
                      Total Recorded
                    </TableCell>
                    <TableCell className="text-xs font-mono font-semibold text-slate-900 text-right py-2">
                      {formatCurrency(disbursements?.totalAmount)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-xs font-medium text-slate-600 py-2">
                      Released Amount
                    </TableCell>
                    <TableCell className="text-xs font-mono font-semibold text-purple-700 text-right py-2">
                      {formatCurrency(disbursements?.releasedAmount)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
          <StatusBreakdownList title="Disbursements by Status" byStatus={disbursements?.byStatus} />
        </div>

        {/* Revenue & P&L */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <span>Revenue & P&L Summary</span>
              </h3>
              <Badge
                variant={revenue?.netIncome >= 0 ? 'default' : 'destructive'}
                className="text-xs"
              >
                Net: {formatCurrency(revenue?.netIncome)}
              </Badge>
            </div>
            <div className="mt-3">
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="text-xs font-medium text-slate-600 py-2">
                      Total Billed
                    </TableCell>
                    <TableCell className="text-xs font-mono text-slate-700 text-right py-2">
                      {formatCurrency(revenue?.totalBilled)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-xs font-medium text-slate-600 py-2">
                      Total Collected
                    </TableCell>
                    <TableCell className="text-xs font-mono text-slate-700 text-right py-2">
                      {formatCurrency(revenue?.totalCollected)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-xs font-medium text-slate-600 py-2">
                      Total Outstanding
                    </TableCell>
                    <TableCell className="text-xs font-mono text-slate-700 text-right py-2">
                      {formatCurrency(revenue?.totalOutstanding)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="text-xs font-medium text-slate-600 py-2">
                      Total Expenses (Disbursements)
                    </TableCell>
                    <TableCell className="text-xs font-mono text-rose-600 text-right py-2">
                      {formatCurrency(revenue?.totalExpenses)}
                    </TableCell>
                  </TableRow>
                  <TableRow className="bg-slate-50/70 font-semibold">
                    <TableCell className="text-xs font-bold text-slate-900 py-2.5">
                      Net Operating Income
                    </TableCell>
                    <TableCell
                      className={`text-xs font-mono font-bold text-right py-2.5 ${
                        (revenue?.netIncome ?? 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {formatCurrency(revenue?.netIncome)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        </div>

        {/* Transmittal Summary */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Send className="w-4 h-4 text-emerald-600" />
                <span>Transmittal Summary</span>
              </h3>
              <Badge variant="outline" className="text-xs">
                {transmittals?.total ?? 0} Records
              </Badge>
            </div>
            <div className="mt-3">
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="text-xs font-medium text-slate-600 py-2">
                      Total Transmittals
                    </TableCell>
                    <TableCell className="text-xs font-mono font-semibold text-slate-900 text-right py-2">
                      {transmittals?.total ?? 0}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
          <StatusBreakdownList title="Transmittals by Status" byStatus={transmittals?.byStatus} />
        </div>
      </div>
    </div>
  );
}

function ConsolidatedAnalyticsView({ data }: { data: ConsolidatedAnalyticsData }) {
  const [selectedSubEntity, setSelectedSubEntity] = useState<'ATA' | 'LTA' | 'COMPARE'>('COMPARE');

  const { ATA, LTA } = data.analyticsByEntity;

  // Combined totals for comparative header
  const combinedClients = (ATA.clients?.total || 0) + (LTA.clients?.total || 0);
  const combinedWr = (ATA.workRequests?.total || 0) + (LTA.workRequests?.total || 0);
  const combinedBilled = (ATA.invoices?.totalBilled || 0) + (LTA.invoices?.totalBilled || 0);
  const combinedNet = (ATA.revenue?.netIncome || 0) + (LTA.revenue?.netIncome || 0);

  return (
    <div className="space-y-6" data-testid="consolidated-analytics-view">
      {/* Consolidated Overview Header */}
      <div className="bg-linear-to-r from-slate-900 to-slate-800 text-white p-6 rounded-2xl shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-xs">
              <Building2 className="w-6 h-6 text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Consolidated Enterprise Analytics</h3>
              <p className="text-xs text-slate-300">
                Combined operational and financial data across ATA and LTA entities.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 bg-white/10 p-1 rounded-lg backdrop-blur-xs">
            <button
              type="button"
              onClick={() => setSelectedSubEntity('COMPARE')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                selectedSubEntity === 'COMPARE'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Side-by-Side
            </button>
            <button
              type="button"
              onClick={() => setSelectedSubEntity('ATA')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                selectedSubEntity === 'ATA'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              ATA Only
            </button>
            <button
              type="button"
              onClick={() => setSelectedSubEntity('LTA')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                selectedSubEntity === 'LTA'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              LTA Only
            </button>
          </div>
        </div>

        {/* Combined summary KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-3 border-t border-white/10">
          <div>
            <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
              Combined Clients
            </span>
            <p className="text-xl font-bold mt-0.5">{combinedClients}</p>
          </div>
          <div>
            <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
              Combined Work Requests
            </span>
            <p className="text-xl font-bold mt-0.5">{combinedWr}</p>
          </div>
          <div>
            <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
              Combined Billed
            </span>
            <p className="text-xl font-bold mt-0.5">{formatCurrency(combinedBilled)}</p>
          </div>
          <div>
            <span className="text-[10px] uppercase font-semibold text-slate-400 tracking-wider">
              Combined Net Income
            </span>
            <p className="text-xl font-bold mt-0.5 text-emerald-400">
              {formatCurrency(combinedNet)}
            </p>
          </div>
        </div>
      </div>

      {selectedSubEntity === 'COMPARE' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
              <Badge className="bg-blue-600">ATA</Badge>
              <h4 className="font-bold text-sm text-slate-900">Asian Trade Alliance</h4>
            </div>
            <SingleAnalyticsView data={ATA} />
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-200">
              <Badge className="bg-emerald-600">LTA</Badge>
              <h4 className="font-bold text-sm text-slate-900">Luzon Trade Alliance</h4>
            </div>
            <SingleAnalyticsView data={LTA} />
          </div>
        </div>
      ) : selectedSubEntity === 'ATA' ? (
        <SingleAnalyticsView data={ATA} />
      ) : (
        <SingleAnalyticsView data={LTA} />
      )}
    </div>
  );
}

export function AnalyticsOverviewTab() {
  const { data, isLoading, error, refetch, isRefetching } = useReportsAnalytics();
  const activeEntity = useSessionStore((state) => state.activeEntity);

  if (isLoading) {
    return (
      <div
        className="p-12 text-center text-slate-400 bg-white rounded-xl border border-slate-200"
        data-testid="analytics-loading"
      >
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
        <p className="text-xs">Loading operational analytics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="p-8 text-center bg-white rounded-xl border border-rose-200 space-y-3"
        data-testid="analytics-error"
      >
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto" />
        <h3 className="text-sm font-semibold text-slate-800">Unable to load analytics</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          {error instanceof Error ? error.message : 'Please check your connection and try again.'}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="text-xs cursor-pointer"
        >
          Retry
        </Button>
      </div>
    );
  }

  const isConsolidated =
    Boolean(data && 'analyticsByEntity' in data) || activeEntity === 'ALL';

  return (
    <div className="space-y-6" data-testid="analytics-overview-tab">
      {/* Tab Header Controls */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-600" />
            <span>Operational & Financial Analytics</span>
          </h2>
          <p className="text-xs text-slate-500">
            High-level metrics across clients, requests, active documents, billing, disbursements,
            and transmittals.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isRefetching}
          className="text-xs gap-1.5 cursor-pointer"
          data-testid="analytics-refresh-button"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </Button>
      </div>

      {isConsolidated && data && 'analyticsByEntity' in data ? (
        <ConsolidatedAnalyticsView data={data as ConsolidatedAnalyticsData} />
      ) : data && 'clients' in data ? (
        <SingleAnalyticsView data={data as AnalyticsData} />
      ) : (
        <div className="p-8 text-center bg-white rounded-xl border border-slate-200 text-xs text-slate-500">
          No analytics data available for entity.
        </div>
      )}
    </div>
  );
}
