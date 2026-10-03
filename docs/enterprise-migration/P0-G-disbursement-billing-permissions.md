---
id: P0-G
phase: 0
depends_on: [P0-A]
touches: [backend/src/modules/disbursements/, backend/src/modules/billing/, backend/tests/]
status: pending
---

# P0-G — Disbursement Approval Widening + Billing Client-Address Permission

## 1. Mission

Wire the two UAT-driven financial permission changes into route enforcement: **(1)** every employee can create disbursements, which land in `Pending` until an Admin approves; **(2)** Accounting (+Management/Admin) can edit the client address on billing records. Done = gates hold server-side with tests; creation flow untouched otherwise.

## 2. Ground Truth

- P0-A grants `disbursement:create` to all departments, adds `disbursement:approve` (Admin only), adds `billing:edit_client_address` (Accounting/Management/Admin).
- Disbursement statuses exist: `Draft, Pending, Approved, Released, Funded, Rejected, Cancelled` (migration 000031) — the approval vocabulary already exists; this parcel enforces transitions, not new states.
- Disbursements module already has routing/`pendingChanges` lineage (memory `billing-disbursement-transmittal-routing-drag-drop-2026-07-22`); reuse existing approve/reject plumbing where present — verify in `modules/disbursements/` first.
- Client address source of truth: verify whether billing reads address from `clients` vs. an invoice snapshot column. **Record which in the PR; the edit target is the billing record's address field** (per UAT: accounting edits it *in billing*), without mutating the client master record.

## 3. Contract

### 3.1 Disbursement

- `POST /v1/disbursements` (verify path): allowed for `disbursement:create` (now everyone); created record forced to `status='Pending'` regardless of submitted status (400 if client submits any other status — keep API honest).
- Approve/reject endpoints (reuse existing routes if present, else add):
  - `POST /v1/disbursements/:id/approve` — `disbursement:approve` (Admin); only from `Pending`; sets `Approved`.
  - `POST /v1/disbursements/:id/reject` — same guard; body `{ reason }` (required); sets `Rejected` + stores reason.
- On approve/reject resolution: emit `pending_request.resolved` (P0-B) to the creator with `{ table_name: 'disbursements', outcome, reason? }`.

### 3.2 Billing

- Billing update endpoint(s) that carry the address field require `billing:edit_client_address` **when the payload touches the address field** (field-scoped guard: if only non-address fields change, existing `billing:edit` suffices; if address present, require the new key).
- Address change writes an audit row (`billing.update` already audited — ensure field-level before/after captured; extend audit detail if currently shallow).

## 4. Rules

- R1. No user can create a disbursement in a status other than `Pending`.
- R2. Approve/reject only from `Pending` (409 otherwise); reason mandatory on reject.
- R3. `disbursement:approve` cannot be held by any non-Admin role (defense-in-depth test even though P0-A map guarantees it).
- R4. Address edits never write back to the `clients` master record.
- R5. Notification emission exactly-once, non-blocking (P0-B R3 semantics).
- R6. Existing released/funded flows (mark_released, funded columns from migration 031) untouched.

## 5. Acceptance Criteria

- AC-1: HR/Operations/Documentation staff create → 201 with `Pending`; Management/Accounting unchanged behavior.
- AC-2: staff `POST :id/approve` → 403; Admin → 200; approve from `Approved` → 409.
- AC-3: reject without reason → 400; with reason → 200, reason persisted, creator received `pending_request.resolved` notification with the reason.
- AC-4: Accounting PATCH address → 200 + audit shows field-level change; Operations PATCH address → 403; same PATCH by Operations without address field → 200.
- AC-5 (R4): after address edit, `clients` row byte-identical.

## 6. Tests Required

`backend/tests/disbursements.approval.spec.js` (AC-1..AC-3) · `backend/tests/billing.address.spec.js` (AC-4..AC-5) — extend, don't replace, existing module suites.

## 7. Explicit Non-Goals

- ❌ No changes to creation persistence patterns (archive/transmittal patterns frozen by prior handoffs — don't regress them).
- ❌ No React work; print-layout editable modal is P2 Billing.
- ❌ No disbursement workflow changes beyond the Pending-gate (no multi-step chains).
- ❌ No email notification.

## 8. Working Constraints

Branch `feat/p0-g-financial-permissions`. If existing approve/reject routes already exist with different semantics (released-vs-approved lineage), prefer extending them and document the reconciliation in the PR — do not create parallel routes.

## 9. Handoff

Produces: frozen financial-permission contract for P0-H; notify events wired (proves P0-B in production code path before P0-D lands).

## 10. References

Vault master spec §2.6 · memories `billing-disbursement-transmittal-pattern-todo-2026-07-20`, `production-hardening-phase2-3-2026-09-14` (R-series guards — keep green).
