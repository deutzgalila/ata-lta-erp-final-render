# Project: Reports Page Redesign (ATA-LTA ERP v2)

## Architecture
The Reports Page Redesign transforms all five reporting tabs (`overview`, `daily`, `weekly`, `monthly`, `aging`) into a coherent, highly readable workspace conforming to enterprise system typography (`Poppins`, system sans), slate/blue palette, light surfaces, and responsive geometry:
1. **Route Shell, Navigation & Scope Subsystem (R1 / M1)**:
   - `frontend/src/routes/reports.tsx`: Single H1 "Reports" with subtitle "Review activity, balances, and pending items." Header entity toggle (`ATA | LTA | ALL`).
   - Accessible blue underline text tabs with URL synchronization supporting both `?tab=overview` (and legacy alias `?tab=analytics`), `daily`, `weekly`, `monthly`, `aging`.
   - RBAC gate: Admin or `users:manage` at route entry; `reports:view` and `billing:view` tab slices.
   - Unsupported ALL scope prompt (`<ReportScopePrompt />`) rendering on detail tabs with actionable "Switch to ATA" and "Switch to LTA" buttons, disabling detail queries in ALL state.
   - Shared feature-local presentation components: `ReportToolbar`, `ReportSummaryBand`, `ReportSection`, `ReportTableContainer`, `ReportScopePrompt`, `ReportStates`.
2. **Overview & Consolidated Comparison Subsystem (R2 / M2)**:
   - `frontend/src/features/reports/components/AnalyticsOverviewTab.tsx`:
   - Single entity: Neutral financial summary band (Billed, Collected, Outstanding, Net income), supporting Expenses row, compact record totals (Clients, Work requests, Documents, Invoices, Disbursements, Transmittals), and status breakdowns with plain horizontal comparison bars.
   - Consolidated ALL: Aligned 4-column comparison table (`Metric | ATA | LTA | Combined`) separating financial figures from record counts. Summed entity records disclaimer. Elimination of dark gradient hero, redundant sub-entity switcher, and side-by-side cloned dashboards. Concise entity codes `ATA` and `LTA`. Tabular numerals.
3. **Daily, Weekly, and Monthly Operational Reports (R3 / M3)**:
   - `DailyActivityTab.tsx`: 36px DateInput toolbar with prev/next day, Today shortcut, Refresh; 3-cell monetary summary band (Invoice total, Payments received, Disbursement total); category count strip linking to full-width detail tables.
   - `WeeklySummaryTab.tsx`: "Week of" toolbar with prev/next week (7-day step), 7-day boundary display; matching 3-cell monetary band and category strip; full-width detail tables strictly adhering to weekly schema fields.
   - `MonthlyPendingTab.tsx`: Month picker toolbar (`type="month"`) with prev/next month, This month shortcut, Refresh; 3 summary groups (Overdue invoices with balance, Pending disbursements with total amount, Stale transmittals with count) linking to full-width tables.
4. **AR Aging Analysis, Export & Print Subsystem (R4 / M4)**:
   - `AgingReportTab.tsx`: Single prominent headline outstanding balance figure; accessible bucket selection strip (`All`, `Current`, `1–30`, `31–60`, `61–90`, `90+`) displaying counts and amounts with `aria-pressed`; full-width invoice table with right-aligned numeric amounts and tabular numerals.
   - Distinct labeling between headline report total and filtered search results.
   - Safe CSV export with RFC 4180 quoting and spreadsheet formula injection protection (`=`, `+`, `-`, `@`, `\t`, `\r`).
   - Clean print stylesheet: `@media print` repeating table headers across pages, preventing mid-row breaks, showing report context, and hiding app navigation.
