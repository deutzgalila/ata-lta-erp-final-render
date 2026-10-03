---
id: P0-C
phase: 0
depends_on: [P0-A]
touches: [backend/migrations/, backend/scripts/ (backfill), backend/tests/]
status: pending
---

# P0-C — Phase Model Migrations + Legacy Backfill

## 1. Mission

Promote the flat WR status model into the phase model at the **data layer**: add `phase`/`on_hold` to work-requests, `phase`/`qa_status` (+assignment attribution) to tasks, all under **superset constraints** so the currently-deployed API keeps running against the migrated schema. Ship a dry-run-capable, idempotent backfill script that will execute at cutover (P3) — not now.

## 2. Ground Truth

- Current CHECK constraints (migrations `000031_concurrency_schema_hardening.js`, `000034`, `000036`):
  - `work_requests.status ∈ ('Draft','Pre-processing','In Progress','Processing','For Review','Billing','Disbursement','On Hold','Completed','Cancelled')`
  - `tasks.status ∈ ('Draft','Assigned','In Progress','For Review','Completed','Cancelled')`
  - `operations_requests.status ∈ ('pending','fulfilled','rejected','cancelled')`
- **Verify before writing:** actual table names (`work_requests`? `tasks`? assignee join table name) — grep `backend/migrations/*.js`. The spec below assumes those names; adjust to verified reality and record adjustments in the PR description.
- Convention: numbered `backend/migrations/NNNNNN_name.js` (node-pg-migrate); remote runner `scripts/migrate-remote.js`.

## 3. Contract

### 3.1 Migration A — `NNNNNN_phase_model_columns.js`

```sql
ALTER TABLE work_requests ADD COLUMN phase text
  CHECK (phase IN ('pre_processing','processing','quality_assurance','completion'));
ALTER TABLE work_requests ADD COLUMN on_hold boolean NOT NULL DEFAULT false;

ALTER TABLE tasks ADD COLUMN phase text
  CHECK (phase IN ('pre_processing','processing'));
ALTER TABLE tasks ADD COLUMN qa_status text NOT NULL DEFAULT 'none'
  CHECK (qa_status IN ('none','passed','failed'));
ALTER TABLE <task_assignee_join> ADD COLUMN assigned_by uuid REFERENCES users(id);
ALTER TABLE <task_assignee_join> ADD COLUMN assigned_at timestamptz DEFAULT now();
```

`phase` columns nullable on create; NOT NULL enforced only by Migration C **after** backfill.

### 3.2 Migration B — `NNNNNN_status_constraint_superset.js`

Rewrites the `work_requests.status` CHECK to the **union** of legacy values and nothing removed. (The new model reads `phase`; `status` remains for legacy reads and rollback safety.) If the new flow needs additional status strings (decided in P0-D), they are added here as a superset — old values never removed during the window.

### 3.3 Backfill script — `backend/scripts/backfill-phases.js`

Flags: `--dry-run` (default ON unless `--apply`), `--env staging|prod`, `--report <path>`.

Mapping (locked by D6):

| Legacy `status` | → `phase` | `on_hold` |
| :--- | :--- | :--- |
| `Draft`, `Pre-processing` | `pre_processing` | false |
| `In Progress`, `Processing` | `processing` | false |
| `For Review` | `quality_assurance` | false |
| `Billing`, `Disbursement`, `Completed` | `completion` | false |
| `Cancelled` | leave `phase` NULL (terminal) | false |
| `On Hold` | map by the WR's last non-hold status if recoverable, else `pre_processing` | **true** |

Tasks: inherit parent WR's mapped phase (`'quality_assurance'`/`'completion'`parents → tasks `phase='processing'` since tasks only get pre_processing|processing). Existing `qa_status` stays `'none'`.

### 3.4 Migration C — `NNNNNN_phase_not_null.js`

`SET NOT NULL` on `work_requests.phase` for non-cancelled rows + `tasks.phase`. Runs **only in the cutover rehearsal/prod window** (P3), never as part of normal staging cadence — document this in its header comment.

## 4. Rules

- R1. Every migration is idempotent where PG allows (`IF NOT EXISTS`, guarded constraint drops), matching `000031`'s idempotent style.
- R2. Superset discipline: the deployed API (pre-rework) must pass its full test suite against the schema AFTER migrations A+B. Prove it in CI/test run against a migrated scratch DB.
- R3. Backfill is a script, NOT a migration — human-invoked at cutover with `--dry-run` first and a written row-count report per mapping bucket.
- R4. Backfill idempotent: second run changes zero rows (`WHERE phase IS NULL` guards).
- R5. `Cancelled` WRs and their tasks are never phase-touched.
- R6. No endpoint/service code changes in this parcel.

## 5. Acceptance Criteria

- AC-1 (R1,R2): migrations A+B apply cleanly up/down on scratch; full existing Jest suite passes against the migrated scratch DB.
- AC-2 (R3): `--dry-run` prints per-bucket counts and SQL plan without writing; `--apply` writes and logs every mapped row to the report file.
- AC-3 (R4): apply ×2 → second run reports 0 mutations.
- AC-4 (R5): seeded Cancelled WR unchanged after apply.
- AC-5: report includes unmapped/ambiguous inventory (the `On Hold`-without-history bucket) with row ids for admin review.

## 6. Tests Required

- `backend/tests/migrations.phase-model.spec.js` — scratch-DB apply + suite-green gate (AC-1).
- `backend/tests/backfill-phases.spec.js` — mapping unit tests per bucket + idempotency + cancelled-exclusion.

## 7. Explicit Non-Goals

- ❌ Do not run backfill against staging/prod — that is P3, with dry-run sign-off.
- ❌ No API behavior changes, no phase-transition logic (P0-D).
- ❌ Do not drop or rename the legacy `status` column or any legacy CHECK value.
- ❌ No NOT NULL enforcement ahead of cutover (Migration C excluded from normal runs).

## 8. Working Constraints

Branch `feat/p0-c-phase-migrations`. Coordinate with P0-D: it consumes these columns immediately; column names in §3.1 are frozen — renaming them breaks two parcels.

## 9. Handoff

Produces: migrated schema + backfill script (executed in P3) + the frozen column vocabulary for P0-D (`phase`, `qa_status`, `on_hold`, `assigned_by/assigned_at`) and P0-F (task linkage).

## 10. References

Vault master spec §2.4 (mapping table = D6) · memory `workflow-routing-task-drag-drop-rbac-analysis` · migrations 000031/000034/000036.
