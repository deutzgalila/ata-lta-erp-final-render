# Project: Wave 2 ATA-LTA ERP Migration (P0-B, P0-C, P0-G)

## Architecture
Wave 2 executes three core backend parcels in parallel off `staging`, followed by multi-agent adversarial verification:
1. **Parcel P0-B (Notifications Module):** In-app notification engine with dedicated PostgreSQL table, bulk notification dispatch helper (`notify()`), user-scoped queries, idempotent read tracking, and `/v1/me` unread counter.
2. **Parcel P0-C (Status Unification & Data Migration):** Schema evolution from 10 legacy statuses to unified 6-phase model via superset CHECK constraints; idempotency-guaranteed backfill CLI script (`backend/scripts/backfill-phases.js`); preservation of terminal `Cancelled` WRs; audit recovery for `On Hold`.
3. **Parcel P0-G (Disbursement Approvals & Client Field-Level Security):** Dynamic staff disbursement pending routing; Admin-only approval gate (`POST :id/approve`); mandatory-reason rejection with in-app notification; field-level security for invoice client address updates without mutating `clients` master record.

```
                  ┌───────────────────────┐
                  │    staging branch     │
                  └──────────┬────────────┘
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  Track 1: P0-B  │ │  Track 2: P0-C  │ │  Track 3: P0-G  │
│ feat/p0-b-notif │ │ feat/p0-c-phase │ │ feat/p0-g-fin   │
│ Notifications   │ │ Migrations &    │ │ Disbursements   │
│ Module          │ │ Backfill CLI    │ │ & Billing FLS   │
└────────┬────────┘ └────────┬────────┘ └────────┬────────┘
         └───────────────────┼───────────────────┘
                             ▼
                  ┌───────────────────────┐
                  │ Adversarial Gates:    │
                  │ Critic, Challenger,   │
                  │ Forensic Auditor,     │
                  │ Success Auditor       │
                  └──────────┬────────────┘
                             ▼
                  ┌───────────────────────┐
                  │ PR Packaging &        │
                  │ Sentinel Report       │
                  └───────────────────────┘
```

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Notifications DDL & Indexes | Create `notifications` table, CHECK constraint on 4 frozen types, partial unread index, composite cursor index | M1 (P0-B) | P0-B Spec §3.1 |
| 2 | Notify Service Helper | `notify(userIds, type, payload)` validating types, error suppression/logging (AC-3), bulk insert | M1 (P0-B) | P0-B Spec §3.2 |
| 3 | Notifications REST API | `GET /v1/notifications`, `POST /v1/notifications/:id/read`, `POST /v1/notifications/read-all` guarded by `notifications:view` | M1 (P0-B) | P0-B Spec §3.3 |
| 4 | `/v1/me` Unread Counter | Add `unread_notifications: <int>` to `/v1/me` response via partial index query | M1 (P0-B) | P0-B Spec §3.3 |
| 5 | Phase Model Columns Migration | Add `phase`, `phase_entered_at`, `assigned_by`, `assigned_at` to schema; create `task_assignees` table | M2 (P0-C) | P0-C Spec §3.1 |
| 6 | Superset Constraint Migration | Broaden `work_requests.status` CHECK to superset (10 legacy + Quality Assurance) | M2 (P0-C) | P0-C Spec §3.2 |
| 7 | Cutover Migration C Design | Migration C (`phase_not_null`) isolated for P3 cutover only | M2 (P0-C) | P0-C Spec §3.3 |
| 8 | Backfill Phases Script | CLI `backend/scripts/backfill-phases.js` with `--dry-run` and `--apply`, mapping table, transaction safety | M2 (P0-C) | P0-C Spec §4 |
| 9 | Idempotency & History Recovery | Double-run zero mutations; preserve Cancelled; recover On Hold via `status_history`/`audit_logs`; log ambiguous | M2 (P0-C) | P0-C Spec §4.2 |
| 10 | Dynamic Disbursement Status | HR/Ops/Docs staff create disbursement -> 201 `Pending`; Mgmt/Acct/Admin create -> 201 `Draft`; reject client status forgery | M3 (P0-G) | P0-G Spec §3.1 |
| 11 | Admin Approval Gate | `POST /v1/disbursements/:id/approve` requires `disbursement:approve` (Staff 403, Admin 200, Approved->Approved 409) | M3 (P0-G) | P0-G Spec §3.2 |
| 12 | Disbursement Rejection Flow | `POST /v1/disbursements/:id/reject` requires mandatory reason (400 if empty), transitions only from Pending (409), emits notification | M3 (P0-G) | P0-G Spec §3.2 |
| 13 | Billing Client-Address FLS | `PATCH /v1/invoices/:id` field-level security: address edit requires `billing:edit_client_address` (Acct 200, Ops 403, Ops w/o address 200) | M3 (P0-G) | P0-G Spec §3.3 |
| 14 | Client Row Immutability & Audit | Invoice address edit persists to billing record without mutating `clients` master row; audit log records field diff | M3 (P0-G) | P0-G Spec §3.3 |
| 15 | Adversarial Critic Review | Objective verification of R1–Rn adherence for P0-B, P0-C, P0-G | M4 (Audit) | 00-INDEX §5 |
| 16 | Adversarial Challenger Testing | Empirical challenge suites: status forgery, cross-user tampering, backfill idempotency | M4 (Audit) | ORIGINAL_REQUEST §4 |
| 17 | Forensic Integrity Audit | Static analysis and test run verification: authentic implementations, zero skipped/mocked tests | M4 (Audit) | ORIGINAL_REQUEST §4 |
| 18 | Success Acceptance Verification | End-to-end AC-1 through AC-5 validation for all three tracks | M4 (Audit) | ORIGINAL_REQUEST §4 |
| 19 | PR Packaging & Contract Sync | API contracts updated in `docs/api-contracts/`, `00-INDEX.md` status cells flipped to done | M5 (Ship) | ORIGINAL_REQUEST §5 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Parcel P0-B (Notifications) | Notifications module, notify helper, me unread counter, migration, tests | None | DONE |
| M2 | Parcel P0-C (Status Migrations) | Migrations A+B+C, backfill CLI script, idempotency, history recovery, tests | None | DONE |
| M3 | Parcel P0-G (Disbursements & FLS) | Disbursement approval/rejection, staff pending, billing FLS, client immutability, tests | None | DONE |
| M4 | Adversarial Verification Gates | Critic, Challenger, Forensic Auditor, Success Auditor | M1, M2, M3 | DONE |
| M5 | Packaging & Sentinel Handoff | PR formulating, contract sync, 00-INDEX.md update, Sentinel report | M4 | DONE |