5. **Shared Infrastructure, Formatting & Verification Subsystem (R5 / M5)**:
   - `date-input.tsx`: 36px desktop height (`h-9`), minimum widths (176px date, 184px month), explicit `var(--font-sans)` inheritance across MUI input root, editable sections, separators, and calendar popups; zero regressions for 13 shared consumers.
   - `formatters.ts`: Strict separation of missing data (`—`) from genuine zero (`₱0.00` or `0`); complete peso formatting; calendar-only Manila date parsing without UTC day shifts; formula injection shield `escapeCsvCell`.
   - `useReports.ts`: Enabled gating with `activeEntity !== 'ALL'` for detail queries; strict cache key isolation by entity and period.
   - `reportsUI.test.tsx`: Expanded behavioral verification suites.

## Feature Inventory
| # | Feature | Description | Milestone | Source | Status |
|---|---------|-------------|-----------|--------|--------|
| 1 | Streamlined Page Header | Single H1 "Reports" (24/32px, 600 weight) with concise subtitle "Review activity, balances, and pending items." | M1 | Spec §2, R1 | DONE |
| 2 | Header Entity Switcher | Compact entity toggle `[ATA \| LTA \| ALL]` in header right, updating global session store. | M1 | Spec §2, R1 | DONE |
| 3 | Blue Underline Text Tabs | Accessible tab row with restrained blue active underline and quiet bottom border; no tab icons. | M1 | Spec §2, R1 | DONE |
| 4 | URL Tab Sync & Aliases | Bidirectional URL sync supporting `?tab=overview` (and legacy alias `?tab=analytics`), `daily`, `weekly`, `monthly`, `aging`. | M1 | Spec §2, R1 | DONE |
| 5 | RBAC Route Guard | Admin or `users:manage` check at route entry; `reports:view` and `billing:view` tab slices. | M1 | Spec §6, R1 | DONE |
| 6 | ALL Scope Prompt on Detail Tabs | Dedicated scope prompt card: "Choose ATA or LTA to view this report" with actionable "Switch to ATA" and "Switch to LTA" buttons. | M1 | Spec §6, R1 | DONE |
| 7 | Shared ReportToolbar | Reusable flex toolbar container with responsive wrap for period pickers, navigation arrows, shortcuts, refresh, filters, export/print. | M1 | Spec §2, R1 | DONE |
| 8 | Shared ReportSummaryBand | Neutral container for financial and metric summary cards with tabular numerals and responsive column wrapping. | M1 | Spec §2, R1 | DONE |
| 9 | Shared ReportSection | Full-width section container with 16px section heading, record count badge, optional collapse/expand toggle. | M1 | Spec §2, R1 | DONE |
| 10 | Shared ReportTableContainer | Contained horizontal scrolling wrapper (`overflow-x-auto`) with rounded border and 44–48px row heights. | M1 | Spec §4, R1 | DONE |
| 11 | Shared ReportStates | Contextual `ReportEmptyState`, stable `ReportLoadingState` skeleton, and `ReportErrorState` with retry. | M1 | Spec §6, R1 | DONE |
| 12 | Neutral Single Financial Band | 4-figure monetary band: Billed (`totalBilled`), Collected (`totalCollected`), Outstanding (`totalOutstanding`), Net income (`netIncome`). | M2 | Spec §5, R2 | DONE |
| 13 | Supporting Expenses Row | Formatted Total Expenses (`revenue.totalExpenses`) beneath summary band to maintain complete financial context. | M2 | Spec §5, R2 | DONE |
| 14 | Compact Record Totals | Compact labeled grid/table of record totals: Clients, Work requests, Documents, Invoices, Disbursements, Transmittals. | M2 | Spec §5, R2 | DONE |
| 15 | Status Breakdown Bars | Visual breakdown of Invoices, Disbursements, and Transmittals with plain horizontal comparison bars and exact counts. | M2 | Spec §5, R2 | DONE |
| 16 | Disbursement Financial Details | Detail breakdown of total recorded disbursement amount and released amount. | M2 | Spec §5, R2 | DONE |
| 17 | Aligned Consolidated Comparison Table | 4-column comparison table for ALL entity: **Metric \| ATA \| LTA \| Combined**. | M2 | Spec §5, R2 | DONE |
| 18 | Metric Section Grouping | Group financial metrics separately from operational record counts in comparison table. | M2 | Spec §5, R2 | DONE |
| 19 | Summed Records Disclaimer | Explicit label clarifying combined client/record counts represent summed entity records, not deduplicated customers. | M2 | Spec §5, R2 | DONE |
| 20 | Concise Entity Codes | Use concise entity codes ATA and LTA; remove unverified expanded business names. | M2 | Spec §1, R2 | DONE |
| 21 | Complete Peso Amounts | Render full peso values (`₱123,456,789.00`) with tabular numerals; eliminate `truncate` and K/M abbreviations. | M2 | Spec §3, R2 | DONE |
| 22 | Daily Navigation Toolbar | 36px DateInput with prev/next day arrow buttons, "Today" quick shortcut, and Refresh button. | M3 | Spec §5, R3 | DONE |
| 23 | Daily 3-Cell Monetary Band | 3-cell monetary summary band: Invoice total, Payments received, Disbursement total. | M3 | Spec §5, R3 | DONE |
| 24 | Daily Category Count Strip | Compact category count navigation strip linking to 6 full-width detail tables. | M3 | Spec §5, R3 | DONE |
| 25 | Daily Full-Width Work Requests Table | Full-width table of work requests with 2-line title wrap and full-title tooltip. | M3 | Spec §5, R3 | DONE |
| 26 | Daily Full-Width Invoices Table | Full-width table of invoices issued with tabular numerals. | M3 | Spec §5, R3 | DONE |
| 27 | Daily Full-Width Payments Table | Full-width table of payments received displaying Invoice ID (not mislabeled as Invoice #). | M3 | Spec §5, R3 | DONE |
| 28 | Daily Full-Width Disbursements Table | Full-width table of disbursements requested. | M3 | Spec §5, R3 | DONE |
| 29 | Daily Full-Width Documents Table | Full-width table of documents uploaded with 2-line wrap and tooltip. | M3 | Spec §5, R3 | DONE |
| 30 | Daily Full-Width Transmittals Table | Full-width table of transmittals created. | M3 | Spec §5, R3 | DONE |
| 31 | Weekly Navigation Toolbar | "Week of" 36px DateInput, prev/next week buttons (7-day step), "Current week" shortcut, Refresh. | M3 | Spec §5, R3 | DONE |
| 32 | Weekly 7-Day Boundary Header | Plain display of returned Monday–Sunday start and end boundaries. | M3 | Spec §5, R3 | DONE |
| 33 | Weekly Monetary & Count Bands | 3-cell monetary summary band and category count strip matching Daily layout. | M3 | Spec §5, R3 | DONE |
| 34 | Weekly Schema Detail Tables | Full-width detail tables strictly adhering to weekly schema fields without synthesizing missing fields. | M3 | Spec §5, R3 | DONE |
| 35 | Monthly Navigation Toolbar | Month DateInput (`type="month"`, 36px), prev/next month, "This month" shortcut, Refresh. | M3 | Spec §5, R3 | DONE |
| 36 | Monthly Overdue Invoices Group | Overdue invoices count + total outstanding balance linking to full-width table. | M3 | Spec §5, R3 | DONE |
| 37 | Monthly Pending Disbursements Group | Pending disbursements count + total amount linking to full-width table. | M3 | Spec §5, R3 | DONE |
| 38 | Monthly Stale Transmittals Group | Stale draft transmittals count (> 7 days draft) linking to full-width table. | M3 | Spec §5, R3 | DONE |
| 39 | AR Aging Single Outstanding Total | Single prominent headline outstanding balance figure at top of report. | M4 | Spec §5, R4 | DONE |
| 40 | AR Aging Accessible Bucket Strip | Button strip for `All`, `Current`, `1–30`, `31–60`, `61–90`, `90+` with amounts, counts, and `aria-pressed`. | M4 | Spec §5, R4 | DONE |
| 41 | AR Aging Invoice & Client Search | Search input filtering table rows by invoice number or client name in real time. | M4 | Spec §5, R4 | DONE |
| 42 | AR Aging Distinct Total Labeling | Explicit distinction between headline report totals and filtered search results count/balance. | M4 | Spec §5, R4 | DONE |
| 43 | AR Aging Full-Width Table | Full-width table with right-aligned numeric amounts, days overdue, and tabular numerals. | M4 | Spec §5, R4 | DONE |
| 44 | AR Aging Distinct Empty Filter State | Empty filter message: "No invoices match these filters." (Never "No overdue invoices found" for Current). | M4 | Spec §5, R4 | DONE |
| 45 | Safe CSV Generation | Formula injection protection prefixing `=`, `+`, `-`, `@`, `\t`, `\r` with `'` and standard RFC 4180 escaping. | M4 | Spec §5, R4 | DONE |
| 46 | Clean Print Stylesheet | Print layout hiding app navigation/filters, repeating table headers across pages, preventing mid-row splits. | M4 | Spec §7, R4 | DONE |
| 47 | DateInput Height & Font Inheritance | 36px default height (`h-9`), min widths, explicit Poppins font inheritance across MUI pickers and calendar popups. | M5 | Spec §3, R5 | DONE |
| 48 | Formatters Currency & Missing vs Zero | `formatCurrency` returning `—` for null/undefined/NaN, and `₱0.00` for genuine zero; negative formatting `-₱X.XX`. | M5 | Spec §3, R5 | DONE |
| 49 | Calendar-Only Manila Date Utilities | `formatManilaDate` without UTC day-shifting, `formatMonth`, `formatDateRange`, `getTodayString`, `getWeekBounds`. | M5 | Spec §3, R5 | DONE |
| 50 | Query Entity & Scope Gating | `enabled: activeEntity !== 'ALL' && ...` on detail hooks; query key isolation by entity and period. | M5 | Spec §6, R5 | DONE |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Page Shell & Shared Presentation (Agent 1) | `routes/reports.tsx`, shared components in `features/reports/components/` | none | DONE |
| M2 | Overview & Consolidated Comparison (Agent 2) | `AnalyticsOverviewTab.tsx` | M1, M5 | DONE |
| M3 | Daily, Weekly, Monthly Reports (Agent 3) | `DailyActivityTab.tsx`, `WeeklySummaryTab.tsx`, `MonthlyPendingTab.tsx` | M1, M5 | DONE |
| M4 | AR Aging & Export/Print Consistency (Agent 4) | `AgingReportTab.tsx` | M1, M5 | DONE |
| M5 | Shared Infrastructure & Verification (Lead / Integrator) | `date-input.tsx`, `formatters.ts`, `useReports.ts`, `queryKeys.ts`, `reportsUI.test.tsx` | none | DONE |
| M6 | Integration, Review, Challenger & Forensic Audit | Verification across all tabs, typecheck, build, challenger stress testing, forensic integrity audit | M1, M2, M3, M4, M5 | DONE |

## Interface Contracts

### 1. Shared Report Presentation Components (`frontend/src/features/reports/components/`)
- **`ReportToolbar`**:
  ```tsx
  export interface ReportToolbarProps {
    children: React.ReactNode;
    className?: string;
  }
  ```
- **`ReportSummaryBand`**:
  ```tsx
  export interface SummaryMetricItem {
    label: string;
    value: string;
    subtext?: string;
    attention?: boolean;
    dataTestId?: string;
  }
  export interface ReportSummaryBandProps {
    metrics?: SummaryMetricItem[];
    children?: React.ReactNode;
    columns?: 1 | 2 | 3 | 4 | 5 | 6;
    className?: string;
    isLoading?: boolean;
  }
  ```
- **`ReportSection`**:
  ```tsx
  export interface ReportSectionProps {
    title: string;
    badgeCount?: number | string;
    action?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    defaultOpen?: boolean;
  }
  ```
- **`ReportTableContainer`**:
  ```tsx
  export interface ReportTableContainerProps {
    children: React.ReactNode;
    className?: string;
    minWidth?: string; // e.g. 'min-w-[640px]'
  }
  ```
- **`ReportScopePrompt`**:
  ```tsx
  export interface ReportScopePromptProps {
    message?: string; // default: "Choose ATA or LTA to view this report"
    description?: string;
    onSelectEntity?: (entity: 'ATA' | 'LTA') => void;
  }
  ```
- **`ReportStates`**:
  - `ReportLoadingState({ type }: { type: 'summary' | 'table' | 'full' })`
  - `ReportErrorState({ message, onRetry }: { message?: string; onRetry?: () => void })`
  - `ReportEmptyState({ title, description, onReset }: { title: string; description?: string; onReset?: () => void })`

### 2. Formatters Contract (`frontend/src/features/reports/utils/formatters.ts`)
- `formatCurrency(amount: number | string | undefined | null, options?: { fallback?: string }): string`
  - Missing/null/undefined/NaN -> `'—'`
  - Genuine zero -> `'₱0.00'`
  - Positive -> `'₱12,500.00'`
  - Negative -> `'-₱12,500.00'`
- `formatCount(count: number | string | undefined | null, options?: { fallback?: string }): string`
  - Missing -> `'—'`, Zero -> `'0'`, Positive -> formatted count
- `formatManilaDate(dateStr: string | undefined | null): string`
  - Calendar-only `YYYY-MM-DD` -> `'MMM D, YYYY'` without UTC drift
- `formatDate(dateStr: string | undefined | null): string` (alias for backward compatibility)
- `formatMonth(monthStr: string | undefined | null): string` (`YYYY-MM` -> `'MMMM YYYY'`)
- `formatDateRange(startStr: string, endStr: string): string`
- `getTodayString(): string` (Manila `YYYY-MM-DD`)
- `getCurrentMonthString(): string` (Manila `YYYY-MM`)
- `getWeekBounds(dateStr: string): { start: string; end: string }`
- `escapeCsvCell(val: string | number | boolean | null | undefined): string`

### 3. DateInput Contract (`frontend/src/components/ui/date-input.tsx`)
- Props interface unchanged: `DateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, ...>`
- Height: 36px default (`h-9`), respects custom height classes (e.g. `h-8`).
- Fonts: Inherits `var(--font-sans)` across input root, sections, separators, poppers, dialogs.

### 4. Query Gating Contract (`frontend/src/features/reports/api/useReports.ts`)
- Detail queries check `enabled: activeEntity !== 'ALL' && (options?.enabled ?? true)`.
- Query keys strictly isolate `activeEntity` and period.

## Code Layout
- Exclusive File Ownership:
  - Agent 1: `frontend/src/routes/reports.tsx`, `frontend/src/features/reports/components/Report*.tsx` (shared presentation components)
  - Agent 2: `frontend/src/features/reports/components/AnalyticsOverviewTab.tsx`
  - Agent 3: `frontend/src/features/reports/components/DailyActivityTab.tsx`, `frontend/src/features/reports/components/WeeklySummaryTab.tsx`, `frontend/src/features/reports/components/MonthlyPendingTab.tsx`
  - Agent 4: `frontend/src/features/reports/components/AgingReportTab.tsx`
  - Lead / Integrator: `frontend/src/components/ui/date-input.tsx`, `frontend/src/features/reports/utils/formatters.ts`, `frontend/src/features/reports/api/useReports.ts`, `frontend/src/features/reports/api/queryKeys.ts`, `frontend/src/features/reports/__tests__/reportsUI.test.tsx`, `frontend/src/index.css`
