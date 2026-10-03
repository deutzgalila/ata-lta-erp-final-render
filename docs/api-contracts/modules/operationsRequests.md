---
module: operationsRequests
contract_version: 2.0.0
frozen_at: 2026-10-04
frozen_by: P0-H
base_url: /v1/operations-requests
---

# /v1/operations-requests — Operations Requests & Workflow Transitions API Contract

## Overview
Manages inter-departmental operations requests and governed workflow transitions (`wr_phase_transition`). Provides asynchronous request lifecycles (`pending` → `fulfilled` | `rejected` | `cancelled`) with automated notification dispatch to Admins and requesters, advancement gate checks, and anti-duplicate deduplication.

- **Guards:** Authenticated, entity-scoped (`X-Active-Entity: ATA|LTA`).
- **Base URL:** `/v1/operations-requests`

---

## 1. Request Types & Permissions

| Request Type | Creator Permission | Resolver / Fulfiller Permission | Notes |
| :--- | :--- | :--- | :--- |
| `wr_phase_transition` | `workflow:transition_request` (Admin, Manager) | `workflow:phase_transition` (Admin only) | Advances WR phase on fulfillment |
| `billing` | `billing:request` or `workflow:edit` | `billing:edit` | Requests invoice generation |
| `disbursement` | `disbursement:request` or `workflow:edit` | `disbursement:edit` | Requests funds release |
| `transmittal` | `transmittal:request` or `workflow:edit` | `transmittal:create` | Requests document delivery |
| `client` | `workflow:edit` | `workflow:edit` | Client record modification request |
| `workflow` | `workflow:edit` | `workflow:edit` | General workflow request |

---

## 2. Endpoints

### 2.1 `GET /v1/operations-requests`
Lists operations requests matching filter criteria.

- **Guards:** Authenticated, `workflow:view`.
- **Since-version:** `1.0.0` (extended in `2.0.0` for phase transitions).
- **Events Emitted:** None.

#### Query Parameters (Zod: `listQuerySchema`)
| Parameter | Type | Required | Default | Description |
| :--- | :--- | :---: | :---: | :--- |
| `status` | enum (`pending`, `fulfilled`, `rejected`, `cancelled`) | No | — | Filter by request status |
| `type` | enum (`billing`, `disbursement`, `transmittal`, `client`, `workflow`, `wr_phase_transition`) | No | — | Filter by request type |
| `workRequestId` | UUID | No | — | Filter by linked work request |
| `clientId` | UUID | No | — | Filter by linked client |
| `linkedTaskId` | UUID | No | — | Filter by linked task |
| `requestedBy` | UUID | No | — | Filter by requester user ID |
| `page` | integer | No | 1 | Page number (min 1) |
| `limit` | integer | No | 50 | Items per page (min 1, max 1000) |

#### Response (200 OK)
```json
{
  "data": [
    {
      "id": "uuid",
      "entity_id": "uuid",
      "type": "wr_phase_transition",
      "work_request_id": "uuid",
      "client_id": "uuid",
      "linked_task_id": null,
      "requested_by": "uuid",
      "amount": null,
      "status": "pending",
      "notes": "{\"from_phase\":\"pre_processing\",\"to_phase\":\"processing\"}",
      "from_phase": "pre_processing",
      "to_phase": "processing",
      "created_at": "2026-10-04T02:00:00Z"
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 50
  }
}
```

---

### 2.2 `POST /v1/operations-requests`
Submits a new operations request. Includes a 5-second deduplication guard and gate pre-validation for phase transitions.

- **Guards:** Authenticated, `workflow:view` + context permission (`workflow:transition_request` for `wr_phase_transition`).
- **Since-version:** `2.0.0` (`wr_phase_transition` type).
- **Events Emitted:** `wr.transition_request.received` (dispatched to all active Admins when type is `wr_phase_transition`).

