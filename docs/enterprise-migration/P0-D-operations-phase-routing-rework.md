---
id: P0-D
phase: 0
depends_on: [P0-A, P0-B, P0-C]
touches: [backend/src/modules/operations/, backend/src/modules/operationsRequests/, backend/src/lib/ (tokenizer), backend/tests/]
status: pending
---

# P0-D — Operations Phase-Routing Rework (Program Flagship)

## 1. Mission

Rewrite the work-request creation and phase-routing pipeline onto the phase model, absorbing the UAT-discovered production bugs (D5) and delivering the client's exact ask: **Pre-processing → Processing → Quality Assurance → Completion**, phase-locked tasks, admin-gated advancement via manager transition requests, per-task QA compliance, and server-true rerouting. Done = the staging UAT failure modes are impossible by construction, and every routing rule is enforced server-side with tests.

## 2. Ground Truth

- Phase columns (`work_requests.phase/on_hold`, `tasks.phase/qa_status`) and superset constraints exist after P0-C. Task assignee attribution columns arrive with P0-C.
- Keys from P0-A: `workflow:phase_transition` (Admin), `workflow:transition_request` (Manager/Admin), `workflow:qa_review` (Admin).
- `notify()` helper + 4 frozen payload types from P0-B.
- **Bug fold-ins (root causes to kill by construction):**
  1. *`predecessor "0" invalid uuid`* — dependency field submits literal `"0"` when empty → validate: dependency must be a real task uuid of the same WR or absent (400 with field error).
  2. *Duplicate WR with task discrepancies on retry-after-error* — creation was non-transactional/non-idempotent → one DB transaction + client-supplied `Idempotency-Key` honored by existing `middleware/idempotency.js` on the create route.
  3. *Co-assignee not persisting* → join inserts inside the same transaction, awaited, covered by test.
  4. *Admin WR creation/approval 500s on main* → all known partial-failure paths collapsed by (1)–(3); route returns either 201 with full graph or 4xx/409, never 500 for validation faults.
- `operationsRequests` pipeline already implements `pending → fulfilled/rejected` + rejection reason + edit-and-resubmit semantics (recent staging commits) — the transition request rides it.
- Task statuses available: `Draft, Assigned, In Progress, For Review, Completed, Cancelled`.

## 3. Contract

### 3.1 Work-request create (rewritten) — `POST /v1/operations/work-requests` (verify actual path; adjust)

Request (additive vs. current body):

```json
{
  "idempotency_key": "uuid-from-client",
  "title": "…",
  "phases": {
    "pre_processing": { "tasks": [ { "title": "…", "description": "…",
        "assignees": ["uuid"], "depends_on": ["task-local-id"|null],
        "local_id": "t1" } ] },
    "processing":    { "tasks": [ /* may be empty array — fill later */ ] }
  }
}
```

- Delimiter rule (R4): any `title`/`description` string containing `, ; .` or newlines is **server-tokenized** into N sibling tasks; the submitted string is stored on the first created task's note field (audit trail), siblings get the tokenized titles. Tokenize on `[,;\n]` and `. ` (period+space) only when ≥2 tokens result; trim; drop empties; cap 50/request (400 beyond).
- Response 201: full WR graph (WR + phases + tasks + assignees) in one payload; 4xx for validation; 409 for idempotency replay (return original graph); never 500 for bad input.

### 3.2 Task phase-lock guards

- Tasks get `phase` from their section at creation; `phase` is immutable thereafter (400 on attempt).
- A `processing` task cannot transition out of `Draft/Assigned` while any active (non-Cancelled) `pre_processing` task of the same WR is not `Completed` → 409 `{ code: 'PHASE_PREREQUISITE' }`.

### 3.3 Transition request — new `operationsRequests` type

`POST /v1/operations-requests` body type: `{ request_type: 'wr_phase_transition', payload: { work_request_id, from_phase, to_phase } }`. Guards: requester holds `workflow:transition_request`; WR phase actually equals `from_phase`; gate check (3.4) passes. Emits `wr.transition_request.received` to all Admins.

Resolution (existing fulfill/reject route): on `fulfilled` → WR advances to `to_phase` in the same transaction + emit `wr.transition_request.resolved` (outcome approved) to requester. On `rejected` → reason required (already supported) + emit resolved (rejected) with reason.

### 3.4 Advancement gates (server truth)

| Transition | Gate |
| :--- | :--- |
| pre_processing → processing | Every active pre_processing task `Completed` |
| processing → quality_assurance | Every active processing task `Completed` |
| quality_assurance → completion | Every active task (both phases) `Completed` **and** `qa_status='passed'` |
| any → completion direct | 409 (no skipping) |

`Cancelled` tasks excluded from gates. Admin may also advance directly (`workflow:phase_transition`, `POST .../work-requests/:id/advance`) — request path preferred for audit parity; direct advance emits the same resolved notification with `{via:'direct'}` noted in payload ext (additive, document it).

