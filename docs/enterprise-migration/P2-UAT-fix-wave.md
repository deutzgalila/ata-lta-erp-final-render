---
id: P2-UAT
phase: 2.5
depends_on: [P2]
touches: [enterprise-v2 worktree frontend/ (all modules), staging API redeploys only via separate approved parcel, docs/api-contracts/modules/clients.md (new)]
status: pending
version: 1.0
date: 2026-10-04
---

# P2-UAT — Post-Migration UAT Fix Wave

## 1. Mission

Close the bug/disparity list from the user's 2026-10-04 end-to-end pass of the merged v2 app (staging preview + localhost)**before** the P3 staging rehearsal (R1–R9) so rehearsal evidence reflects the real UI. Every fix is parity-driven: v2 must look and behave like `erp_prototype/` unless this document or a contract says otherwise. Done = every item in §4 has a merged PR with reproduction evidence + fix evidence, and the full vitest suite is green (including the previously-flaky disbursements AdminApprovalQueue test).

## 2. Ground Truth (verified 2026-10-04 against enterprise-v2 @45580147)

- Sidebar (`frontend/src/components/layout/Sidebar.tsx:27-69`) renders 8 nav items: dashboard, operations, billing, disbursements, transmittals, documents, reports, admin. **No Clients route/link exists** — `frontend/src/routes/` has no `clients.tsx`.
- Router in-app catch-all exists (`frontend/src/components/common/NotFound.tsx`, wired in `App.tsx`) — so "Not Found on refresh" is **server-side**: the Render static site has no SPA rewrite rule. Refreshing a deep link returns Render's own 404 before React boots.
- Entity switcher (`Topbar.tsx:24-60`) builds options as `[...entities, 'ALL']`, stores `activeEntity` in the session store; `lib/api.ts:83-95` sends `X-Active-Entity: <activeEntity>` on every request **including the literal value `ALL`** → backend scopes by it and the "All" view degenerates to ATA-only rows.
- Login page (`routes/login.tsx:128`) password input has no visibility toggle.
- Billing list gating (`features/billing/components/InvoiceList.tsx:79-82`): create action is gated on `billing:request`; edit on `billing:edit`; payments on `billing:payments`. Check against `docs/api-contracts/rbac-matrix.md` which roles hold `billing:request` — UAT expectation: an Operations-only user (no billing keys) must not even see create.
- Operations kanban (`PhaseKanbanBoard.tsx`): task cards are `draggable={canEdit}` (line 538) with DnD handlers at 158–189; no click-to-open task detail modal exists (line 390's onClick is not a task-detail opener).
- Dashboard feature has exactly four components (LogTimeWidget, NotificationBellPanel, TimeEntryEditModal, TimeEntryDeleteModal) — **no pending-tasks widget exists**.
- Print layouts: v2 `PrintPreviewModal` components were built fresh; parity source of truth is `erp_prototype/` print HTML for billing / disbursements / transmittals.
- Known flake carried in: `features/disbursements/__tests__/disbursementsUI.test.tsx › AdminApprovalQueue` fails in full-suite runs only (pre-existing post-#4/#5; single-file passes).

## 3. Rules for this wave

- **R1. Reproduce before fix.** Every item's PR must quote reproduction evidence (screenshot/console log) from the staging preview or localhost:8081 against the staging API. If it cannot be reproduced, state that and mark `cannot-reproduce — needs user re-check` instead of guessing.
- **R2. Contracts are law.** RBAC display keys must match `docs/api-contracts/rbac-matrix.md`; request/response shapes must match `docs/api-contracts/modules/*.md`. Drift → stop and file, never code against drift.
- **R3. Blocking-flow writes only** (no optimistic updates); mutation errors surface backend `code`/`detail` verbatim.
- **R4. RBAC UI = display gating only.** For the billing-create item, *additionally verify server-side* with curl: a user without the key must get 403 from the API. If the server allows it, that is a backend gap — STOP, gap-note it, do not attempt a backend change in these parcels.
- **R5. Backend freeze.** No `backend/` changes in any parcel below. Suspected backend roots (entity 'ALL' semantics, team auto-add, aging scoping) → write a GAP note (what, evidence, recommended server change) in the PR; they feed §7.
- **R6. No `Co-Authored-By` trailers on commits this wave** (user directive, supersedes the standing rule). PR descriptions still end with the Claude Code footer.
- **R7. File-ownership matrix (collision control).** Only the owning parcel may touch:
  - Parcel OPS: `features/operations/**`, `routes/operations.tsx`, plus **this wave only** `lib/api.ts` entity-header logic and `Topbar.tsx` entity switcher default (for GEN-1). Everyone else: hands off those two files.
  - Parcel FIN: `features/billing/**`, `features/disbursements/**`, `features/transmittals/**`, `routes/{billing,disbursements,transmittals}.tsx`.
  - Parcel SHELL: `routes/login.tsx`, `App.tsx`, `features/dashboard/**`, `features/documents/**`, styles/tokens.
  - Parcel CLI: `features/clients/**` (new), `routes/clients.tsx` (new), `Sidebar.tsx` (append Clients link), `lib/flags.ts` (append `'Clients'` — union rule), `docs/api-contracts/modules/clients.md` (new).
  - Any shared component from `features/operations/components/` is imported, never copied.
- **R8. flags.ts union rule** on every merge, as in the P2 wave (keep all existing entries).
- **R9. Print parity = port, not redesign.** Copy the prototype's print HTML structure/styling verbatim into the preview components; do not restyle.
- **R10. Tests:** each parcel runs typecheck / lint / vitest / build on its rebased tip and pastes exit codes; full-suite must be green including the previously flaky test (SHELL parcel owns stabilizing it).
- **R11. Role-accurate test accounts (user directive).** Reproduction and Manual QA MUST use the real role accounts on the **staging** API, not only the dev-* seeds. Account roster and the shared UAT password live in `backend/scripts/purge-and-provision-staging.js` (read locally — the accounts are already provisioned on staging): Admin `lorein@ata-lta.ph` · Managers `love@`, `lorena@`, `henry@` · Accounting `jen@`, `rachel@` · Operations `rea@`, `loida@`, `mg@`, `michelle@`, `ann@`, `rose@` · Documentation `twinkle@` (all `@ata-lta.ph`). Dev seeds (`dev-admin/docs/accs@ata-lta.ph`) remain available as fallback. Rules: never write any password into commits, PR bodies, QA tables, code, or screenshots; reference the script path instead. Tag any test data you create with an `UAT-` prefix so staging can be audited before the P3 rehearsal. Per-item role mapping: UAT-FIN1 log in as an Operations account · UAT-FIN3 as a Manager · UAT-OPS6 reproduce with a Manager creating a WR assigned to an Operations account (Admin `lorein@` observes the team side-effect) · UAT-GEN1 test with accounts spanning entities.

## 4. Work items (UAT-* ids are the ledger; map 1:1 into PR evidence)

### Parcel OPS — Operations (branch `fix/uat-operations`)

- **UAT-GEN1 "All" entity filter only shows ATA** (root verified §2): when `activeEntity === 'ALL'`, **omit** `X-Active-Entity` entirely (never send the literal); default selection stays user's primary entity. Verify against staging: All view then shows ATA+LTA rows. Also fixes retainer-template aggregation in All view (same root).
- **UAT-OPS1 Draft restore in WR-create flow doesn't work.** Reproduce in vanilla → implement parity.
- **UAT-OPS2 Restore in Operations archive doesn't work.** (Cross-check against the blocking archive/restore doctrine: blocking modal → success → invalidate; verify mutation actually fires and list generation refreshes.)
- **UAT-OPS3 WR edit not persisting**: editing a work request "goes through" but fields/assignee changes are not reflected. Trace the update payload (assignee changes must map to the contract's assignee/co-assignee update semantics from operations@2.0.0 §3.8); fix submit mapping + invalidation.
- **UAT-OPS4 Task cards not clickable.** Add a Task Detail modal (view/parity with vanilla task view): description/requirements, linked documents (reuse Operations document components by import), time logged + a log-time entry point (reuse Dashboard's LogTimeWidget logic or extract shared component), status display. Read-only status changes unless a contract endpoint covers them — gap-note if vanilla allowed edits the contract doesn't.
- **UAT-OPS5 Task cards must not be draggable.** Remove DnD from `PhaseKanbanBoard` (draggable=false; strip handlers or disable behind a flag defaulting off) — product decision from UAT, supersedes the P2 §4.1 drag design note and the §4.5 kanban-drag parity for Operations only (Transmittals keeps drag unless UAT says otherwise).
- **UAT-OPS6 Manager-created WR auto-adds an employee to the team without Admin permission** (example: "lorien wong"). Likely a backend side-effect of WR create/assign. Investigate: capture request/response + DB-level evidence; if server-side, GAP note (R5); if frontend calls something extra, remove it.
- **UAT-GEN2 Side peek/side view missing (only mid view available).** Vanilla lists had a side-peek panel; reproduce in `erp_prototype`, implement parity side-peek for Operations work-request list (other modules may follow in §7 backlog if UAT wants).

### Parcel FIN — Financial modules (branch `fix/uat-financials`)

- **UAT-FIN1 Billing create visible to Operations users.** Root: gated on `billing:request` (`InvoiceList.tsx:80`). Align display gating with rbac-matrix expectations (Operations-only users hold no billing keys) AND curl-verify the server 403s a direct POST without the key (R4).
- **UAT-FIN2 Invoice number must be auto-generated, unique, and non-editable** (vanilla behavior; v2 create modal exposes an editable field). Follow billing@2.0.0: if the contract expects server-side numbering, drop the field from the form and display the server-returned number read-only; contract drift → stop and file.
- **UAT-FIN3 Aging report visible to managers not linked to those billings.** Determine intended scope (rbac-matrix + vanilla behavior). If scoping is server-side, GAP note (R5); if a filter param the frontend should pass, fix it.
- **UAT-FIN4 Invoice views not syncing across tabs/views.** Centralize billing queryKeys invalidation (mutations invalidate list+detail+aging together) per the playbook data-layer rule.
- **UAT-FIN5 Billing print layout must match prototype** (see R9).
- **UAT-FIN6 Disbursements: no Archive tab.** Add parity archive tab with the blocking restore flow.
- **UAT-FIN7 Disbursement create: "Link work request" and Client must be dropdowns**, populated from existing contract list endpoints (operations WR list, clients list), not free-text.
- **UAT-FIN8 Disbursements + Transmittals print layouts must match prototype** (R9).
- **UAT-FIN9 Kanban/table uniformity**: Billing and Disbursements list UX adopts the Transmittals module's kanban/table switcher pattern (one shared component extracted under a neutral shared location, imported by all three — not copies).

### Parcel SHELL — Shell, Dashboard, Documents (branch `fix/uat-shell`)

- **UAT-SH1 Login password visibility toggle** (eye icon) — vanilla parity.
- **UAT-SH2 Refresh shows "Not Found"**: confirm `App.tsx` catch-all works; document the required Render static-site rewrite rule `/* → /index.html` (user infra action, §6) — once infra lands, deep-link refresh must boot the SPA at the route.
- **UAT-SH3 Black screen on normal/hard refresh**: investigate boot path (theme init, Suspense fallback, auth bootstrap flash); ensure a styled loading state, never a raw black viewport.
- **UAT-SH4 Dashboard: add Pending Tasks section** — assigned-to-me tasks not Complete (operations contract list with assignee scope + status filter; reuse existing hooks where possible).
- **UAT-SH5 Documents page styling:** bring to design-system tokens (off-palette/dark ad-hoc styling removed), consistent with other modules.
- **UAT-SH6 Fix the flaky `disbursementsUI.test.tsx › AdminApprovalQueue` full-suite failure** (isolate session store per test; reference commit 8fe7d8a7's approach). Gate: full suite green 3 consecutive runs.

### Parcel CLI — Clients module addendum (branch `feat/p2-clients`)

- **UAT-CL1 Contract snapshot first:** derive `docs/api-contracts/modules/clients.md` @2.0.0 from the actual `backend/src/modules/clients/` routes (same freeze methodology as the #7 freeze; snapshot, no redesign). Include in the same PR, clearly headed.
- **UAT-CL2 Clients list parity**: sidebar link, `/clients` route, list + detail + create/edit exactly as vanilla `erp_prototype` exposes, permission-gated per rbac-matrix keys for clients.
- **UAT-CL3** flags.ts union adds `'Clients'`; Sidebar entry appended (R7 ownership).

## 5. Acceptance criteria

- AC-1: every UAT-* item has a linked PR with reproduction evidence + post-fix evidence on the staging preview URL (`https://ata-lta-erp-spa-v2.onrender.com`).
- AC-2: full `npm test` green on enterprise-v2 tip after all parcels merge (including UAT-SH6's flake fix); typecheck/lint/build exit 0.
- AC-3: curl proof attached for the two RBAC-sensitive items (billing create 403 for keyless user; manager aging-scope behavior documented/fixed or gap-noted).
- AC-4: no `backend/` diffs in any parcel; every suspected backend root has a GAP note feeding §7.
- AC-5: zero `Co-Authored-By` trailers across the wave's commits (R6).

## 6. Infra dependency (user)

Render static site `ata-lta-erp-spa-v2` → **Redirects/Rewrites** → add rule: Source `/*`, Destination `/index.html`, Action **Rewrite**. (Fixes UAT-SH2; re-test UAT-SH3 after.)

## 7. Deferred (post-wave)

Backend parcel `fix/uat-backend-gaps` (entity-'ALL' semantics if server-side, team auto-add, aging scoping) — dispatched only after GAP notes are reviewed and approved by the user. Side-peek extension to other modules if UAT requests.

## 8. References

UAT list (user, 2026-10-04) · P2 playbook rules R1–R5 (carried) · memories `p2-complete-p3-cutover-next-2026-10-04`, `p2-modules-1-through-6-merged-2026-10-04` (flake) · `erp_prototype/` (parity reference for print layouts, side peek, drafts, restore, eye toggle).
