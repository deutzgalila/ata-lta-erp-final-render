---
module: notifications
contract_version: 2.0.0
frozen_at: 2026-10-04
frozen_by: P0-H
base_url: /v1/notifications
---

# /v1/notifications — In-App Notifications API Contract

## Overview
Provides authenticated in-app notifications for workflow transitions, approvals, rejections, and reroutes. Enforces user isolation, cursor pagination, and idempotent read receipts.

- **Guards:** Authenticated, `notifications:view` (granted to all departments and Admin).
- **Common Headers:** `Authorization: Bearer <jwt>`, `X-Active-Entity: ATA|LTA`.

---

## 1. Notification Event Types & Payloads

The system enforces 4 frozen notification types. DB write failures during notification dispatch are non-blocking and never fail the triggering business operation.

### `wr.transition_request.received`
- **Emitted By:** `POST /v1/operations-requests` (`request_type: 'wr_phase_transition'`).
- **Recipients:** All users with role `Admin`.
- **Payload Shape:**
```json
{
  "request_id": "uuid",
  "work_request_id": "uuid",
  "work_request_title": "Annual Tax Audit",
  "from_phase": "pre_processing",
  "to_phase": "processing",
  "requested_by_id": "uuid",
  "requested_by_name": "Manager Name"
}
```

### `wr.transition_request.resolved`
- **Emitted By:** `POST /v1/operations-requests/:id/fulfill` or `/reject`, or direct advance (`POST /v1/operations/work-requests/:id/advance`).
- **Recipients:** Requester user ID (and relevant assignees).
- **Payload Shape:**
```json
{
  "request_id": "uuid",
  "work_request_id": "uuid",
  "work_request_title": "Annual Tax Audit",
  "outcome": "approved",
  "resolved_phase": "processing",
  "rejection_reason": null,
  "resolved_by_id": "uuid",
  "resolved_by_name": "Admin Name",
  "via": "direct"
}
```

### `pending_request.resolved` (Disbursements & Billing)
- **Emitted By:** Disbursement rejection or pending change approval/rejection.
- **Recipients:** Creator / Requester user ID.
- **Payload Shape:**
```json
{
  "request_id": "uuid",
  "resource_type": "disbursement",
  "resource_id": "uuid",
  "action": "rejected",
  "rejection_reason": "Missing receipt documentation",
  "resolved_by_name": "Admin Name"
}
```

### `wr.qa_reroute`
- **Emitted By:** `POST /v1/operations/work-requests/:id/reroute`.
- **Recipients:** Assignees of failed tasks being reopened.
- **Payload Shape:**
```json
{
  "work_request_id": "uuid",
  "work_request_title": "Annual Tax Audit",
  "target_phase": "processing",
  "reopened_task_ids": ["uuid-1", "uuid-2"],
  "reason": "Missing verification attachment on calculation sheet",
  "rerouted_by_id": "uuid",
  "rerouted_by_name": "Admin Name"
}
```

---

## 2. Endpoints

### 2.1 `GET /v1/notifications`
List notifications for the authenticated user, ordered by `created_at DESC`.

- **Guards:** Authenticated, `notifications:view`.
- **Query Parameters (Zod: `listQuerySchema`):**
  | Parameter | Type | Required | Default | Bounds / Description |
  | :--- | :--- | :---: | :---: | :--- |
  | `limit` | integer | No | 50 | Min 1, Max 100 |
  | `cursor` | ISO date | No | — | Pagination cursor (`created_at < cursor`) |

- **Response (200 OK):**
```json
{
  "data": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "type": "wr.transition_request.received",
      "payload": { ... },
      "read_at": null,
      "created_at": "2026-10-04T02:00:00Z"
    }
  ],
  "meta": {
    "unread_count": 3,
    "has_more": false,
    "next_cursor": null
  }
}
```

- **Error Vocabulary:**
  | Status | Code | Trigger Condition |
  | :--- | :--- | :--- |
  | `400 Bad Request` | `VALIDATION_ERROR` | `limit` not an integer in 1–100 or `cursor` is not valid ISO timestamp |
  | `403 Forbidden` | `FORBIDDEN` | Missing `notifications:view` permission |

---

### 2.2 `POST /v1/notifications/:id/read`
Marks a single notification as read (`read_at = now()`). Idempotent.

- **Guards:** Authenticated, `notifications:view`, ownership verification.
- **Path Parameters (Zod: `markReadParamsSchema`):**
  | Parameter | Type | Description |
  | :--- | :--- | :--- |
  | `id` | UUID | Notification identifier |

- **Response (200 OK):**
```json
{
  "data": {
    "id": "uuid",
    "read_at": "2026-10-04T02:05:00Z"
  }
}
```

- **Error Vocabulary:**
  | Status | Code | Trigger Condition |
  | :--- | :--- | :--- |
  | `400 Bad Request` | `VALIDATION_ERROR` | `:id` is not a valid UUID |
  | `403 Forbidden` | `FORBIDDEN` | Notification belongs to another user (anti-tamper) |
  | `404 Not Found` | `NOT_FOUND` | Notification ID does not exist |

---

### 2.3 `POST /v1/notifications/read-all`
Marks all unread notifications for the authenticated user as read. Idempotent.

- **Guards:** Authenticated, `notifications:view`.
- **Response (200 OK):**
```json
{
  "data": {
    "updated_count": 3
  }
}
```
