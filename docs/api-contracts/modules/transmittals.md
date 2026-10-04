---
module: transmittals
contract_version: 2.0.0
frozen_at: 2026-10-04
frozen_by: P0-H
base_url: /v1/transmittals
---

# /v1/transmittals — Transmittals API Contract

## Overview
Manages document transmittals, physical delivery manifests, multi-item document listings, client delivery tracking, and receipt acknowledgements. Supports multi-entity resolution (`ATA | LTA | ALL`), optimistic concurrency control (OCC version checking), board ordering persistence for kanban views, and dual-path Admin approval workflows.

- **Guards:** Authenticated Bearer token, Entity-scoped via `X-Active-Entity: ATA | LTA | ALL` (`allowAll: true` on `/` and `/counts`; specific entity resolved on detail, creation, and mutation routes).
- **Base URL:** `/v1/transmittals`
- **Data Model:** Relational parent-child structure (`transmittals` parent table and cascade-managed `transmittal_items` child table).

---

## 1. Status Lifecycle & Transition State Machine

```
┌─────────┐   approve (Admin)   ┌──────┐   acknowledge   ┌──────────────┐
│  Draft  ├────────────────────►│ Sent ├────────────────►│ Acknowledged │
└────┬────┘                     └──────┘                 └──────────────┘
     │                             ▲
     └─────── send (if approved) ──┘
```

### Status Descriptions
1. **`Draft`**: Initial state upon creation (`approved = false`). Full record edits and item additions/removals are permitted.
2. **`Sent`**: Physical or electronic documents transmitted to client. Content fields are immutable; `board_order` may be updated.
3. **`Acknowledged`**: Client acknowledged receipt of transmitted documents. Final state. `board_order` may be updated.
4. **`Cancelled`**: Voided transmittal.

### Dual-Path Admin Approval & Send Semantics
To support both streamlined administrative workflows and delegated staff handoffs:
- **Path 1: Admin Direct Approval (`POST /v1/transmittals/:id/approve`)**
  - Requires `transmittal:approve` (**Admin ONLY** per RBAC manifest).
  - Transitions `Draft` directly to `Sent`.
  - Automatically sets `approved = true`, `sent_at = NOW()`, `sent_by = userId`.
- **Path 2: Standard Send (`POST /v1/transmittals/:id/send`)**
  - Requires `transmittal:mark` (Admin, Management, Documentation).
  - **Admin caller:** Allowed unconditionally; automatically sets `approved = true`, `status = 'Sent'`, `sent_at = NOW()`, `sent_by = userId`.
  - **Non-Admin caller (Documentation, Management):** Guardrail requires `existing.approved === true`. If the transmittal has NOT been approved by Admin (`approved === false`), the request is rejected with `403 Forbidden` (`detail: 'Cannot send transmittal because it has not been approved by Admin.'`).

### Kanban Board Ordering Persistence
- `board_order` (integer): Persists drag-and-drop card positioning in kanban column views.
- **Status Exemption:** Unlike content fields, updating `boardOrder` via `PUT /v1/transmittals/:id` or inline on `/send` and `/acknowledge` is permitted across **any** status (`Draft`, `Sent`, `Acknowledged`).

---

## 2. Domain Models & Database Schema

### 2.1 `transmittals` Table
| Column | Type | Nullable | Default | Description |
| :--- | :--- | :---: | :---: | :--- |
| `id` | UUID | No | `gen_random_uuid()` | Primary Key |
| `tracking_number` | VARCHAR(50) | No | — | Unique per entity (`UNIQUE(entity_id, tracking_number)`) |
| `entity_id` | UUID | No | — | Foreign Key → `entities(id)` |
| `client_id` | UUID | No | — | Foreign Key → `clients(id)` |
| `work_request_id` | UUID | Yes | NULL | Foreign Key → `work_requests(id)` |
| `linked_task_id` | UUID | Yes | NULL | Foreign Key → `tasks(id)` (ON DELETE SET NULL) |
| `status` | VARCHAR(50) | Yes | `'Draft'` | Status enum: `Draft`, `Sent`, `Acknowledged`, `Cancelled` |
| `approved` | BOOLEAN | Yes | `FALSE` | Admin approval flag |
| `board_order` | INTEGER | Yes | `0` | Kanban board display sequence order |
| `notes` | TEXT | Yes | NULL | Optional transmittal notes (max 2000 chars) |
| `recipient_name` | VARCHAR(255) | Yes | NULL | Name of recipient person |
| `recipient_details` | TEXT | Yes | NULL | Delivery address / contact details (max 1000 chars) |
| `sent_at` | TIMESTAMPTZ | Yes | NULL | Timestamp when transmittal was marked sent |
| `sent_by` | UUID | Yes | NULL | User UUID who marked transmittal sent |
| `acknowledged_at` | TIMESTAMPTZ | Yes | NULL | Timestamp when transmittal was acknowledged |
| `acknowledged_by` | UUID | Yes | NULL | User UUID who acknowledged transmittal |
| `archived` | BOOLEAN | Yes | `FALSE` | Soft archive flag |
| `version` | INTEGER | No | `1` | Optimistic Concurrency Control (OCC) version integer |
| `created_at` | TIMESTAMPTZ | Yes | `NOW()` | Creation timestamp |
| `updated_at` | TIMESTAMPTZ | Yes | `NOW()` | Last update timestamp |
| `created_by` | UUID | Yes | NULL | User UUID creator |
| `updated_by` | UUID | Yes | NULL | User UUID updater |
| `deleted_at` | TIMESTAMPTZ | Yes | NULL | Soft delete timestamp |

