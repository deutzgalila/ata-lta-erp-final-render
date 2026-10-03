# Work Requests Phase Model & Migrations Contract

> **Owner**: Worker-MIGRATE (Parcel P0-C)  
> **Status**: Frozen (Wave 2)  
> **Date**: 2026-10-03  
> **Target Audience**: Parcel P0-D (Operations Rework), Parcel P0-F (Time Entries), Parcel P0-H (Contract Freeze), Parcel P3 (Cutover)

---

## 1. Overview & Architectural Context

Parcel P0-C promotes the legacy flat work request status model into a structured 4-phase lifecycle model at the **data layer**:
1. **Pre-processing (`pre_processing`)**: Intake, initial checklist setup, and prerequisite assignments.
2. **Processing (`processing`)**: Execution of core operational work across tasks.
3. **Quality Assurance (`quality_assurance`)**: Compliance and review gating.
4. **Completion (`completion`)**: Billing, disbursements, client handoff, and archiving.

Terminal state:
- **`Cancelled`**: Work request was cancelled; `phase` remains `NULL` permanently.

To guarantee zero downtime and continuous backwards compatibility during development and deployment:
- Database CHECK constraints are implemented as a **superset** preserving all 10 legacy statuses.
- Phase columns are nullable initially; `NOT NULL` is enforced only in the P3 cutover rehearsal/production window via Migration C (`000054_phase_not_null.js`).
- Data backfill is implemented as an explicit, human-invoked CLI script (`backend/scripts/backfill-phases.js`) that runs at cutover (P3), not during normal staging builds.

---

## 2. Database Schema Specifications

### 2.1 Table: `work_requests` Additions

| Column | Type | Default | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `phase` | `text` | `NULL` | `CHECK (phase IS NULL OR phase IN ('pre_processing', 'processing', 'quality_assurance', 'completion'))` | Lifecycle phase |
| `phase_entered_at` | `timestamptz` | `now()` | — | Timestamp when current phase was entered |
| `on_hold` | `boolean` | `false` | `NOT NULL` | Operational hold flag |

#### Indexes
- `idx_work_requests_phase`: `CREATE INDEX IF NOT EXISTS idx_work_requests_phase ON work_requests(phase)`
- `idx_work_requests_on_hold`: `CREATE INDEX IF NOT EXISTS idx_work_requests_on_hold ON work_requests(on_hold) WHERE on_hold = true`

### 2.2 Table: `tasks` Additions

| Column | Type | Default | Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `phase` | `text` | `NULL` | `CHECK (phase IS NULL OR phase IN ('pre_processing', 'processing'))` | Phase locking; tasks only accept pre_processing or processing |
| `qa_status` | `text` | `'none'` | `NOT NULL, CHECK (qa_status IN ('none', 'passed', 'failed'))` | Task QA review outcome |
| `assigned_by` | `uuid` | `NULL` | `REFERENCES users(id) ON DELETE SET NULL` | Attribution of user who assigned primary worker |
| `assigned_at` | `timestamptz` | `now()` | — | Timestamp when primary worker was assigned |

#### Indexes
- `idx_tasks_phase`: `CREATE INDEX IF NOT EXISTS idx_tasks_phase ON tasks(phase)`
- `idx_tasks_qa_status`: `CREATE INDEX IF NOT EXISTS idx_tasks_qa_status ON tasks(qa_status)`

### 2.3 Table: `task_assignees` (New Join Table)

Enables multi-assignee tracking per task with attribution for downstream parcels P0-D and P0-F.

```sql
CREATE TABLE IF NOT EXISTS task_assignees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_task_assignees_task_user UNIQUE (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_assignees_task_id ON task_assignees(task_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user_id ON task_assignees(user_id);
```

---

## 3. Status Constraint Superset Discipline

Migration B (`000053_status_constraint_superset.js`) replaces `chk_work_requests_status` with a comprehensive superset:

```sql
ALTER TABLE work_requests
  DROP CONSTRAINT IF EXISTS chk_work_requests_status,
  ADD CONSTRAINT chk_work_requests_status
  CHECK (status IN (
    'Draft',
    'Pre-processing',
    'In Progress',
    'Processing',
    'For Review',
    'Quality Assurance',
    'Billing',
    'Disbursement',
    'On Hold',
    'Completed',
    'Cancelled'
  ));
```

