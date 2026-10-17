---
id: P2
phase: 2
depends_on: [P1, P0-H]
touches: [enterprise-v2 worktree frontend/, docs/enterprise-migration/ (module checklists)]
status: pending
---

# P2 — Module-by-Module React Migration Playbook

## 1. Mission

Migrate the application to React **one module at a time**, each against its frozen P0-H contract, in pain-first order. This file is the **playbook every module's build follows** plus the per-module specs. A module is "done" only when its parity checklist and its new-feature checklist both pass on the v2 staging preview.

## 2. Frozen Module Order & Rationale

| # | Module | Why here | Contract gate |
| :-: | :--- | :--- | :--- |
| 1 | **Operations** (work requests, tasks, kanban, phases, QA, transition requests, documents inline) | ~70% of UAT pain; hardest UI; stress-tests the design system earliest | operations@2.0.0 |
| 2 | **Dashboard widgets** (time-log quick-add + notification bell list) | Depends on tasks existing in React; high daily-touch value | time-entries@2.0.0, notifications@2.0.0 |
| 3 | **Billing** (incl. print-layout editable modal, client-address edit) | Financial CRUD + PDF preview; moderate complexity | billing@2.0.0 |
| 4 | **Disbursements** (create-for-all + approval queue UI) | Approval UX mirrors Operations patterns — reuse components | disbursements@2.0.0 |
| 5 | **Transmittals** (kanban + PDF preview) | Simplest kanban; reuses Operations board | transmittals@2.0.0 |
| 6 | **Admin/Users** (incl. retainer template builder) | Permission-heavy; safe once `usePermission` battle-tested | rbac-matrix + retainers@2.0.0 |
| 7 | **Reports + Documents (DMS)** | Read-mostly; last because lowest risk | frozen at their turn (incremental freeze) |

## 3. The Playbook (run per module, in order)

**Step 0 — Gate check.** Contract doc for the module exists, version-stamped, and cited (`module@2.0.0`) in the PR description. No contract → stop.

**Step 1 — Types.** Hand-write TS types from the contract doc (not from backend code). Generate request/response Zod schemas client-side for runtime validation of API responses in dev mode.

**Step 2 — Data layer.** TanStack Query hooks per contract: `use<Module>List`, `use<Module>Detail`, mutations with **optimistic-update policy = none** (blocking modal → success → invalidate, mirroring the "blocking archive/restore flow" doctrine from memory `blocking-archive-restore-flow-plan`). Centralized `queryClient.invalidateQueries` map.

**Step 3 — Pages & parity.** Port the module's current feature set first (see per-module §4 parity checklist), permission-gated via `usePermission`. Visual design follows P1 tokens; interactions follow Shadcn idioms.

**Step 4 — New features.** Layer UAT-driven features (per-module §4 "New" list) on top of parity.

**Step 5 — Verification.** Module vitest suite (hooks, guards, form state) + the module's **Manual QA script** (written into the PR — the list a human clicks through on the v2 preview).

**Step 6 — Flag on.** Enable in `ENABLED_MODULES` behind the same PR that passes review; demo to user on staging preview.

## 4. Per-Module Specs

### 4.1 Operations (module #1)

**Parity checklist:** WR list (filters/pagination/search), WR create/edit modal, kanban board (drag-and-drop with backend `board_order`), task CRUD, assignee/co-assignee assignment, document upload + inline preview + comments (DMS-backed, see memory `work-request-document-comments-table-view-fix`), archive/cancel/restore with blocking modal flow, pending-approvals inbox with rejection reason + edit-and-resubmit.