### 2.2 `transmittal_items` Table
| Column | Type | Nullable | Default | Description |
| :--- | :--- | :---: | :---: | :--- |
| `id` | UUID | No | `gen_random_uuid()` | Primary Key |
| `transmittal_id` | UUID | No | — | Foreign Key → `transmittals(id)` ON DELETE CASCADE |
| `description` | VARCHAR(255) | No | — | Document description (1–255 chars) |
| `document_type` | VARCHAR(50) | Yes | NULL | Classification category (e.g. `Tax`, `SEC`, `BIR`, `Contract`) |
| `quantity` | INTEGER | Yes | `1` | Positive document count |
| `sort_order` | INTEGER | Yes | `0` | Zero-based sequence order in item list |
| `created_at` | TIMESTAMPTZ | Yes | `NOW()` | Creation timestamp |

---

## 3. Request & Response Schemas

### 3.1 `transmittalItemSchema`
Validates an individual item row.
```typescript
{
  description: string (min 1, max 255);
  documentType?: string (max 50) | null;
  quantity?: number (integer, positive, default 1);
}
```

### 3.2 `createTransmittalSchema`
```typescript
{
  clientId: string (UUID);
  workRequestId: string (UUID);
  trackingNumber: string (min 1, max 50);
  items: transmittalItemSchema[] (min 1 item required);
  notes?: string (max 2000) | null;
  recipientName?: string (max 255) | null;
  recipientDetails?: string (max 1000) | null;
  linkedTaskId?: string (UUID) | null;
  boardOrder?: number (integer, default 0);
}
```

### 3.3 `updateTransmittalSchema`
Partial schema for editing. Note: content fields require `status === 'Draft'`; `boardOrder` alone can be updated in any status.
```typescript
{
  clientId?: string (UUID);
  workRequestId?: string (UUID) | null;
  trackingNumber?: string (min 1, max 50);
  items?: transmittalItemSchema[] (min 1);
  notes?: string (max 2000) | null;
  recipientName?: string (max 255) | null;
  recipientDetails?: string (max 1000) | null;
  linkedTaskId?: string (UUID) | null;
  boardOrder?: number (integer);
  expectedVersion?: number (integer, positive); // OCC concurrency check
}
```

---

## 4. Endpoints Inventory

### 4.1 `GET /v1/transmittals`
Lists transmittals matching query filters with embedded items and client names.

- **Guards:** Authenticated, `transmittal:view`.
- **Entity Scope:** `allowAll: true` (supports `X-Active-Entity: ATA | LTA | ALL`).
- **Since-version:** `1.0.0` (augmented in `2.0.0` with board order sorting and OCC).
- **Events Emitted:** None.

#### Query Parameters
| Parameter | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `status` | string | No | Filter by status (`Draft`, `Sent`, `Acknowledged`, `Cancelled`) |
| `clientId` | UUID | No | Filter by client UUID |
| `search` | string | No | Substring ILIKE search on `tracking_number`, `notes`, `recipient_name` |
| `archived` | boolean \| string | No | `'true'` for archived only, `'false'` for active only |
| `includeDeleted` | boolean \| string | No | `'true'` to include soft-deleted records |
| `page` | integer | No | 1-based page number (default 1) |
| `limit` | integer | No | Items per page (default 50, maximum 100) |

