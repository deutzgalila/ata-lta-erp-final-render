# Pull Request: P2 Module #2 — Dashboard Widgets & Notifications

## Summary

Implements **Module #2 — Dashboard Widgets** per `docs/enterprise-migration/P2-module-migration-playbook.md` §3 and §4.2 against the frozen API contracts:
- `time-entries@2.0.0` (`docs/api-contracts/modules/time-entries.md`)
- `notifications@2.0.0` (`docs/api-contracts/modules/notifications.md`)

Zero backend changes made. Zero `any` types. Zero optimistic updates (strict blocking modal workflow with verbatim RFC 7807 error surfacing).

---

## 1. Frozen Contract Citations & Gates (Step 0)

| Contract | Frozen Version | Contract Document Path | Status |
| :--- | :--- | :--- | :--- |
| **Time Entries** | `2.0.0` | [`docs/api-contracts/modules/time-entries.md`](file:///home/javvii/FreelanceProject/ata-lta-erp-v2/docs/api-contracts/modules/time-entries.md) | Verified — Zero Drift |
| **Notifications** | `2.0.0` | [`docs/api-contracts/modules/notifications.md`](file:///home/javvii/FreelanceProject/ata-lta-erp-v2/docs/api-contracts/modules/notifications.md) | Verified — Zero Drift |

---

## 2. Feature Implementation (Step 3 & Step 4)

### A. Log-Time Widget (`LogTimeWidget.tsx`)
- **Task Picker:** Scoped to tasks assigned to current authenticated user (`timelog:create` scope). For Admin/Managing Partner with `timelog:edit_all`, all active tasks across both entities are selectable. Staging fixture task `dfd6d8fd-e4f0-42eb-8a34-c12cdcb6cb2e` ("Gather BIR Form 2307 — SMOKE P0-D B battery") is populated.
- **Work Date:** Defaults to today (`YYYY-MM-DD`); future date selection blocked both via HTML `max` attribute and Zod validation.
- **Duration Quick-Chips:** 15m, 30m, 60m, 2h quick chips with active highlighting, plus numeric manual duration input (1–1440 mins).
- **Optional Timer Toggle:** Real-time elapsed duration stopwatch with Start/Stop & Fill toggle and Reset button. Automatically fills elapsed minutes into the duration input upon stopping.
- **Note Field:** Multi-line textarea bounded by Zod schema (max 5,000 characters).
- **Aggregated Daily Summary:** Consumes `GET /time-entries/summary?date=YYYY-MM-DD` and renders today's total time header badge and task-by-task breakdown cards.
- **Entries List & In-Place Actions:** Renders individual entries for the selected date. Enforces RBAC display rules:
  - Staff / Docs user: Can edit and delete their own entries only (`TimeEntryEditModal` and `TimeEntryDeleteModal`). Coworker entries render read-only.
  - Admin / Managing Partner (`timelog:edit_all`): Can edit and delete any entry across the organization.

### B. Notification Bell Panel (`NotificationBellPanel.tsx` mounted in `Topbar.tsx`)
- **Unread Badge:** Displays unread notification count badge in topbar, synchronized with session store and `/me.unread_notifications`.
- **Background Polling:** TanStack Query polling every 30 seconds (`refetchInterval: 30000`, no websockets).
- **Flyout Panel:** Accessible dropdown panel with "All" and "Unread" filter tabs.
- **Unread-First Sorting:** Unread notifications sort to the top, then ordered newest first by `created_at`.
- **4 Event Types Supported:**
  1. `wr.transition_request.received`: Blue icon, deep-links to `/operations?tab=pending-approvals`.
  2. `wr.transition_request.resolved`: Green check / red X, deep-links to `/operations?tab=work-requests&view=board&wrId=<id>`.
  3. `pending_request.resolved`: Purple wallet/receipt, deep-links to `/disbursements` or `/billing`.
  4. `wr.qa_reroute`: Amber warning, deep-links to `/operations?tab=work-requests&view=board&wrId=<id>`.
- **Mark as Read:** Clicking a notification marks it read via `POST /notifications/:id/read` and decrements the badge before deep-linking.
- **Mark All as Read:** Dedicated header action invoking `POST /notifications/read-all` and clearing the badge to 0.

### C. Module Enablement (Step 6)
- Enabled `'Dashboard'` in `ENABLED_MODULES` in [`frontend/src/lib/flags.ts`](file:///home/javvii/FreelanceProject/ata-lta-erp-v2/frontend/src/lib/flags.ts).
- Updated tracker row in [`docs/enterprise-migration/00-INDEX.md`](file:///home/javvii/FreelanceProject/ata-lta-erp-v2/docs/enterprise-migration/00-INDEX.md).

---

## 3. Toolchain & Test Suite Evidence (Step 5)

All gates pass with zero errors, zero warnings:

- **Typecheck:** `npm run typecheck` (`tsc --noEmit`) -> **0 errors**.
- **Lint:** `npm run lint` (`eslint src`) -> **0 errors, 0 warnings**.
- **Automated Tests:** `npm test -- --run` -> **441 / 441 passing (26 test files)**:
  - `src/features/dashboard/__tests__/timeEntries.test.tsx` (9/9 pass)
  - `src/features/dashboard/__tests__/notifications.test.tsx` (8/8 pass)
  - `src/features/dashboard/__tests__/dashboardWidgets.test.tsx` (7/7 pass)
  - `src/features/dashboard/__tests__/dashboardAdversarial.test.tsx` (8/8 pass)
  - Operations test suites (409/409 pass)
- **Production Build:** `npm run build` -> **Built in 4.82s**:
  - `dist/assets/dashboard-BJo1HHla.js`: 29.19 kB (gzip: 7.76 kB)
  - `dist/assets/operations-B27rLaOX.js`: 119.70 kB (gzip: 26.99 kB)
  - `dist/assets/index-aquH7ekW.js`: 498.57 kB (gzip: 149.35 kB)
  - `dist/assets/index-D_RG2x_o.css`: 54.79 kB (gzip: 10.56 kB)

---

## 4. Manual QA Verification Table (Step 4 & Playbook R4)

Executed live against staging backend (`https://ata-lta-erp-api-staging.onrender.com/v1`) via preview server on port 8081:

| Step # | Action / Test Case | Role / User | Expected Outcome | Actual Observed Result | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **QA-1** | Log in as Manager | `dev-docs@ata-lta.ph` | Authenticates, navigates to `/dashboard`, shows welcome banner | Authenticated; user "Dev Documentation" with role "Manager" displayed | **PASS** |
| **QA-2** | Verify assigned task picker | Manager | Displays assigned tasks only; includes fixture `dfd6d8fd-e4f0-42eb-8a34-c12cdcb6cb2e` | Dropdown populated with `[ATA] Gather BIR Form 2307 — SMOKE P0-D B battery` | **PASS** |
| **QA-3** | Duration chips & timer toggle | Manager | Clicking chips sets 15/30/60/120m; timer counts and fills elapsed duration | 30m, 60m, 120m chips confirmed; timer ran 1.2s and filled duration cleanly | **PASS** |
| **QA-4** | Log working time (Create) | Manager | BlockingActionModal executes; entry appears in list; today's total increments | Entry created; total time incremented from `1h 45m` to `2h 0m`; count went from 3 to 4 | **PASS** |
| **QA-5** | Edit time entry in place | Manager | `TimeEntryEditModal` opens; updates duration and note; BlockingActionModal succeeds | Updated from 15m to 45m; note updated; total time updated to `2h 30m` | **PASS** |
| **QA-6** | Delete time entry | Manager | `TimeEntryDeleteModal` opens; confirms deletion; entry removed; total time decrements | Entry removed from database and list; total hours decremented back to `1h 45m` | **PASS** |
| **QA-7** | Notification bell panel | Manager | Flyout opens; unread badge matches `/me.unread_notifications` (1); unread-first sort | Bell panel opened; badge "1" displayed; 2 notifications listed with unread at top | **PASS** |
| **QA-8** | Filter tabs & Mark all read | Manager | Tabs filter All (2) vs Unread (1); Mark all read clears unread state | "All (2)" and "Unread (1)" filter correctly; "Mark all read" clicked; badge cleared | **PASS** |
| **QA-9** | Deep-link navigation | Manager | Clicking notification navigates to payload target URL | Navigated to `/operations?tab=work-requests&view=board&wrId=706e7c4f-16ab-4901-92dc-d7d97060366f` | **PASS** |

---

## 5. Visual Artifacts & Screenshots

### Screenshot 08: Dashboard Log-Time Widget & Live Aggregation
Captured on preview port 8081 with duration quick-chips, live timer, and today's logged time breakdown:
`frontend/screenshots/08-dashboard-time-widget.png`

### Screenshot 09: Notification Bell Panel & Unread Flyout
Captured on preview port 8081 displaying notification bell dropdown, unread count badge, filter tabs, and action cards:
`frontend/screenshots/09-notification-bell-panel.png`
