# Industrial Brutalist UI — Complete Redesign Token Contract

**Archetype:** Swiss Industrial Print (`industrial-brutalist-ui` §2.1) × Achromatic Ledger (`design-taste-frontend` `app-screens.md`).
**Mandate:** Single light substrate (`#F4F4F0` unbleached documentation paper), Carbon Ink (`#0A0A0A`), Aviation/Hazard Red (`#E61919`) structural accent, `0px` mechanical corners, exposed `1px`/`2px` blueprint grids, consistent module inner tabs, and reworked Reports telemetry—with **zero functional regression**.

---

## 1. Color System (Swiss Industrial Print Substrate)

Gradients, soft drop shadows, glassmorphism (`backdrop-blur`), and rounded consumer pills are strictly prohibited.

| Token Role | CSS Custom Property | Value | Usage & Contrast Rules |
|---|---|---|---|
| **Canvas (Ground)** | `--color-bg` / `--color-bg-app` | `#F4F4F0` | Primary unbleached documentation paper substrate across all routes (`login` included). |
| **Subtle / Recessed Well** | `--color-bg-subtle` / `--color-bg-muted` | `#EAE8E3` | Sidebar ground, table headers, toolbar wells, inactive tab tracks. |
| **Elevated Sheet / Surface** | `--color-surface` / `--color-panel` | `#FAF9F5` | Data cards, ledger tables, active sheets, modal bodies. |
| **Input / Control Surface** | `--color-bg-light` | `#FFFFFF` | Form inputs, selects, date pickers, active table rows. |
| **Surface Hover** | `--color-bg-hover` | `#E4E2DC` | Mechanical row/button hover step. |
| **Surface Selected** | `--color-surface-selected` | `#DDDAD2` | Selected row or secondary active state. |
| **Carbon Ink (Primary Text)** | `--color-text` / `--color-text-main` / `--color-text-base` | `#0A0A0A` | Primary body copy, figures, headings, table data (17.8:1 on `#F4F4F0`). |
| **Strong Ink** | `--color-ink-strong` | `#050505` | Macro headings, primary button fill, heavy structural borders. |
| **Muted / Telemetry Ink** | `--color-text-muted` | `#4A4945` | Secondary labels, captions, column headers (>7.2:1 on `#F4F4F0` & `#FAF9F5` — WCAG AAA). |
| **Placeholder Ink** | `--color-text-placeholder` | `#5C5B57` | Input placeholders (>5.4:1 on `#FFFFFF` — WCAG AA). |
| **Inverse Ink** | `--color-text-inverse` | `#FAF9F5` | Text on `#0A0A0A` Carbon Ink or `#E61919` Hazard Red fills. |
| **Structural Frame Border** | `--color-border-strong` | `#0A0A0A` | Outer panel borders, shell dividers, active tab rules (`1px` or `2px solid #0A0A0A`). |
| **Grid Cell / Hairline Rule** | `--color-border` / `--color-border-subtle` | `#C8C5BC` | Internal table row/cell dividers and secondary compartment rules (`1px solid #C8C5BC`). |
| **Control Border** | `--color-control-border` | `#111111` | Inputs, selects, buttons, checkboxes (`1px solid #111111`). |
| **Primary Action (Carbon)** | `--color-primary` | `#0A0A0A` | Primary buttons & active navigation fill (`#FAF9F5` label). |
| **Primary Action Hover** | `--color-primary-dark` | `#222220` | Hover state for primary Carbon actions. |
| **Aviation / Hazard Red (Accent)** | `--color-accent` / `--color-danger` | `#E61919` | Active tab indicator bar, critical alerts, overdue/rejected indicators, focus accent, primary chart/telemetry bar. |
| **Accent Surface Tint** | `--color-primary-light` | `#EAE8E3` | Neutral technical highlight fill (replaces soft blue `#eef1ff`). |
| **Focus Ring** | `--color-focus` | `#E61919` | `2px solid #E61919` with `2px` offset (or `#0A0A0A` on red controls). |
| **Entity ATA Stamp** | `--color-ata` | `#0A0A0A` | High-contrast Carbon Ink stamp (`border: 1px solid #0A0A0A`). |
| **Entity LTA Stamp** | `--color-lta` | `#3A3935` | Industrial charcoal stamp (`border: 1px solid #0A0A0A`, explicit `LTA` text). |

### Semantic Status Stamps (Utilitarian Print Badges)
All status badges use `0px` square corners, `1px solid` borders, `JetBrains Mono` `12px` (`0.75rem`) font size, and WCAG AA contrast:

| Semantic Role | Surface | Ink | Border |
|---|---|---|---|
| **Success** (Paid, Funded, Approved, Active, Completed) | `#E6F2E8` | `#0F5223` | `#1B7A37` |
| **Warning** (Pending, Awaiting, QA Review, 1–60d Overdue) | `#FDF3D7` | `#734800` | `#B87500` |
| **Danger** (Rejected, Overdue 61d+, Blocked, Error) | `#FCE8E8` | `#A81212` | `#E61919` |
| **Info** (Sent, In Progress, Released, Partially Paid) | `#E8EEF5` | `#103F6E` | `#1E5C99` |
| **Neutral** (Draft, Archived, Cancelled, Scope Stamp) | `#EAE8E3` | `#111111` | `#111111` |