### 3.5 QA review — `POST /v1/operations/work-requests/:id/qa-review`

Admin (`workflow:qa_review`), WR in `quality_assurance`. Body: `{ results: [ { task_id, qa_status: 'passed'|'failed' } ] }`. Sets `qa_status` per task (transaction), audit row.

### 3.6 Reroute — `POST /v1/operations/work-requests/:id/reroute`

Admin. Body `{ to_phase: 'pre_processing'|'processing', reason: string (required) }`, WR in `quality_assurance`. Transaction: WR.phase := to_phase; tasks with `qa_status='failed'` → `status='In Progress'`, `qa_status='none'`; passed/other tasks untouched; audit entry with reason; emit `wr.qa_reroute` to assignees of failed tasks + requester context per P0-B payload.

### 3.7 Attribution

Every assignee row written with `assigned_by = req.user.id`, `assigned_at = now()` (columns from P0-C). List/detail endpoints include assignees with attribution (additive response fields).

## 4. Rules

- R1. WR creation is a single transaction; any failure rolls back the entire graph (kills dup-on-retry & task discrepancies).
- R2. `Idempotency-Key` replay returns the original 201 graph with 409/200-per-existing-middleware semantics — verify middleware behavior and document.
- R3. `depends_on` must reference a same-WR task by `local_id` resolved within the transaction; `"0"`, empty string, cross-WR id, or unknown local_id → 400 field error.
- R4. Tokenizer per §3.1; deterministic; unit-tested with the exact UAT delimiter set (`, ; .` newline).
- R5. Phase-lock: no endpoint can move a task across phases; no status mutation violates the prerequisite gate (§3.2).
- R6. All transitions/QA/reroute are Admin-resolved through the request pipeline; Manager/Manager-dept actors get 403 everywhere except creating transition requests.
- R7. All four notification emissions occur exactly once per event and inside/outside transactions as P0-B R3 dictates (notify may fire post-commit; never block the write).
- R8. Every mutation writes audit rows via the existing `audit()` middleware or explicit service audit writes — WR phase changes must appear in the audit log with before/after.

## 5. Acceptance Criteria

- AC-1 (R1–R3): recreate the three staging failures in tests: `"0"` dependency → 400; kill-transaction-midway retry with same key → single WR, identical task set; co-assignees present in 201 response and in DB.
- AC-2 (R4): tokenizer test matrix — 1/2/N tokens, mixed delimiters, >50 cap, no-token passthrough.
- AC-3 (R5): processing task advance attempt with open pre-processing tasks → 409 `PHASE_PREREQUISITE`; after completing them → succeeds.
- AC-4 (§3.4): each gate row has a test (pass + fail side).
- AC-5 (§3.6): reroute reopens exactly the failed set; passed tasks unchanged; notification fan-out asserted.
- AC-6 (R6): Manager POST advance → 403; Manager POST transition-request → 201; Admin resolve → WR advanced.
- AC-7 (R8): audit trail shows create, advance, qa-review, reroute with before/after.

## 6. Tests Required

`backend/tests/operations.phase-routing.spec.js` (gate matrix, transition pipeline, reroute, permissions) · `backend/tests/operations.create-rework.spec.js` (AC-1, AC-2, idempotency, transaction integrity) · extend existing operations/operationsRequests suites without breaking them.

## 7. Explicit Non-Goals

- ❌ No frontend/UI changes (React kanban/QA column is P2 spec'd separately).
- ❌ No rework of billing/disbursement linkage actions beyond keeping existing behavior green under superset constraints.
- ❌ No scheduler/auto-advance; Completion is always human-resolved.
- ❌ No changes to documents/DMS behavior (document upload pipeline documented in memory `work-request-document-upload-preview-plan-2026-07-22` stays as-is).
- ❌ Do not remove legacy `status` writes — keep writing status for vanilla compatibility until cutover (P3), phase is authoritative for new logic.

## 8. Working Constraints

Branch `feat/p0-d-phase-routing`. Largest parcel — split into 3 stacked PRs if reviewable chunks emerge: (1) create pipeline + tokenizer + idempotency, (2) phase guards + gates, (3) transition/QA/reroute + notifications. Each PR independently green.

## 9. Handoff

Produces: frozen Operations contract (→ P0-H), transition-request vocabulary reused by P0-E generation events if needed, task model stability unblocking P0-F, and the QA/reroute semantics the P2 React Operations build renders.

## 10. References

Vault master spec §2.4 · memories: `work-request-task-creation-fixes-2026-07-21` (partial fixes on uat — do NOT resurrect that code path), `workflow-routing-task-drag-drop-rbac-analysis` · UAT stories doc (pasted 2026-10-01, preserved in vault master spec Part 1).