**New (UAT):**
- **Phase kanban**: columns = phases; phase header shows gate progress (`n/m tasks completed`); tasks render inside their phase zone; drag-and-drop allowed **within** a phase's status swimlanes only — cross-phase drops are impossible in the UI (not just rejected after the fact).
- **Phase footer actions:** Manager sees `Notify Admin — ready for review` (creates transition request; disabled with tooltip showing which gate tasks are incomplete); Admin sees `Advance`/`QA Review`/`Reroute` per guards.
- **QA column UX:** per-task compliance controls (pass/fail), failed count badge, reroute dialog requires reason + lists failed tasks being reopened.
- **Delimiter input:** task title/description fields show "Paste a list — we'll split it" hint; client-side preview of the tokenization (read-only chips) before submit; server remains source of truth.
- **Assigner UX:** co-assignee dropdown excludes already-selected employees; `Assign all` button; assignees display `assigned_by`/`assigned_at` attribution.
- **Retainer generate entry point:** generate-from-template action (manager-visible per `retainers:use`) with `period_label` prompt for annual templates.

**Manual QA script skeleton:** create WR (both phase-fill modes) → complete pre-processing → manager notify → admin approve → processing → QA with one fail → reroute → fix → pass → completion. Each step asserts notification arrival for the right role.

### 4.2 Dashboard widgets (module #2)

- **Log-time widget:** task picker scoped to assigned tasks (`timelog:create` scope), date (default today), duration quick-chips (15/30/60/custom minutes), note field; list of today's entries from `/v1/time-entries/summary`; edit-in-place for own entries.
- **Optional timer toggle:** start/stop that duration-stamps into the same POST (materializes an entry) — include only if it adds ≤1 day; otherwise defer silently (v1.1).
- **Notification bell panel:** unread-first list, deep-link per payload ids to the module route, mark-read on open, mark-all; badge from `/v1/me.unread_notifications` (30s staleTime polling is fine — no websockets).

### 4.3 Billing (module #3)

Parity + **print-layout preview modal**: opens the exact print HTML in a modal (view ≠ print action); fields editable inline for holders of `billing:edit`, client address editable only with `billing:edit_client_address` — save flows through the contract's update endpoint with field-scoped guard respected (P0-G §3.2).

### 4.4 Disbursements (module #4)

Parity + create-for-all UX (any employee sees New Disbursement) + **Admin approval queue** view (Pending list, approve/reject-with-reason dialog — reason required, mirrors transition-reject UX from Operations for consistency).

### 4.5 Transmittals (module #5)

Parity (kanban + `board_order` drag persists) + PDF preview reflecting the backend blank-space fix (item rows only, no empty slots — verify against the independently-shipped backend fix).

### 4.6 Admin/Users (module #6)

Parity + retainer template builder (Admin, `retainers:edit`): item rows with phase selector; recurrence toggle (`none|annual`); generation log view (`retainer_template_generations`).

### 4.7 Reports + DMS (module #7)

Pure parity port. Documents keep existing upload/preview/comments behavior via DMS endpoints.

## 5. Global React Rules

- R1. Contracts are law: if reality drifts from the frozen doc, stop and file it — never code against drift.
- R2. No optimistic writes (blocking-flow doctrine) anywhere in v2.
- R3. Every mutation error surfaces the backend `code`/`detail` verbatim in the error modal — no generic "Something went wrong".
- R4. No feature enters `ENABLED_MODULES` without its Manual QA script executed on staging preview and pasted into the PR.
- R5. RBAC UI = display gating only; server guards remain the enforcement (never trust the UI as security evidence in review).

## 6. Explicit Non-Goals

- ❌ Reordering modules without user approval (order is frozen §2).
- ❌ Feature invention beyond §4 lists — new ideas go to the post-cutover backlog.
- ❌ Backend changes from frontend agents (file a gap note instead).

## 7. Handoff

Module completion flips P3's readiness rows. Final module merge unlocks cutover rehearsal.

## 8. References

Vault master spec §2.7 · all P0 specs · memories: `blocking-archive-restore-flow-plan`, `work-request-document-upload-preview-plan-2026-07-22`, `billing-disbursement-transmittal-routing-drag-drop-2026-07-22`.
