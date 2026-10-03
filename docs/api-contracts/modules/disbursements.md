---
module: disbursements
contract_version: 2.0.0
frozen_at: 2026-10-04
frozen_by: P0-H
base_url: /v1/disbursements
---

# /v1/disbursements — Disbursements API Contract

## Overview
Manages firm and client fund expense disbursements, payment releases, funding reconciliation, and approval lifecycles. Enforces role-based initial status assignment (Staff create as `Pending`, Managers/Accounting/Admin create as `Draft`), status anti-forgery guards, and exclusive Admin approval/rejection (`disbursement:approve`).

- **Guards:** Authenticated, entity-scoped (`X-Active-Entity: ATA|LTA`).
- **Base URL:** `/v1/disbursements`

---

## 1. Status Lifecycle

```
                      ┌───────────────┐
                      │  Staff Create │
                      └───────┬───────┘
                              ▼
┌──────────────┐   submit   ┌─────────┐   approve   ┌──────────┐   release   ┌──────────┐   fund   ┌────────┐
│    Draft     ├───────────►│ Pending ├────────────►│ Approved ├────────────►│ Released ├─────────►│ Funded │
└──────────────┘            └────┬────┘             └──────────┘             └──────────┘          └────────┘
  ▲ (Mgmt/Acct/Admin              │
     Create)                      │ reject
                                  ▼
                            ┌──────────┐
                            │ Rejected │
                            └──────────┘
```

### Initial Creation Status
- **Staff** (`HR`, `Operations`, `Documentation`): Initialized directly in `Pending` awaiting approval.
- **Management, Accounting, Admin**: Initialized in `Draft` (requiring explicit `/submit` or direct processing).
- **Anti-Forgery Guard:** Providing any `status` field in the creation payload returns `400 Bad Request` (`status forgery is prohibited`).

---

## 2. Endpoints

### 2.1 `GET /v1/disbursements`
Lists disbursements for the active entity with pagination and status filters.

- **Guards:** Authenticated, `disbursement:view`.
- **Since-version:** `1.0.0`.
- **Events Emitted:** None.

---

### 2.2 `POST /v1/disbursements`
Creates a new disbursement record.

- **Guards:** Authenticated, `disbursement:create`.
- **Since-version:** `2.0.0` (P0-G role-based initial status, status anti-forgery).
- **Events Emitted:** None.

#### Request Body (Zod: `createDisbursementSchema`)
| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `category` | string (1–50) | Yes | Disbursement category (e.g. `Government Fee`, `Transportation`, `Supplies`) |
| `description` | string (1–2000) | Yes | Expense explanation and purpose |
| `amount` | number (> 0) | Yes | Positive disbursement amount |
| `fundSource` | enum (`Firm Fund`, `Client Fund`) | Yes | Source of disbursement funds |
| `linkedWorkRequestId` | UUID | Yes | Required link to parent work request |
| `clientId` | UUID \| null | No | Optional client association |
| `employeeId` | UUID \| null | No | Optional employee reimbursement target |
| `linkedInvoiceId` | UUID \| null | No | Optional invoice association |
| `linkedTaskId` | UUID \| null | No | Optional task association |
| `linkedTransmittalId` | UUID \| null | No | Optional transmittal association |
| `dueDate` | ISO date string \| null | No | Expense due date |
| `notes` | string (max 2000) \| null | No | Internal notes |
| `receiptS3Key` | string (max 500) \| null | No | S3 key for uploaded receipt image/pdf |
| `receiptFilename` | string (max 255) \| null | No | Original filename of uploaded receipt |
| `status` | never | No | **Forbidden:** Setting explicit status triggers 400 Bad Request |

#### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `400 Bad Request` | `VALIDATION_ERROR` | `amount <= 0`, missing required fields, or explicit `status` supplied |
| `403 Forbidden` | `FORBIDDEN` | Missing `disbursement:create` permission |

---

### 2.3 `GET /v1/disbursements/:id`
Retrieves a single disbursement record with audit log and attachments.

- **Guards:** Authenticated, `disbursement:view`.
- **Since-version:** `1.0.0`.
- **Events Emitted:** None.

---

### 2.4 `PUT /v1/disbursements/:id`
Updates a disbursement record in `Draft` or `Pending` status.

- **Guards:** Authenticated, `disbursement:edit`.
- **Since-version:** `1.0.0` (OCC `expectedVersion` added in `2.0.0`).
- **Events Emitted:** None.

---

### 2.5 `POST /v1/disbursements/:id/submit`
Submits a `Draft` disbursement for approval (moves to `Pending`).

- **Guards:** Authenticated, `disbursement:create`.
- **Since-version:** `1.0.0`.
- **Events Emitted:** None.

---

### 2.6 `POST /v1/disbursements/:id/approve`
Approves a disbursement currently in `Pending` status. Moves to `Approved`.

- **Guards:** Authenticated, `disbursement:approve` (Admin only per P0-A manifest).
- **Since-version:** `2.0.0` (P0-G route guard enforcement).
- **Events Emitted:** None.

#### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `401 Unauthorized` | `UNAUTHORIZED` | Missing or invalid auth bearer token |
| `403 Forbidden` | `FORBIDDEN` | Caller lacks `disbursement:approve` (non-Admin role) |
| `404 Not Found` | `NOT_FOUND` | Disbursement not found |
| `409 Conflict` | `INVALID_STATUS` | Disbursement is not currently in `Pending` status |

---

### 2.7 `POST /v1/disbursements/:id/reject`
Rejects a disbursement currently in `Pending` status. Moves to `Rejected`.

- **Guards:** Authenticated, `disbursement:approve` (Admin only per P0-A manifest).
- **Since-version:** `2.0.0` (P0-G mandatory reason and in-app notification).
- **Events Emitted:** `pending_request.resolved` (dispatched to creator with `action: 'rejected'`).

#### Request Body (Zod: `rejectSchema`)
| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `reason` | string (trimmed, 1–500) | Yes | Required justification for rejection |

#### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `400 Bad Request` | `VALIDATION_ERROR` | Missing or whitespace-only rejection `reason` |
| `403 Forbidden` | `FORBIDDEN` | Caller lacks `disbursement:approve` |
| `404 Not Found` | `NOT_FOUND` | Disbursement not found |
| `409 Conflict` | `INVALID_STATUS` | Disbursement is not currently in `Pending` status |

---

### 2.8 `POST /v1/disbursements/:id/release`
Records funds release for an approved disbursement (`Approved` → `Released`).

- **Guards:** Authenticated, `disbursement:mark_released` (Accounting, Admin).
- **Since-version:** `1.0.0`.
- **Events Emitted:** None.

---

### 2.9 `POST /v1/disbursements/:id/fund`
Marks a released disbursement as funded / reconciled (`Released` → `Funded`).

- **Guards:** Authenticated, `disbursement:mark_released` (Accounting, Admin).
- **Since-version:** `1.0.0`.
- **Events Emitted:** None.

---

### 2.10 `GET /v1/disbursements/counts`
Returns badge counts of disbursements by status for the active entity or `ALL`.

- **Guards:** Authenticated, `disbursement:view`.
- **Since-version:** `1.0.0`.
- **Events Emitted:** None.
