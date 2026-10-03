---
id: P0-F
phase: 0
depends_on: [P0-C]
touches: [backend/migrations/, backend/src/modules/timeEntries/ (new), backend/src/app.js, backend/tests/]
status: pending
---

# P0-F — Time Entries Module (Duration-Canonical)

## 1. Mission

Backend for the client's dashboard time-logging ask: staff log **duration entries** against tasks they are assigned to, multiple entries per day across tasks. Duration entries are canonical truth; any future timer UI merely materializes entries (v1.1+, not this parcel). Done = schema + scoped CRUD + per-day dashboard summary endpoint, all permission-gated by P0-A `timelog:*` keys.

## 2. Ground Truth

- Keys from P0-A: `timelog:view`/`timelog:create`/`timelog:edit_own` (all staff+Admin), `timelog:edit_all` (Admin).
- Task model stable after P0-C (`tasks.phase`, assignee join with attribution).
- Client scope rule (verbatim UAT): entries link to "tasks listed in work requests they are added and assigned to" → task must have the user as an assignee/co-assignee.
- No billable flag (firm bills retainers, not hours — D9). Entries feed future utilization/heatmap features (vault: `Resource Planning Core`, `Heat Map Implementation Spec`).

## 3. Contract

### 3.1 Migration — `NNNNNN_create_time_entries.js`

```sql
CREATE TABLE time_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id         uuid NOT NULL REFERENCES <tasks>(id) ON DELETE CASCADE,
  entry_date      date NOT NULL,
  duration_minutes int NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440),
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_time_entries_user_date ON time_entries(user_id, entry_date DESC);
CREATE INDEX idx_time_entries_task ON time_entries(task_id);
```

### 3.2 Endpoints (new module, mounted `/v1/time-entries`)

| Method | Path | Guard | Behavior |
| :--- | :--- | :--- | :--- |
| POST | `/v1/time-entries` | `timelog:create` | Body `{ task_id, entry_date, duration_minutes, note? }`; 403 if not assignee; 400 on future date |
| GET | `/v1/time-entries?from=&to=&task_id=` | `timelog:view` | Own entries only (Admin: all via `timelog:edit_all` — document decision) |
| PATCH | `/v1/time-entries/:id` | `timelog:edit_own` (Admin: `edit_all`) | Own entries only; sets `updated_at` |
| DELETE | `/v1/time-entries/:id` | same as PATCH | Hard delete own (Admin any) |
| GET | `/v1/time-entries/summary?date=` | `timelog:view` | `{ date, total_minutes, by_task: [{task_id, work_request_id, title, minutes}] }` — the React dashboard widget's single call |

## 4. Rules

- R1. Entry ownership enforced in queries by `req.user.id`; user_id never accepted from the client.
- R2. Assignee scope enforced at creation: task must have caller among assignees (verify join per P0-C attribution columns); 403 otherwise.
- R3. `entry_date` not in the future; `duration_minutes` 1–1440; multi-entries same day same task allowed (no uniqueness).
- R4. Edit/delete restricted to creator; Admin override via `timelog:edit_all`. No entry-locking in v1.
- R5. Summary endpoint is one indexed query (no N+1); include WR id + task title for widget display.
- R6. No notification events in v1 (not in the four frozen triggers).

## 5. Acceptance Criteria

- AC-1 (R1–R2): staff creates entry on assigned task → 201; on unassigned → 403; forged `user_id` ignored (entry belongs to caller).
- AC-2 (R3): future date → 400; 0/1500 minutes → 400; three entries same day same task → all 201.
- AC-3 (R4): coworker PATCH → 403; Admin PATCH → 200; own PATCH → 200.
- AC-4 (R5): summary aggregates correctly across 2 tasks/day; returns wr linkage + titles.

## 6. Tests Required

`backend/tests/time-entries.spec.js` — AC-1..AC-4 + pagination/date-range filter cases.

## 7. Explicit Non-Goals

- ❌ No start/stop timer logic, heartbeats, or sessions.
- ❌ No billable rates, invoicing linkage, or export (CSV export = post-cutover ask if raised).
- ❌ No vanilla UI; React widget is P2 Dashboard work.
- ❌ No admin dashboard/report endpoints beyond §3.2 (Heatmap spec is a separate future parcel).

## 8. Working Constraints

Branch `feat/p0-f-time-entries`. Follow `modules/operationsRequests` layout (controller/routes/service/schema). Update `docs/api-contracts/` in the same PR.

## 9. Handoff

Produces: frozen time-entry contract for P0-H; widget data source for P2 Dashboard; utilization dataset for future Resource Planning/Heatmap features.

## 10. References

Vault master spec §D9 · vault `Resource Planning Core` / `Heat Map Implementation Spec` · UAT story #1.
