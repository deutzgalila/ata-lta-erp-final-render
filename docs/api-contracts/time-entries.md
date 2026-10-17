# Time Entries API Contract

> **Owner**: Worker-TIME (Parcel P0-F)  
> **Status**: Frozen (Wave 4)  
> **Date**: 2026-10-03  
>
> Downstream modules (P0-H Contract Freeze, P2 React Dashboard Time-Tracking Widget, Resource Planning / Heatmap) depend on these contracts.

---

## 1. Authentication & Common Headers

All HTTP endpoints require:
- `Authorization: Bearer <supabase-jwt>`
- `X-Active-Entity: ATA|LTA` (or `ALL` where allowed)

Error responses conform to RFC 7807 `application/problem+json`:
```json
{
  "status": 403,
  "title": "Forbidden",
  "detail": "You are not assigned to this task"
}
```

---

## 2. Data Model

### Table: `time_entries` (Migration 000056)

```sql
CREATE TABLE time_entries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id          uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  entry_date       date NOT NULL,
  duration_minutes int NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440),
  note             text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_time_entries_user_date ON time_entries(user_id, entry_date DESC);
CREATE INDEX idx_time_entries_task ON time_entries(task_id);
```

### Time Entry Object Shape

```json
{
  "id": "7f8b3c2a-9e1d-4a5f-8b2c-1d3e4f5a6b7c",
  "user_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  "task_id": "22222222-0001-4000-8000-000000000001",
  "entry_date": "2026-10-01",
  "duration_minutes": 60,
  "note": "Reconciled bank statements",
  "created_at": "2026-10-01T08:30:00.000Z",
  "updated_at": "2026-10-01T08:30:00.000Z"
}
```

---

## 3. RBAC Permission Matrix

| Permission Key | Role / Department | Description |
|---|---|---|
| `timelog:create` | All Staff, Admin | Create time entry on an assigned task |
| `timelog:view` | All Staff, Admin | View time entries and daily dashboard summary |
| `timelog:edit_own` | All Staff, Admin | Edit and delete own time entries |
| `timelog:edit_all` | Admin only | Edit and delete any time entry; view entries across all users |

---

## 4. Endpoints Specification

### 4.1 Create Time Entry

- **Method**: `POST`
- **Path**: `/v1/time-entries`
- **Guard**: `timelog:create`
- **Request Body**:
  ```json
  {
    "task_id": "22222222-0001-4000-8000-000000000001",
    "entry_date": "2026-10-01",
    "duration_minutes": 60,
    "note": "Optional note"
  }
  ```
- **Validation Rules**:
  - `task_id`: Valid UUID. Must exist and caller must be an assigned worker (verified via `task_assignees` with fallback to `tasks.assignee_id`). If unassigned → HTTP 403 Forbidden (`{ error: 'Forbidden', detail: 'You are not assigned to this task' }`).
  - `user_id`: Client-supplied `user_id` is ignored; creator identity is strictly forced to `req.user.id`.
  - `entry_date`: Required `YYYY-MM-DD`. Cannot be in the future → HTTP 400 Bad Request.
  - `duration_minutes`: Required integer between 1 and 1440 → HTTP 400 Bad Request if outside range.
  - Multiple entries per day on the same task are explicitly permitted.
- **Success Response**: HTTP `201 Created`
  ```json
  {
    "data": {
      "id": "7f8b3c2a-9e1d-4a5f-8b2c-1d3e4f5a6b7c",
      "user_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "task_id": "22222222-0001-4000-8000-000000000001",
      "entry_date": "2026-10-01",
      "duration_minutes": 60,
      "note": "Optional note",
      "created_at": "2026-10-01T08:30:00.000Z",
      "updated_at": "2026-10-01T08:30:00.000Z"
    }
  }
  ```

---

### 4.2 List Time Entries

- **Method**: `GET`
- **Path**: `/v1/time-entries`
- **Guard**: `timelog:view`
- **Query Parameters**:
  - `from` (`YYYY-MM-DD`, optional): Filter entries `>= from`.
  - `to` (`YYYY-MM-DD`, optional): Filter entries `<= to`.
  - `task_id` (UUID, optional): Filter entries for specific task.
  - `user_id` (UUID, optional): Filter entries for specific user (permitted for Admin with `timelog:edit_all`; ignored for non-admins).
- **Behavior**:
  - Standard staff: Scoped strictly to caller's own entries (`user_id = req.user.id`).
  - Admin (`timelog:edit_all`): If `user_id` is supplied, filters by that user; if omitted, returns entries across all users.
  - Ordered by `entry_date DESC, created_at DESC`.