---

## 2. Typographic Architecture

Bundle fonts locally via `@fontsource/inter`, `@fontsource/archivo-black`, and `@fontsource/jetbrains-mono` (no external Google Fonts blocking or `Poppins`).

| Role | Font Stack | Size / Line-Height | Weight / Tracking / Case |
|---|---|---|---|
| **Macro Display (Sign-In / Dossier)** | `'Archivo Black', 'Inter', sans-serif` | `clamp(2rem, 3.5vw, 3.25rem)` / `0.95` | `800–900` / `-0.04em` / Uppercase |
| **Module Page Title (`h1`)** | `'Inter', system-ui, sans-serif` | `24px` (`1.5rem`) / `30px` (Mobile `20px`/`26px`) | `800` / `-0.03em` / Preserved accessible title text |
| **Section / Dialog Header (`h2`, `h3`)** | `'Inter', system-ui, sans-serif` | `16px` (`1rem`) / `22px` (Dialog `18px`/`24px`) | `700` / `-0.02em` |
| **Body / Form Control / Nav** | `'Inter', system-ui, sans-serif` | `14px` (`0.875rem`) / `20px` | `400` (`500–600` for labels & active controls) |
| **Dense Ledger Table Cell** | `'Inter', system-ui, sans-serif` | `13px` (`0.8125rem`) / `18px` | `400` (`600` for key identifiers & totals) |
| **Micro-Telemetry / Metadata / Badges / Table Headers** | `'JetBrains Mono', ui-monospace, monospace` | `12px` (`0.75rem`) / `16px` | `500–600` / `0.05em` (Uppercase for table headers, breadcrumbs & stamps; preserve casing where tests match exact text) |
| **KPI / Primary Ledger Figure** | `'JetBrains Mono', 'Inter', monospace` | `24px–28px` / `32px` | `700` / `-0.02em` / `font-variant-numeric: tabular-nums lining-nums` |

**Numeric Discipline:** Every financial figure, count, aging balance, date, and KPI value MUST enforce `tabular-nums` (`font-variant-numeric: tabular-nums lining-nums`). Monetary and count columns in tables align right.

---

## 3. Spatial Engineering, Geometry & Consistent Module Layout

- **Corner Radius:** `0px` everywhere (`--radius-sm: 0px`, `--radius-md: 0px`, `--radius-lg: 0px`, `--radius-xl: 0px`, `--radius-pill: 0px`).
- **Elevation & Borders:**
  - Resting panels/cards: `border: 1px solid #0A0A0A`, `background: #FAF9F5`, `box-shadow: none`.
  - Blueprint telemetry grids: `display: grid; gap: 1px; background-color: #0A0A0A; border: 1px solid #0A0A0A;` with `#FAF9F5` child cells.
  - Floating dialogs/popovers/dropdowns: `border: 2px solid #0A0A0A`, `background: #FAF9F5`, `box-shadow: 4px 4px 0px #0A0A0A`.
- **Shell & Responsive Drawer:**
  - Desktop (`>=1024px`): Fixed `232px` left sidebar (`bg-[#EAE8E3] border-r-2 border-[#0A0A0A]`), `56px` topbar (`bg-[#F4F4F0] border-b-2 border-[#0A0A0A]`), and `<main>` canvas owning the single page gutter (`px-8 py-6` on desktop, `px-6 py-5` on tablet, `px-4 py-4` on phone).
  - Mobile/Tablet (`<1024px`): Sidebar folds into an accessible Radix `Dialog` drawer triggered from a labelled button in `Topbar.tsx`, with Escape/backdrop dismissal and focus return.
  - Route wrappers: Remove redundant `p-6 max-w-7xl mx-auto` padding inside route components so all modules align to the same left and right edges of `<main>`.
- **Consistent Module Header Pattern:**
  - Every module page opens with a unified **Blueprint Header Block** (`border-b-2 border-[#0A0A0A] pb-4 mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4`):
    - Left: Monospace breadcrumb/module code (`MODULES // [NAME]`), `h1` title (`24px` bold Neo-Grotesque), and `13px` muted operational subtitle.
    - Right: Mechanical segmented Entity Switcher (`ATA | LTA | ALL` with `1px solid #0A0A0A` frame and `#0A0A0A` active fill) + primary action button(s).