#### Role Scoping Rules
- **Admin & Documentation:** Unrestricted view across active entity.
- **Other Roles (Operations, Management, Accounting, HR):** Scoped to transmittals where `created_by = user.id` OR `work_request_id` belongs to user's concerned work requests.

#### Response (200 OK)
```json
{
  "data": [
    {
      "id": "771e457e-e2b2-4d26-b841-4770146059e9",
      "tracking_number": "TR-ATA-2026-0001",
      "entity_id": "00000000-0000-0000-0000-000000000001",
      "entity_code": "ATA",
      "client_id": "11111111-1111-1111-1111-111111111111",
      "work_request_id": "33333333-3333-3333-3333-333333333333",
      "linked_task_id": null,
      "status": "Draft",
      "approved": false,
      "board_order": 0,
      "notes": "Urgent BIR filing docs",
      "recipient_name": "Juan Dela Cruz",
      "recipient_details": "Unit 402, Corporate Center, Makati",
      "sent_at": null,
      "sent_by": null,
      "acknowledged_at": null,
      "acknowledged_by": null,
      "archived": false,
      "version": 1,
      "created_at": "2026-10-04T05:00:00.000Z",
      "updated_at": "2026-10-04T05:00:00.000Z",
      "created_by": "00000000-0000-0000-0000-000000000003",
      "updated_by": "00000000-0000-0000-0000-000000000003",
      "deleted_at": null,
      "clients": { "name": "Acme Corp" },
      "items": [
        {
          "id": "99999999-9999-9999-9999-999999999999",
          "transmittal_id": "771e457e-e2b2-4d26-b841-4770146059e9",
          "description": "2025 Annual Income Tax Return",
          "document_type": "Tax",
          "quantity": 2,
          "sort_order": 0,
          "created_at": "2026-10-04T05:00:00.000Z"
        }
      ]
    }
  ],
  "meta": { "total": 1, "page": 1, "limit": 50 }
}
```

---

### 4.2 `GET /v1/transmittals/counts`
Retrieves consolidated badge counts for navigation tabs.

- **Guards:** Authenticated, `transmittal:view`.
- **Entity Scope:** `allowAll: true` (supports `X-Active-Entity: ATA | LTA | ALL`).
- **Since-version:** `1.0.0`.
- **Events Emitted:** None.

#### Response (200 OK)
```json
{
  "data": {
    "active": 12,
    "archived": 3,
    "total": 15
  }
}
```

---

### 4.3 `POST /v1/transmittals`
Atomically creates a transmittal record and its constituent child line items.

- **Guards:** Authenticated, `transmittal:create`.
- **Since-version:** `1.0.0` (augmented with `linkedTaskId` and OCC in `2.0.0`).
- **Events Emitted:** Audited as `transmittal.create`.

#### Request Body
Validated against `createTransmittalSchema`.

#### Response (201 Created)
Returns complete transmittal object with `items` array. Initial status is guaranteed to be `Draft` and `approved` is `false`.

#### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `400 Bad Request` | `VALIDATION_ERROR` | Missing required fields, invalid UUID format, or `items` array is empty (`< 1`). |
| `401 Unauthorized` | `UNAUTHORIZED` | Missing or expired auth token. |
| `403 Forbidden` | `FORBIDDEN` | Caller lacks `transmittal:create` permission. |
| `409 Conflict` | `CONFLICT` | `trackingNumber` already exists for this entity (`UNIQUE(entity_id, tracking_number)`). |

---

### 4.4 `GET /v1/transmittals/:id`
Retrieves a single transmittal by UUID, including client address/TIN details and child items sorted by `sort_order`.

- **Guards:** Authenticated, `transmittal:view`.
- **Since-version:** `1.0.0`.
- **Events Emitted:** None.

#### Response (200 OK)
```json
{
  "data": {
    "id": "771e457e-e2b2-4d26-b841-4770146059e9",
    "tracking_number": "TR-ATA-2026-0001",
    "status": "Draft",
    "approved": false,
    "clients": {
      "name": "Acme Corp",
      "address": "123 Business Ave, Makati",
      "tin": "123-456-789-00001"
    },
    "items": [ /* Line items ordered by sort_order */ ]
  }
}
```

#### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `403 Forbidden` | `FORBIDDEN` | Non-admin/non-documentation caller attempting to view record outside concerned work requests. |
| `404 Not Found` | `NOT_FOUND` | Record does not exist, belongs to different entity, or is soft-deleted. |

---

