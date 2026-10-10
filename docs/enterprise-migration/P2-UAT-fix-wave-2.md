---
id: P2-UAT-2
phase: 2.5
depends_on: [P2-UAT]
touches: [enterprise-v2 frontend/ (operations, billing, disbursements, transmittals, documents, shell), backend/ (W2-BE parcel only, user-approved), docs/api-contracts/ (contract amendments)]
status: pending
version: 1.0
date: 2026-10-05
---

# P2-UAT-2 — Second UAT Fix Wave (Linkage, Assignee Lifecycle, Audit Trail)

## 1. Mission

Address the user's 2026-10-05 UAT findings (15 items) against the merged wave-1 baseline
(`enterprise-v2 @ea5e97f8`). Theme: cross-module **linkage** (billing/disbursement/transmittal
↔ WR tasks), the **assignee task lifecycle** (status updates, assignment-in-detail,
quick-add), **entity 'ALL' correctness**, and **admin audit visibility**. Done = all items in
§4 merged with reproduction + fix evidence, full suite green, and — for UAT2-9/12/13/15 —
the backend parcel W2-BE deployed to the staging API with contract docs updated.

## 2. Ground Truth (verified 2026-10-05)

- Wave-1's GEN1 fix (omit `X-Active-Entity` when 'ALL') is live but insufficient — list hooks
  across modules can still carry their own entity scoping; a cross-module audit is required
  (UAT2-1).
- `Sidebar.tsx` nav order: Dashboard → Operations → … → Admin; Clients link is not adjacent
  to Dashboard (UAT2-2).
- Transmittal print (wave-1 `TransmittalPrintModal`) ported prototype layout but kept the
  prototype's extra empty item row; backend already renders item-rows-only (UAT2-3).
- Admin pending approvals inbox (`features/operations/components/PendingApprovalsInbox.tsx`)
  renders request summaries; manager-created WRs and full assignee detail (with names) are
  not guaranteed present (UAT2-4).
- Work request side peek (`WorkRequestSidePeek.tsx`, wave-1) renders assignee/team fields;
  display shows raw UUIDs when name fields aren't selected/joined (UAT2-5).
- Billing create modal has client + work-request dropdowns but **no task link** field
  (UAT2-6); disbursement create accepts manual WR id typing from wave-1 dropdown work
  (UAT2-12 demands WR dropdown → client auto-detect + task dropdown).
- Task detail modal (wave-1 `TaskDetailModal.tsx`) lacks: linked-records section (UAT2-7),
  assign-employee control (UAT2-8), documents view/upload (UAT2-11). Phase kanban columns
  lack quick-add (UAT2-10).
- **Backend:** `backend/src/modules/operations/routes.js:94-211` guards task mutations with
  `requirePermission('workflow:edit')` — assignees (no workflow keys) get 403
  `"One of permissions [workflow:edit] is required"` on status updates (UAT2-9 — user-visible
  verbatim). Contract `operations@2.0.0` has no assignee status path.
- **Backend:** modules list = admin auth billing clients disbursements documents me
  notifications operations operationsRequests reports timeEntries — **no audit module/route**;
  v2 Admin feature (`features/admin/components/index.ts`) exposes only
  `RetainerGenerationLogs` — nothing else renders as an audit trail (UAT2-15).
- Documents feature = DocumentFilterBar/DocumentTable/DocumentUploadModal/
  DocumentLifecycleModal; tab styling still off-palette; viewer small, no full-page mode
  (UAT2-14).

## 3. Rules (carried from wave 1, renumbered locally; deltas marked *)