- **Success Response**: HTTP `200 OK`
  ```json
  {
    "data": [
      {
        "id": "7f8b3c2a-9e1d-4a5f-8b2c-1d3e4f5a6b7c",
        "user_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        "task_id": "22222222-0001-4000-8000-000000000001",
        "entry_date": "2026-10-01",
        "duration_minutes": 60,
        "note": "Optional note",
        "created_at": "2026-10-01T08:30:00.000Z",
        "updated_at": "2026-10-01T08:30:00.000Z"
      }
    ]
  }
  ```

---

### 4.3 Update Time Entry

- **Method**: `PATCH`
- **Path**: `/v1/time-entries/:id`
- **Guard**: `timelog:edit_own` (or `timelog:edit_all`)
- **Request Body**:
  ```json
  {
    "duration_minutes": 90,
    "note": "Updated notes",
    "entry_date": "2026-10-01"
  }
  ```
- **Behavior**:
  - Only creator or Admin (`timelog:edit_all`) may update. Coworkers receive HTTP 403 Forbidden.
  - Updates `updated_at = now()`.
- **Success Response**: HTTP `200 OK`
  ```json
  {
    "data": {
      "id": "7f8b3c2a-9e1d-4a5f-8b2c-1d3e4f5a6b7c",
      "user_id": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      "task_id": "22222222-0001-4000-8000-000000000001",
      "entry_date": "2026-10-01",
      "duration_minutes": 90,
      "note": "Updated notes",
      "created_at": "2026-10-01T08:30:00.000Z",
      "updated_at": "2026-10-01T09:15:00.000Z"
    }
  }
  ```

---

### 4.4 Delete Time Entry

- **Method**: `DELETE`
- **Path**: `/v1/time-entries/:id`
- **Guard**: `timelog:edit_own` (or `timelog:edit_all`)
- **Behavior**:
  - Hard deletes the time entry row.
  - Only creator or Admin (`timelog:edit_all`) may delete. Coworkers receive HTTP 403 Forbidden.
- **Success Response**: HTTP `204 No Content`

---

### 4.5 Daily Dashboard Summary Endpoint

- **Method**: `GET`
- **Path**: `/v1/time-entries/summary?date=YYYY-MM-DD`
- **Guard**: `timelog:view`
- **Query Parameters**:
  - `date` (`YYYY-MM-DD`, required): Date to aggregate.
  - `user_id` (`UUID`, optional): Target user ID (Admin only).
- **Behavior**:
  - Single indexed query using `idx_time_entries_user_date ON time_entries(user_id, entry_date DESC)`.
  - Aggregates daily `total_minutes`.
  - Groups entries by `task_id`, linking `work_request_id` and task `title`.
  - Multiple duration entries for the same task on the same day are summed into a single task item.
- **Success Response**: HTTP `200 OK`
  ```json
  {
    "date": "2026-10-01",
    "total_minutes": 135,
    "by_task": [
      {
        "task_id": "22222222-0001-4000-8000-000000000001",
        "work_request_id": "11111111-0001-4000-8000-000000000001",
        "title": "Bank Reconciliation",
        "minutes": 90
      },
      {
        "task_id": "22222222-0002-4000-8000-000000000002",
        "work_request_id": "11111111-0002-4000-8000-000000000002",
        "title": "Client Tax Preparation",
        "minutes": 45
      }
    ]
  }
  ```

---

## 5. Acceptance Rules (R1–R6)

- **R1.** Entry ownership enforced in queries by `req.user.id`; `user_id` never accepted from client.
- **R2.** Assignee scope enforced at creation: caller must be in `task_assignees` (with fallback to `tasks.assignee_id`); 403 otherwise.
- **R3.** `entry_date` cannot be in the future; `duration_minutes` must be 1–1440; multiple entries on the same task on the same day are allowed.
- **R4.** Edit and delete are restricted to creator; Admin override via `timelog:edit_all`.
- **R5.** Summary endpoint executes a single indexed query (no N+1); includes WR linkage + task title for widget display.
- **R6.** No notification events in v1.

---

## 6. Explicit Non-Goals

- ❌ No timer start/stop daemon logic, heartbeats, or background sessions.
- ❌ No billable rates or invoice linkage (firm bills retainers, not hours — D9).
- ❌ No vanilla UI modification (React widget in P2 Dashboard).
- ❌ No admin dashboard/report endpoints beyond §4.5 (Heatmap spec is a future parcel).