## Interface Contracts

### P0-B ↔ P0-G (Notify Service)
- **Signature:** `notify(userIds: string[], type: string, payload: object): Promise<void>`
- **Frozen Types:**
  - `pending_request.resolved`: `{ request_id, table_name, outcome: 'approved'|'rejected', reason?, title }`
  - `wr.transition_request.received`: `{ request_id, work_request_id, wr_title, from_phase, to_phase, requested_by_name }`
  - `wr.transition_request.resolved`: `{ request_id, work_request_id, outcome, reason?, to_phase }`
  - `wr.qa_reroute`: `{ work_request_id, wr_title, to_phase, reason, failed_task_ids: [] }`
- **Error Behavior:** Any DB error inside `notify()` is caught and logged; it resolves cleanly and NEVER throws to the caller. Unknown type throws HTTP 400 AppError.
- **P0-G Fallback:** Since P0-B and P0-G are developed concurrently, P0-G uses a safe try/catch import of `backend/src/services/notify.js` with fallback mock/stub so tests remain independent.

### P0-C ↔ P0-D / Downstream (Database Schema)
- `work_requests.phase` is nullable text, constrained to `('intake', 'pre_processing', 'processing', 'review', 'quality_assurance', 'completed')`.
- `work_requests.status` CHECK constraint is a superset containing all 10 legacy values plus `'Quality Assurance'`.
- `tasks.assigned_by` (uuid) and `tasks.assigned_at` (timestamptz) added.
- `task_assignees` join table created: `(task_id uuid, user_id uuid, assigned_by uuid, assigned_at timestamptz)`.

### P0-G ↔ Downstream (Disbursements & Billing)
- `POST /v1/disbursements/:id/approve` (guard: `disbursement:approve`, Admin only).
- `POST /v1/disbursements/:id/reject` (guard: `disbursement:approve`, body: `{ reason: string }`).
- `PATCH /v1/invoices/:id` (field-level security: body with `address` requires `billing:edit_client_address`).

## Code Layout & Exclusive File Ownership

### Track 1: Worker-NOTIF (Parcel P0-B)
- **Branch:** `feat/p0-b-notifications` (off `staging`)
- **Exclusive Files:**
  - `backend/src/modules/notifications/` (`controller.js`, `routes.js`, `service.js`, `schema.js`, `README.md`)
  - `backend/src/services/notify.js`
  - `backend/src/modules/me/controller.js` (additive `unread_notifications`)
  - `backend/src/app.js` (route mounting `/v1/notifications`)
  - `backend/migrations/000051_create_notifications.js`
  - `backend/tests/notifications.spec.js`
  - `backend/tests/notify.service.spec.js`
  - `docs/api-contracts/notifications.md`

### Track 2: Worker-MIGRATE (Parcel P0-C)
- **Branch:** `feat/p0-c-phase-migrations` (off `staging`)
- **Exclusive Files:**
  - `backend/migrations/000052_phase_model_columns.js`
  - `backend/migrations/000053_status_constraint_superset.js`
  - `backend/migrations/000054_phase_not_null.js`
  - `backend/scripts/backfill-phases.js`
  - `backend/tests/migrations.phase-model.spec.js`
  - `backend/tests/backfill-phases.spec.js`
  - `docs/api-contracts/work-requests-phases.md`

### Track 3: Worker-FINPERM (Parcel P0-G)
- **Branch:** `feat/p0-g-financial-permissions` (off `staging`)
- **Exclusive Files:**
  - `backend/src/modules/disbursements/routes.js`
  - `backend/src/modules/disbursements/service.js`
  - `backend/src/modules/disbursements/schema.js`
  - `backend/src/modules/billing/routes.js`
  - `backend/src/modules/billing/service.js`
  - `backend/src/modules/billing/schema.js`
  - `backend/tests/disbursements.approval.spec.js`
  - `backend/tests/billing.address.spec.js`
  - `docs/api-contracts/disbursements.md`
  - `docs/api-contracts/billing.md`