### 4.5 `PUT /v1/transmittals/:id`
Updates transmittal fields.

- **Guards:** Authenticated, `transmittal:edit`.
- **Since-version:** `1.0.0` (OCC `expectedVersion` added in `2.0.0`).
- **Events Emitted:** Audited as `transmittal.update`.

#### Behavior & Restrictions
1. **Draft Lock:** If any content field (`clientId`, `workRequestId`, `linkedTaskId`, `trackingNumber`, `notes`, `recipientName`, `recipientDetails`, `items`) is updated on a non-`Draft` transmittal, returns `409 Conflict`.
2. **Board Order Exemption:** Updating `boardOrder` alone is allowed in ANY status (`Draft`, `Sent`, `Acknowledged`).
3. **Item Replacement:** If `items` array is provided, all existing items are deleted and replaced atomically.
4. **OCC Versioning:** If `expectedVersion` is supplied (or via `If-Match`), verifies that DB `version === expectedVersion`. On mismatch, returns `409 Conflict` (`code: 'ERR_CONCURRENCY_CONFLICT'`).

#### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `400 Bad Request` | `VALIDATION_ERROR` | Schema validation fails. |
| `404 Not Found` | `NOT_FOUND` | Transmittal not found. |
| `409 Conflict` | `CONFLICT` | Content edit attempted on `Sent` or `Acknowledged` transmittal. |
| `409 Conflict` | `ERR_CONCURRENCY_CONFLICT` | Stale update: `expectedVersion` does not match database version. |

---

### 4.6 `POST /v1/transmittals/:id/approve`
Approves a `Draft` transmittal and immediately transitions it to `Sent`.

- **Guards:** Authenticated, `transmittal:approve` (**Admin ONLY**).
- **Since-version:** `2.0.0` (Admin approval gate).
- **Events Emitted:** Audited as `transmittal.approve` and `transmittal.send`.

#### State Transition
- Sets `approved = true`, `status = 'Sent'`, `sent_at = NOW()`, `sent_by = userId`.

#### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `401 Unauthorized` | `UNAUTHORIZED` | Missing or invalid auth token. |
| `403 Forbidden` | `FORBIDDEN` | Caller lacks `transmittal:approve` (non-Admin role). |
| `404 Not Found` | `NOT_FOUND` | Transmittal not found. |
| `409 Conflict` | `INVALID_STATE` | Transmittal is not currently in `Draft` status. |

---

### 4.7 `POST /v1/transmittals/:id/send`
Marks a transmittal as sent (`Draft` → `Sent`).

- **Guards:** Authenticated, `transmittal:mark` (Admin, Management, Documentation).
- **Since-version:** `1.0.0` (dual-path admin approval check added in `2.0.0`).
- **Events Emitted:** Audited as `transmittal.send`.

#### Dual-Path Check
- **Admin Caller:** Automatically sets `approved = true` and `status = 'Sent'`.
- **Non-Admin Caller (Management, Documentation):** Requires that the transmittal was pre-approved by Admin (`existing.approved === true`). If `existing.approved === false`, returns `403 Forbidden` with detail `"Cannot send transmittal because it has not been approved by Admin."`.

#### Request Body (Optional)
```typescript
{
  boardOrder?: number;
}
```

#### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `403 Forbidden` | `FORBIDDEN` | Non-admin caller attempting to send an unapproved transmittal (`approved === false`). |
| `404 Not Found` | `NOT_FOUND` | Transmittal not found. |
| `409 Conflict` | `INVALID_TRANSITION` | Transmittal is not currently in `Draft` status. |

---

### 4.8 `POST /v1/transmittals/:id/acknowledge`
Marks physical receipt acknowledgment (`Sent` → `Acknowledged`).

- **Guards:** Authenticated, `transmittal:mark` (Admin, Management, Documentation).
- **Since-version:** `1.0.0`.
- **Events Emitted:** Audited as `transmittal.acknowledge`.

#### State Transition
- Requires `status === 'Sent'`.
- Sets `status = 'Acknowledged'`, `acknowledged_at = NOW()`, `acknowledged_by = userId`.

#### Request Body (Optional)
```typescript
{
  boardOrder?: number;
}
```

#### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `404 Not Found` | `NOT_FOUND` | Transmittal not found. |
| `409 Conflict` | `INVALID_TRANSITION` | Transmittal is not currently in `Sent` status (e.g. attempting to acknowledge a Draft). |

---