This preserves:
- All 10 legacy statuses: `'Draft'`, `'Pre-processing'`, `'In Progress'`, `'Processing'`, `'For Review'`, `'Billing'`, `'Disbursement'`, `'On Hold'`, `'Completed'`, `'Cancelled'`.
- The new workflow status: `'Quality Assurance'`.

---

## 4. Cutover Backfill Specification (`backend/scripts/backfill-phases.js`)

### 4.1 CLI Interface

```bash
# Preview changes without modifying database (default)
node backend/scripts/backfill-phases.js --dry-run

# Commit changes inside an atomic transaction
node backend/scripts/backfill-phases.js --apply --report ./backfill-report.json
```

| Flag | Type | Default | Description |
| :--- | :---: | :---: | :--- |
| `--dry-run` | boolean | `true` | Analyzes candidate rows, counts buckets, prints SQL plan, 0 DB mutations. |
| `--apply` | boolean | `false` | Executes updates inside `BEGIN ... COMMIT` and writes report file. |
| `--env <env>` | string | `local` | Target environment (`local`, `staging`, `prod`). |
| `--report <path>` | string | `./backfill-report.json` | Report output JSON path. |

### 4.2 Status to Phase Mapping Matrix (Decision D6)

| Legacy `status` | Target `phase` | Target `on_hold` | Task Phase | Notes |
| :--- | :---: | :---: | :---: | :--- |
| `Draft`, `Pre-processing` | `pre_processing` | `false` | `pre_processing` | Initial workflow phase |
| `In Progress`, `Processing` | `processing` | `false` | `processing` | Execution phase |
| `For Review`, `Quality Assurance` | `quality_assurance` | `false` | `processing` | Task phase clamped to `processing` |
| `Billing`, `Disbursement`, `Completed` | `completion` | `false` | `processing` | Task phase clamped to `processing` |
| `Cancelled` | **`NULL`** | `false` | **`NULL`** | Terminal state; row and tasks untouched |
| `On Hold` (history found) | *Recovered Phase* | **`true`** | Inherited (clamped) | Prior status recovered from `status_history` / `audit_logs` |
| `On Hold` (no history) | `pre_processing` | **`true`** | `pre_processing` | Logged to `ambiguous_inventory` for Admin review |

### 4.3 Task Phase Clamping

Tasks only support phases `'pre_processing'` and `'processing'`:
- If WR maps to `'pre_processing'` → child tasks map to `'pre_processing'`.
- If WR maps to `'processing'` → child tasks map to `'processing'`.
- If WR maps to `'quality_assurance'` → child tasks clamped to `'processing'`.
- If WR maps to `'completion'` → child tasks clamped to `'processing'`.
- If WR is `'Cancelled'` → child tasks remain `phase = NULL`.
- `tasks.qa_status` defaults to `'none'`.

### 4.4 Idempotency Guarantee (Rule R4)

The backfill candidate query filters:
```sql
SELECT id FROM work_requests WHERE phase IS NULL AND status != 'Cancelled';
```
- First run (`--apply`): Updates all unmapped active work requests.
- Second run (`--apply`): Candidate query returns 0 rows; reports 0 mutations.

---

## 5. Downstream Consumer Contracts

### 5.1 Parcel P0-D (Operations Phase-Routing Rework)
- Reads and updates `work_requests.phase`, `work_requests.phase_entered_at`, and `work_requests.on_hold`.
- Validates phase advancement through state machine:
  `pre_processing` → `processing` → `quality_assurance` → `completion`.
- Reads and updates `tasks.phase` and `tasks.qa_status` (`none`, `passed`, `failed`).
- Populates `task_assignees` with `(task_id, user_id, assigned_by, assigned_at)`.

### 5.2 Parcel P0-F (Time Entries Module)
- Foreign keys link to `tasks(id)`.
- Validates that caller logging time entries is registered in `task_assignees` or `tasks.assignee_id`.

### 5.3 Parcel P3 (Cutover Runbook)
1. Run `node backend/scripts/backfill-phases.js --dry-run` and review bucket summary.
2. Run `node backend/scripts/backfill-phases.js --apply --report ./cutover-report.json`.
3. Verify ambiguous inventory reported.
4. Execute Migration C (`000054_phase_not_null.js`) to enforce NOT NULL constraint.
