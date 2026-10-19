# Feature Preservation & Acceptance Gates (Brutalist UI Redesign)

- **Original Base Commit:** `0c61395` (`brutalist-ui`)
- **Dedicated Specification Branch:** `design/brutalist-ui-spec-20261019`
- **Dedicated Implementation Branch:** `redesign/brutalist-ui-gemini-20261019`
- **Bridged Execution Engine:** `agy` CLI running `gemini-3.8-flash-high` with `--effort high` and custom subagents (`brutalist-tokens-primitives`, `brutalist-reports-rework`, `brutalist-modules-consistency`, `brutalist-qa-verifier`).

---

## 1. Non-Regression Functional Contract

| Module / Area | Protected Capabilities & Test Contracts |
|---|---|
| **Auth & Shell** | Login form (`login-email`, `login-password`, `login-submit`, `password-toggle-btn` with `tabIndex={0}`), dev seed quick-fill buttons, entity switcher (`entity-switcher`), notification bell panel, user menu, sign-out (`header-signout-btn`, `sign-out-button`), permission-filtered sidebar nav (`nav-item-*`), and `<1024px` Radix Dialog mobile drawer. |
| **Dashboard** | Welcome/workspace header, 4 overview stat cards (`stat-role`, `stat-entity`, `stat-unread-count`, `stat-today-hours`), `PendingTasksCard`, `LogTimeWidget`, and realtime CDC subscriptions. |
| **Clients** | Active/Archived inner tabs, search & retainer filters (`ClientFilterBar`), `ClientTable`, `ClientDetailModal`, `ClientModal`, affiliate relations, and blocking archive/unarchive flows. |
| **Operations** | Consistent inner tabs (`work-requests`, `retainer-templates`, `other-templates`, `pending-approvals`, `archive`), List/Kanban view toggle, `PhaseKanbanBoard`, `WorkRequestList`, `WorkRequestSidePeek`, `TaskDetailModal`, 4-phase gates, QA/reroute/reject modals, template modals, and `BlockingActionModal`. |
| **Billing** | Consistent inner tabs (`invoices`, `aging`, `archive`), `InvoiceList`, `InvoiceCreateModal`, `InvoiceDetailModal`, `RecordPaymentModal`, `PrintPreviewModal` (print template preserved), and `AgingReportTab`. |
| **Disbursements** | Blueprint KPI strip (`kpi-active-count`, `kpi-awaiting-release-count`, `kpi-rejected-count`, `kpi-archived-count`), consistent inner tabs (`all`, `drafts`, `pending-approvals`, `approved`, `released`, `funded`, `rejected`, `archive`), `DisbursementsTable`, `AdminApprovalQueue`, `CreateDisbursementModal`, and `DisbursementDetailDrawer`. |
| **Transmittals** | Blueprint KPI strip, consistent inner tabs (`active`, `archived`) with Kanban/Table toggle, `TransmittalKanbanBoard`, `TransmittalTable`, `TransmittalFormModal`, `TransmittalDetailModal`, `TransmittalPrintModal` (print layout preserved), and action dialogs. |
| **Documents (DMS)** | Consistent inner tabs (`tab-active-documents`, `tab-archived-documents`), `DocumentFilterBar`, `DocumentTable`, `DocumentUploadModal`, `DocumentLifecycleModal`, and `DocumentViewerModal`. |
| **Reports (Reworked)** | Reworked Swiss Industrial Telemetry layout across all 5 tabs (`overview`, `daily`, `weekly`, `monthly`, `aging`), preserving `ReportScopePrompt` when `activeEntity === 'ALL'` on detail tabs, consolidated `ALL` tables on Overview, date/week/month shifters, aging bucket filters (`aria-pressed`), CSV export, and `@media print` header/table rules. |
| **Admin & Profile** | Consistent inner tabs in `AdminTabs` (`users`, `permissions`, `retainers`, `generations`), user modals, `PermissionsMatrixView`, `RetainerTemplateList`, `RetainerGenerationLogs`, and `ProfileDetailsCard` / `ProfilePasswordCard` / `ProfilePreferencesCard`. |

---

## 2. Verification Gates

1. **Baseline Recording:** Record `npm run typecheck`, `npm run build`, `npm test`, and `npm run lint` at `0c61395` before any implementation edits.
2. **Delegated Execution via `agy` Custom Subagents (`gemini-3.8-flash-high`, `--effort high`):**
   - Execute implementation in isolated worktree `/tmp/ata-lta-brutalist-redesign` on branch `redesign/brutalist-ui-gemini-20261019` using `agy --model gemini-3.8-flash-high --effort high --agent <custom-subagent>` and stream NDJSON logs for live monitoring.
3. **Zero Regression Verification:**
   - `npm run typecheck` passes with 0 errors.
   - `npm run build` succeeds.
   - `npm test` passes all 141 test files (2,099 tests), updating only visual class string expectations where tests assert specific old Tailwind classes.
   - `npm run lint` introduces 0 new errors or warnings relative to baseline.
   - No modifications to `erp_prototype/` or `backend/`.
