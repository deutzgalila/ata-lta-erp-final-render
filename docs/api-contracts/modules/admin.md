---
module: admin
contract_version: 2.1.0
frozen_at: 2026-10-05
frozen_by: P2-W2-BE
base_url: /v1/admin
---

# /v1/admin — Admin, Audit Trail, and Pending Approvals API Contract

## Overview
Provides administrative management endpoints for user administration, pending change approvals inbox, and audit trail inspection. Supports multi-module audit trail filtering, actor lookup and metadata enrichment, 24-hour UTC window date querying, page-based pagination, and broadened managerial audit viewing permissions (`['users:view', 'audit:view_all']`).

- **Guards:** Authenticated, entity-scoped (`X-Active-Entity: ATA|LTA|ALL`).
- **Base URL:** `/v1/admin`

---

## 1. Endpoints

### 1.1 `GET /v1/admin/audit`
Lists audit trail entries matching filter criteria with pagination and actor metadata enrichment.

- **Guards:** Authenticated, `requirePermission(['users:view', 'audit:view_all'])`.
- **Since-version:** `2.1.0` (UAT2-15 broadened permissions, module mapping, actor search/enrichment, date window).
- **Events Emitted:** None.

#### Query Parameters (Zod: `listAuditQuerySchema`)
| Parameter | Type | Required | Default | Description |
| :--- | :--- | :---: | :---: | :--- |
| `userId` | string | No | — | Filter by exact acting user UUID |
| `actor` | string | No | — | Filter by actor UUID or case-insensitive search by user name/email substring |
| `module` | enum (`operations`, `billing`, `disbursements`, `documents`, `transmittals`, `admin`) | No | — | Maps to tables via `MODULE_TABLE_MAP` |
| `table` | string | No | — | Filter by explicit database table name |
| `action` | string | No | — | Filter by audit action (e.g. `user.updated`, `work_request.created`) |
| `date` | string (YYYY-MM-DD) | No | — | Filter by specific date; expands to 24-hour UTC window (`[date]T00:00:00.000Z` to `[date]T23:59:59.999Z`) |
| `from` | string | No | — | Start timestamp boundary (ISO string or date string) |
| `to` | string | No | — | End timestamp boundary (ISO string or date string) |
| `page` | integer (min 1) | No | — | Page number. When supplied, offset is computed as `(page - 1) * limit` |
| `limit` | integer (1–100) | No | 20 | Items per page |
| `offset` | integer (min 0) | No | 0 | Items offset (overridden if `page` is provided) |

#### Module-to-Table Mapping (`MODULE_TABLE_MAP`)
- `operations`: `work_requests`, `tasks`
- `billing`: `invoices`, `invoice_line_items`, `invoice_payments`
- `disbursements`: `disbursements`, `disbursement_templates`
- `documents`: `documents`
- `transmittals`: `transmittals`, `transmittal_items`
- `admin`: `users`, `user_roles`, `clients`, `entities`, `stages`, `retainer_templates`, `operations_requests`

#### Response (200 OK)
```json
{
  "data": [
    {
      "id": "uuid",
      "action": "work_request.created",
      "tableName": "work_requests",
      "recordId": "uuid",
      "entity": "ATA",
      "userId": "uuid",
      "actor": {
        "id": "uuid",
        "name": "Jane Audit Specialist",
        "email": "jane@ata-lta.ph",
        "role": "Operations"
      },
      "userName": "Jane Audit Specialist",
      "userEmail": "jane@ata-lta.ph",
      "details": {},
      "createdAt": "2026-10-05T09:00:00.000Z"
    }
  ],
  "meta": {
    "total": 42,
    "page": 1,
    "limit": 20,
    "offset": 0,
    "hasMore": true
  }
}
```

#### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `400 Bad Request` | `VALIDATION_ERROR` | `limit > 100` or invalid query format |
| `401 Unauthorized` | `UNAUTHORIZED` | Missing or invalid authentication token |
| `403 Forbidden` | `FORBIDDEN` | Caller lacks both `users:view` and `audit:view_all` permissions |

---

### 1.2 `GET /v1/admin/audit/count`
Retrieves total audit log count for the active entity.

- **Guards:** Authenticated, `requirePermission(['users:view', 'audit:view_all'])`.
- **Response:** `{ "data": { "total": 120 } }`

---

### 1.3 `GET /v1/admin/pending-approvals`
Lists pending change approval requests submitted across modules for managerial review.

- **Guards:** Authenticated, entity-scoped.
- **Query Parameters:** `status`, `tableName`, `parentRecordId`, `submittedBy`.

---

### 1.4 `POST /v1/admin/pending-approvals/:id/approve`
Approves and applies a pending record change.

- **Guards:** Authenticated, approver permission for the target table.

---

### 1.5 `POST /v1/admin/pending-approvals/:id/reject`
Rejects a pending change with a required rationale.

- **Guards:** Authenticated, approver permission for the target table.
- **Request Body:** `{ "reason": "Explanation of rejection" }`