### 4.9 `POST /v1/transmittals/:id/archive` & `POST /v1/transmittals/:id/unarchive`
Toggles the `archived` boolean flag.

- **Guards:** Authenticated, `transmittal:mark`.
- **Since-version:** `1.0.0`.
- **Events Emitted:** Audited as `transmittal.archive` / `transmittal.unarchive`.

#### Response (200 OK)
Returns updated transmittal object with `archived: true` or `archived: false`.

---

### 4.10 `DELETE /v1/transmittals/:id`
Soft-deletes a transmittal by setting `deleted_at = NOW()`.

- **Guards:** Authenticated, `transmittal:delete` (Management, Admin).
- **Since-version:** `1.0.0`.
- **Events Emitted:** Audited as `transmittal.delete`.

#### Response (204 No Content)
Empty body.

#### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `403 Forbidden` | `FORBIDDEN` | Caller lacks `transmittal:delete` (e.g. Documentation, Operations). |
| `404 Not Found` | `NOT_FOUND` | Transmittal not found. |

---

## 5. Cross-Cutting Standards & RFC 7807 Error Model

All error responses strictly adhere to RFC 7807 Problem Details:
```json
{
  "status": 400,
  "title": "Validation Error",
  "detail": "items: Array must contain at least 1 element(s)",
  "code": "VALIDATION_ERROR"
}
```

### Comprehensive Error Matrix
| HTTP Status | Title | Code | Trigger Scenarios |
| :--- | :--- | :--- | :--- |
| `400 Bad Request` | Validation Error | `VALIDATION_ERROR` | Missing required fields, invalid UUID, empty item array, string length exceeded. |
| `401 Unauthorized` | Unauthorized | `UNAUTHORIZED` | Missing, expired, or malformed JWT bearer token. |
| `403 Forbidden` | Forbidden | `FORBIDDEN` | Caller lacks required permission key. |
| `403 Forbidden` | Forbidden | `FORBIDDEN` | Non-admin caller attempting `POST /v1/transmittals/:id/send` on an unapproved transmittal. |
| `403 Forbidden` | Forbidden | `FORBIDDEN` | Non-admin/non-documentation caller attempting to access unconcerned work request record. |
| `404 Not Found` | Not Found | `NOT_FOUND` | UUID does not exist in the active entity or record is soft-deleted. |
| `409 Conflict` | Conflict | `CONFLICT` | `trackingNumber` already exists in active entity. |
| `409 Conflict` | Conflict | `CONFLICT` | Content update attempted on non-`Draft` transmittal (`Cannot edit transmittal in "Sent" status`). |
| `409 Conflict` | Invalid State | `INVALID_STATE` | `POST /:id/approve` attempted on non-`Draft` transmittal. |
| `409 Conflict` | Invalid Transition | `INVALID_TRANSITION` | `POST /:id/send` attempted on non-`Draft`, or `POST /:id/acknowledge` on non-`Sent`. |
| `409 Conflict` | Conflict | `ERR_CONCURRENCY_CONFLICT` | OCC version mismatch: `expectedVersion` does not match database `version`. |
| `500 Server Error` | Database Error | `DATABASE_ERROR` | Database query or connection failure. |

---

## 6. RBAC & Permission Matrix

| Action | HTTP Method & Path | Permission Key | Admin | Management | Documentation | Accounting | Operations | HR |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| List Transmittals | `GET /v1/transmittals` | `transmittal:view` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Tab Counts | `GET /v1/transmittals/counts` | `transmittal:view` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| View Detail | `GET /v1/transmittals/:id` | `transmittal:view` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create Transmittal | `POST /v1/transmittals` | `transmittal:create` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit Transmittal | `PUT /v1/transmittals/:id` | `transmittal:edit` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Admin Approve | `POST /v1/transmittals/:id/approve` | `transmittal:approve` | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Send Transmittal | `POST /v1/transmittals/:id/send` | `transmittal:mark` | ✅ | ✅* | ✅* | ❌ | ❌ | ❌ |
| Acknowledge | `POST /v1/transmittals/:id/acknowledge` | `transmittal:mark` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Archive / Unarchive | `POST /v1/transmittals/:id/(un)archive` | `transmittal:mark` | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Delete Transmittal | `DELETE /v1/transmittals/:id` | `transmittal:delete` | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Request Transmittal | *(via pending changes / ops requests)* | `transmittal:request` | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |

*\*Note on `/send`: Non-Admin callers holding `transmittal:mark` can only execute send if the transmittal has already been approved by Admin (`approved === true`).*