R1 reproduce-first evidence · R2 contracts are law · R3 blocking-flow writes, verbatim
errors · R4 RBAC display-only gating + curl server verification where applicable · R5* zero
backend changes in frontend parcels — EXCEPT parcel W2-BE, which is the single authorized
backend parcel (dispatched only on the user's explicit approval of §5 amendments) · R6* **no
`Co-Authored-By` trailers this wave** (user directive, carried) · R7 ownership matrix (below)
· R8 flags union (n/a — no new modules) · R9 print = verbatim port minus the defects named in
the item · R10 gate: typecheck/lint/vitest/build exit codes + executed Manual QA on the
staging preview, pasted in PR · R11 role accounts (`backend/scripts/purge-and-provision-
staging.js`; never print the password; UAT- prefix on created data) — UAT2-9's reproduction
and post-fix proof MUST use an Operations account (rea@/mg@/michelle@ …) both times.

**R7 ownership (wave 2):**
- W2-ENTITY: `lib/api.ts`, `lib/session*`, and ONLY the entity-scoping lines of any
  `features/**/api/use*List` hook. Everyone else: do not touch entity semantics.
- W2-FIN: `features/{billing,disbursements,transmittals}/**` + their routes.
- W2-DOC: `features/documents/**`, `routes/documents.tsx`, `Sidebar.tsx` (one reorder line).
- W2-BE: `backend/**` on a `staging` branch, contract docs in the same PR.
- W2-OPS: `features/operations/**`, `routes/operations.tsx`. Financial modals are consumed
  **by import** from the FIN modules' `index.ts` (FIN's prefill-props API is the contract
  between parcels — do not modify FIN files).

## 4. Work items

### W2-ENTITY (branch `fix/uat2-entity`) — Track A, first

- **UAT2-1** Root-cause 'ALL' across modules: audit every list hook for explicit entity
  params/client-side filtering; guarantee `activeEntity === 'ALL'` ⇒ no entity scoping on any
  module list (Operations incl. retainer aggregation, Billing, Disbursements, Transmittals,
  Documents, Reports, Clients, Dashboard widgets). Reproduce first as cross-entity accounts
  (R11); evidence = before/after row counts per module.

### W2-FIN (branch `fix/uat2-financials`) — Track B, first

- **UAT2-3** Transmittal print = prototype layout 1:1, **minus** the extra empty item row
  (item-rows-only, matching the backend PDF behavior).
- **UAT2-6** Billing create gains an **optional WR-task link**: task dropdown populated from
  the selected WR's tasks (operations task list endpoint per contract); disabled/empty until
  a WR is chosen. Payload inclusion gated on W2-BE's `task_id` support — if the contract
  lacks it, the UI field ships hidden behind the API's actual acceptance (send only when
  supported; otherwise GAP-note forward).
- **UAT2-12** Disbursement create: remove the manual WR-id input entirely; WR dropdown →
  **client auto-detected** from the selected WR (read-only display, still submitted per
  contract); add WR-task dropdown same as billing.
- **UAT2-7-contract-side** Expose a prefill API on all three create modals:
  `prefill: { workRequestId?, taskId?, clientId? }` props + exported via each module's
  `index.ts`; prefilled fields locked where the linkage defines them (client from WR).
  This is W2-OPS's integration surface — freeze its shape in code comments and PR.

### W2-DOC (branch `fix/uat2-shell-documents`) — Track B, second

- **UAT2-2** Sidebar: move Clients directly under Dashboard.
- **UAT2-14** Documents module fully on design tokens (tab bar especially); document viewer
  enlarged + add **full-page view** mode (full-viewport overlay) for preview.

### W2-BE (branch `fix/uat2-backend`, off `staging`) — user-approved only

- **UAT2-9** Task status for assignees: task status PATCH guard becomes "caller is a task
  assignee (task_assignees) OR holds workflow:edit"; assignee transitions restricted to
  In Progress / Complete only (their current default state excluded); workflow:edit holders
  unchanged. Update operations contract doc + jest tests (employee 200 on own task, 403 on
  others' task; manager/admin unchanged).
- **UAT2-6/12-server** `invoices.task_id` (+ disbursements equivalent if required) nullable
  uuid column → tasks(id); create/update accept + validate task belongs to the invoice's WR
  when both provided; superset-safe migration on staging only (no prod); contract docs
  updated.
- **UAT2-15-server** Admin audit trail endpoint: investigate `modules/admin/`; add
  GET audit listing (module/action/actor/date filters + pagination) over the audit tables
  P0 modules already write; contract doc `admin@2.0.0` amendment; jest tests.
- **UAT2-4-server** Manager-created WR admin visibility: trace creation → ensure an
  admin-visible pending approval exists (operationsRequests row or equivalent per routing
  contract), carrying full WR detail incl. assignees with display names; contract + tests.
- If W2-ENTITY finds a server-side root for 'ALL', fix here (contract doc updated).

### W2-OPS (branch `fix/uat2-operations`) — Track A, last (after FIN merged; QA of status
items after W2-BE is deployed to staging)

