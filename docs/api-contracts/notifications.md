# Notifications API Contract

> **Owner**: Worker-NOTIF (Parcel P0-B)  
> **Status**: Frozen (Wave 2)  
> **Date**: 2026-10-03  
>
> Downstream modules (P0-D Operations, P0-G Disbursements, P1/P2 React Shell) depend on these contracts.

---

## 1. Authentication & Common Headers

All HTTP endpoints require:
- `Authorization: Bearer <supabase-jwt>`
- `X-Active-Entity: ATA|LTA`

Error responses conform to RFC 7807 `application/problem+json`:
```json
{
  "status": 403,
  "title": "Forbidden",
  "detail": "You do not have permission to access this notification"
}
```

---

## 2. Notification Data Model

### Table: `notifications`

```sql
CREATE TABLE notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         text NOT NULL CHECK (type IN (
                 'pending_request.resolved',
                 'wr.transition_request.received',
                 'wr.transition_request.resolved',
                 'wr.qa_reroute'
               )),
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_unread ON notifications(user_id) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);
```

### Notification Object Shape

```json
{
  "id": "c1f54790-21a4-4f9e-a0e2-638bc93a8d11",
  "user_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
  "type": "wr.transition_request.received",
  "payload": {
    "request_id": "req-123",
    "work_request_id": "wr-456",
    "wr_title": "Annual Tax Filing",
    "from_phase": "intake",
    "to_phase": "pre_processing",
    "requested_by_name": "Maria Clara"
  },
  "read_at": null,
  "created_at": "2026-10-03T12:00:00.000Z"
}
```

---

## 3. Endpoints

Base path: `/v1/notifications`

| Method | Path | Guard | Description |
|---|---|---|---|
| `GET` | `/` | `notifications:view` | List own notifications, newest first, cursor-paginated |
| `POST` | `/read-all` | `notifications:view` | Mark all unread notifications of authenticated user as read |
| `POST` | `/:id/read` | `notifications:view` | Mark specific notification as read (idempotent) |

### 3.1 `GET /v1/notifications`

Fetches notifications belonging exclusively to the authenticated user (`req.user.id`).

#### Query Parameters:
- `limit` *(integer, optional, default: 50, min: 1, max: 100)*: Maximum number of rows to return.
- `cursor` *(ISO-8601 string, optional)*: Returns notifications with `created_at < cursor`.

#### Response `200 OK`:
```json
{
  "data": [
    {
      "id": "c1f54790-21a4-4f9e-a0e2-638bc93a8d11",
      "user_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
      "type": "wr.transition_request.received",
      "payload": {
        "request_id": "req-123",
        "work_request_id": "wr-456",
        "wr_title": "Annual Tax Filing",
        "from_phase": "intake",
        "to_phase": "pre_processing",
        "requested_by_name": "Maria Clara"
      },
      "read_at": null,
      "created_at": "2026-10-03T12:00:00.000Z"
    }
  ],
  "meta": {
    "limit": 50,
    "next_cursor": "2026-10-03T11:45:00.000Z"
  }
}
```
*Note:* `next_cursor` is `null` when no further rows remain.

### 3.2 `POST /v1/notifications/read-all`

Marks all notifications where `user_id = req.user.id AND read_at IS NULL` with `read_at = now()`.

#### Response `200 OK`:
```json
{
  "data": {
    "marked": 4
  }
}
```

### 3.3 `POST /v1/notifications/:id/read`

Marks the specified notification as read.

#### Security & Idempotency Rules:
- If notification `:id` does not exist: returns `404 Not Found`.
- If notification `:id` belongs to another user (`user_id !== req.user.id`): returns `403 Forbidden`.
- If notification is already marked as read (`read_at != null`): returns `200 OK` with existing `read_at` unmodified (idempotent no-op).
- If unread: updates `read_at = now()` and returns `200 OK` with updated record.

#### Response `200 OK`:
```json
{
  "data": {
    "id": "c1f54790-21a4-4f9e-a0e2-638bc93a8d11",
    "user_id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "type": "wr.transition_request.received",
    "payload": { ... },
    "read_at": "2026-10-03T12:05:00.000Z",
    "created_at": "2026-10-03T12:00:00.000Z"
  }
}
```

---

## 4. User Profile Integration (`GET /v1/me`)

The `/v1/me` profile response is extended additively with `unread_notifications`:

```json
{
  "data": {
    "id": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "email": "user@ata-lta.ph",
    "name": "Maria Clara",
    "role": "Accounting",
    "departments": ["Accounting"],
    "entities": ["ATA"],
    "activeEntity": "ATA",
    "permissions": ["clients:view", "notifications:view"],
    "unread_notifications": 3
  }
}
```

---

## 5. Dispatch Helper Service (`notify`)

Location: `backend/src/services/notify.js`

### Signature
```typescript
notify(userIds: string[] | string, type: string, payload: object): Promise<void>
```

### Frozen Event Types & Payload Schemas

| Type | Payload Schema | Description |
|---|---|---|
| `pending_request.resolved` | `{ request_id: string, table_name: string, outcome: 'approved' \| 'rejected', reason?: string, title: string }` | Emitted when a pending change or disbursement request is approved or rejected (wired in P0-G). |
| `wr.transition_request.received` | `{ request_id: string, work_request_id: string, wr_title: string, from_phase: string, to_phase: string, requested_by_name: string }` | Emitted when a Manager requests a phase advancement for a Work Request (wired in P0-D). |
| `wr.transition_request.resolved` | `{ request_id: string, work_request_id: string, outcome: string, reason?: string, to_phase?: string }` | Emitted when Admin approves or rejects the phase transition request (wired in P0-D). |
| `wr.qa_reroute` | `{ work_request_id: string, wr_title: string, to_phase: string, reason: string, failed_task_ids: string[] }` | Emitted when QA compliance review fails and reroutes work back to an earlier phase (wired in P0-D). |

### Error & Fault-Tolerance Contract
1. **Unknown Type Rejection (R2):** If `type` is not one of the 4 frozen enum values, `notify()` throws an HTTP 400 `AppError` (`code: 'INVALID_NOTIFICATION_TYPE'`).
2. **Database Failure Decoupling (R3):** Database insertion errors are caught and logged (`logger.error`). `notify()` resolves cleanly and **never throws to the caller**, ensuring the triggering business transaction completes successfully.