- **Consistent Inner Tabs Across All Modules:**
  - Standardize `<TabsList>` and `<TabsTrigger>` in `frontend/src/components/ui/tabs.tsx` and across `operations`, `billing`, `disbursements`, `transmittals`, `documents`, `reports`, `admin`, and `clients`:
    - Track (`TabsList`): Full-width architectural strip (`w-full justify-start rounded-none bg-[#EAE8E3] p-0 border border-[#0A0A0A] border-b-2 flex flex-nowrap overflow-x-auto h-auto gap-0`).
    - Trigger (`TabsTrigger`): `rounded-none px-4 py-2.5 text-xs font-mono font-semibold tracking-wider border-r border-[#C8C5BC] text-[#4A4945] hover:bg-[#E4E2DC] hover:text-[#0A0A0A] data-[state=active]:bg-[#0A0A0A] data-[state=active]:text-[#FAF9F5] data-[state=active]:shadow-[inset_0_-3px_0_0_#E61919] transition-colors shrink-0`.
    - Badges inside triggers: Square monospace counters (`px-1.5 py-0 text-[12px] font-mono rounded-none border`).

---

## 4. Reworked Reports Module Specification (`routes/reports.tsx` & `features/reports/*`)

1. **Unified Header & 5-Tab Architectural Strip (`routes/reports.tsx`):**
   - Preserve RBAC (`users:manage` / Admin check, `reports:view`, `billing:view`), URL `?tab=` synchronization (`overview` / `analytics` alias, `daily`, `weekly`, `monthly`, `aging`), entity switcher (`data-testid="entity-switcher"`, `entity-btn-ata`, `entity-btn-lta`, `entity-btn-all`), and all `data-testid="tab-trigger-*"` attributes.
   - Replace the old unstyled underline tab list with the unified Swiss Industrial architectural tab strip.
2. **Reworked `ReportToolbar.tsx`:**
   - Render as a recessed mechanical command strip (`bg-[#EAE8E3] border border-[#0A0A0A] p-3 rounded-none shadow-none flex flex-wrap items-center justify-between gap-3`), grouping date/week/month selectors and scope indicators on the left and action buttons (`Export CSV`, `Print Report`, `Refresh`) on the right.
3. **Reworked `ReportSummaryBand.tsx` & `ReportSummaryCard`:**
   - Render summary bands as a **1px-divided Blueprint Telemetry Matrix** (`bg-[#0A0A0A] border border-[#0A0A0A] gap-px rounded-none`), where each `ReportSummaryCard` is a crisp `#FAF9F5` compartment (`p-4 rounded-none border-0 shadow-none`) with a `12px` `JetBrains Mono` uppercase label, `24px` tabular figure in `#0A0A0A`, and a `3px` top hazard bar (`border-t-4 border-t-[#E61919] bg-[#FCE8E8]/30`) when `attention={true}`.
4. **Reworked `ReportSection.tsx` & `ReportTableContainer.tsx`:**
   - `ReportSection`: Crisp `#FAF9F5` blueprint container (`border border-[#0A0A0A] rounded-none shadow-none`), with an `#EAE8E3` header bar (`border-b border-[#0A0A0A] px-4 py-3`), monospace count badge (`data-testid="${dataTestId || 'section'}-badge"`), and collapsible trigger.
   - `ReportTableContainer`: Square-cornered table frame (`border border-[#0A0A0A] bg-[#FAF9F5] rounded-none overflow-x-auto`) with `#EAE8E3` headers, `1px solid #C8C5BC` row dividers, and right-aligned `tabular-nums` financial/count columns.
5. **Reworked `AnalyticsOverviewTab.tsx`:**
   - Single-entity view: P&L Summary blueprint strip (`summary-billed`, `summary-collected`, `summary-outstanding`, `summary-net-income`) + bordered Supporting Expenses readout bar; 6-column divided Record Totals matrix (`analytics-kpi-grid`); 3-column architectural Status Breakdown compartments (`analytics-bento-grid`) using sharp rectangular progress meters (`h-2.5 bg-[#EAE8E3] border border-[#0A0A0A]/40 rounded-none` with `#0A0A0A` / `#E61919` fill) instead of rounded blue pills.
   - Consolidated (`ALL`) view (`consolidated-analytics-view`): Structured multi-entity comparison ledgers (`ATA` | `LTA` | `Combined`) with bold `#EAE8E3` net-income/summary rows and clear entity headers.
6. **Reworked `DailyActivityTab.tsx`, `WeeklySummaryTab.tsx`, `MonthlyPendingTab.tsx`:**
   - Interactive blueprint summary cards that scroll to collapsible `ReportSection` ledger tables; unified date/week/month controls in `ReportToolbar`.
7. **Reworked `AgingReportTab.tsx` (in both `features/reports` and `features/billing`):**
   - Headline Outstanding Balance ledger block (`kpi-grand-total`) + 6-column interactive Aging Bucket matrix (`aging-bucket-strip`: `bucket-btn-all`, `kpi-current`, `kpi-1-30`, `kpi-31-60`, `kpi-61-90`, `kpi-90-plus`) with `0px` corners, `aria-pressed`, and `#0A0A0A` / `#E61919` active framing; integrated filter/search summary bar (`aging-filter-summary`); and print-ready AR aging table.