- **UAT2-5** Side peek: resolve assignee/team names (use contract display fields per
  operations@2.0.0 §3.8 mirror; fallback = one user-directory lookup hook — no raw UUIDs
  anywhere in the view).
- **UAT2-4** Pending approvals: full WR detail in the admin inbox — title, client, entity,
  phases/tasks, assignees **by name**; consumes W2-BE's server completeness; if server piece
  not yet live, UI must already render completely for any request that does exist.
- **UAT2-7** TaskDetailModal "Linked records" section: create/link Billing, Disbursement,
  Transmittal from the task via FIN's exported prefill modals (permission-gated:
  `billing:edit`/`disbursements:*`/`transmittals:*` per rbac-matrix respectively); existing
  links listed with deep-links.
- **UAT2-8** Assign-employee control in TaskDetailModal for Admin/workflow holders (dropdown
  excludes current assignees; uses the contract task-assignees update path) — covers
  template-generated WRs that start unassigned.
- **UAT2-10** Quick-add `(+)` button on both phase column headers (pre_processing,
  processing) → minimal task-create inline/modal pinned to that phase; gated to task-creation
  holders per contract.
- **UAT2-11** TaskDetailModal documents section: list + inline preview + upload for the
  task's DMS documents, importing the shared components (no copies).
- **UAT2-9-frontend** Task status controls for assignees: In Progress / Complete only,
  visible to assignees; until staging API deploys W2-BE the control must verify 403-free via
  the actual account (R11 evidence) — do not ship UI that errors.

## 5. Contract amendments requiring USER approval (dispatch gate for W2-BE)

1. Assignee task-status path (operations contract change).
2. `task_id` linkage column(s) on billing invoices (+ disbursements if implemented).
3. New admin audit-trail list endpoint.
4. Manager-created-WR → admin pending-approval routing semantics (behavior confirmation, not
   new surface).
5. (Conditional) server-side entity-'ALL' semantics.

## 6. Acceptance criteria

- AC-1: every UAT2-* item has PR evidence (reproduction + fix) on the staging preview; UAT2-9
  includes an Operations-account curl/UI proof (assignee completes own task) pre- and
  post-deploy.
- AC-2: full suite green on enterprise-v2 tip; backend jest suite green on staging for W2-BE.
- AC-3: contract docs updated in the same PRs that change behavior (staging), and synchronized
  into enterprise-v2 docs for frontend citation.
- AC-4: no `backend/` diffs outside W2-BE; no trailers per R6; R7 violations bounce at review.

## 7. Sequencing (2-agent parallel)

- **Track A (user's agent):** W2-ENTITY → [user approval gate] → W2-BE → W2-OPS.
- **Track B (teammate's agent, fork):** W2-FIN → W2-DOC.
- W2-OPS's linked-records integration requires W2-FIN merged; its assignee-status QA requires
  W2-BE deployed to the staging API (user's manual Render deploy of the staging service).
- Merge targets: FE parcels → `enterprise-v2`; W2-BE → `staging` (contract docs then synced
  into enterprise-v2).

## 8. References

User UAT findings 2026-10-05 · `P2-UAT-fix-wave.md` (wave 1 + R11 accounts) ·
`docs/api-contracts/modules/operations.md` §3.8 display mirror · memory
`uat-fix-wave-merged-2026-10-05` · `erp_prototype/` parity sources.