#### Request Body (Zod: `createRequestSchema`)
| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `type` / `request_type` | enum (`billing`, `disbursement`, `transmittal`, `client`, `workflow`, `wr_phase_transition`) | Yes | Request classification |
| `workRequestId` / `work_request_id` | UUID | Conditional | Target work request ID (required for `wr_phase_transition`) |
| `clientId` / `client_id` | UUID | No | Associated client ID |
| `linkedTaskId` / `linked_task_id` | UUID | No | Associated task ID |
| `amount` | number (non-negative) | No | Currency amount (for billing/disbursement) |
| `notes` | string (max 2000) | No | Optional requester notes |
| `from_phase` / `fromPhase` | string | No | Source phase (for `wr_phase_transition`) |
| `to_phase` / `toPhase` | string | No | Target phase (for `wr_phase_transition`) |
| `payload` | object | No | Optional metadata container (can specify `work_request_id`, `from_phase`, `to_phase`) |

#### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `400 Bad Request` | `VALIDATION_ERROR` | Missing `type`/`request_type` or invalid payload format |
| `400 Bad Request` | `BAD_REQUEST` | `work_request_id` missing on `wr_phase_transition` |
| `403 Forbidden` | `FORBIDDEN` | Missing `workflow:transition_request` for `wr_phase_transition` |
| `404 Not Found` | `NOT_FOUND` | Referenced `work_request_id` does not exist |
| `409 Conflict` | `PHASE_MISMATCH` | Work request current phase does not match requested `from_phase` |
| `409 Conflict` | `GATE_PREREQUISITE_FAILED` | Incomplete prerequisite tasks in current phase |

---

### 2.3 `GET /v1/operations-requests/:id`
Retrieves a single operations request by ID with joined client and requester details.

- **Guards:** Authenticated, `workflow:view`.
- **Since-version:** `1.0.0`.
- **Events Emitted:** None.

---

### 2.4 `PUT /v1/operations-requests/:id`
Updates or resolves an operations request (`fulfilled` or `rejected`).

- **Guards:** Authenticated, `workflow:view` + context resolver permission (`workflow:phase_transition` for resolving `wr_phase_transition`).
- **Since-version:** `2.0.0` (atomic phase advancement on fulfillment, rejection reason validation).
- **Events Emitted:** `wr.transition_request.resolved` (dispatched to requester with `outcome: 'approved'` or `outcome: 'rejected'`).

#### Request Body (Zod: `updateRequestSchema`)
| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `status` | enum (`pending`, `fulfilled`, `rejected`, `cancelled`) | No | Target status |
| `notes` | string (max 2000) | No | Updated notes |
| `rejectionReason` / `rejection_reason` | string (max 2000) | Conditional | Mandatory when `status = 'rejected'` |
| `fulfilledBy` / `fulfilled_by` | UUID | No | User ID fulfilling the request |

#### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `400 Bad Request` | `BAD_REQUEST` | `status = 'rejected'` without a non-empty `rejectionReason` |
| `403 Forbidden` | `FORBIDDEN` | Caller lacks resolver permission (e.g. `workflow:phase_transition` for Admin) |
| `404 Not Found` | `NOT_FOUND` | Operations request not found |
| `409 Conflict` | `OPERATIONS_REQUEST_ALREADY_RESOLVED` | Request is not in `pending` status (already fulfilled or rejected) |
| `409 Conflict` | `GATE_PREREQUISITE_FAILED` | Prerequisite tasks became incomplete prior to fulfillment |

---

### 2.5 `DELETE /v1/operations-requests/:id`
Cancels / deletes an operations request. Only the requester or users with `workflow:edit` may cancel.

- **Guards:** Authenticated, `workflow:view` + ownership check.
- **Since-version:** `1.0.0`.
- **Events Emitted:** None.

---

### 2.6 `GET /v1/operations-requests/counts`
Returns aggregate badge counts of pending requests for the active entity.

- **Guards:** Authenticated, `workflow:view`.
- **Since-version:** `1.0.0`.
- **Events Emitted:** None.
