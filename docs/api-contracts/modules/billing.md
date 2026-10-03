---
module: billing
contract_version: 2.0.0
frozen_at: 2026-10-04
frozen_by: P0-H
base_url: /v1/invoices
---

# /v1/invoices — Billing, Invoicing & Payments API Contract

## Overview
Manages billing invoices, payment schedules, accounts receivable aging, and payment receipts. Enforces field-level security for invoice client address modifications (`billing:edit_client_address`), line item validation, and immutable client master records.

- **Guards:** Authenticated, entity-scoped (`X-Active-Entity: ATA|LTA`).
- **Base URL:** `/v1/invoices`

---

## 1. Field-Level Security Guard (P0-G / AC-4)

When updating an existing invoice (`PUT` or `PATCH /v1/invoices/:id`):
- If the request body touches `address` or `clientAddress`, the caller must hold `billing:edit_client_address` (granted to Accounting, Management, and Admin).
- If neither address field is present, the caller requires standard invoice update permissions (`billing:edit` or `billing:request`).
- **Client Master Record Immutability:** Updating `address` on an invoice updates only the invoice snapshot. The client's master record in `clients` is immutable to billing operations.

---

## 2. Endpoints

### 2.1 `GET /v1/invoices`
Lists invoices for the active entity with pagination and query filters.

- **Guards:** Authenticated, `billing:view`.
- **Since-version:** `1.0.0`.
- **Events Emitted:** None.

---

### 2.2 `POST /v1/invoices`
Creates a new invoice record with line items.

- **Guards:** Authenticated, `billing:edit`.
- **Since-version:** `1.0.0`.
- **Events Emitted:** None.

#### Request Body (Zod: `createInvoiceSchema`)
| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `clientId` | UUID | Yes | Client ID association |
| `workRequestId` | UUID | Yes | Associated work request ID |
| `linkedTaskId` | UUID \| null | No | Optional linked task ID |
| `linkedTransmittalId` | UUID \| null | No | Optional linked transmittal ID |
| `invoiceNumber` | string (1–50) | Yes | Unique invoice reference number |
| `issueDate` | string | Yes | Invoice issuance date (YYYY-MM-DD) |
| `dueDate` | string | Yes | Payment due date (YYYY-MM-DD) |
| `status` | string (max 50) | No | Initial status (e.g. `Draft`, `Issued`) |
| `lineItems` | array of `lineItemSchema` | Yes | Minimum 1 line item required |
| `notes` | string (max 2000) \| null | No | Invoice notes |
| `terms` | string (max 2000) \| null | No | Payment terms |

#### `lineItemSchema`
| Field | Type | Required | Default | Description |
| :--- | :--- | :---: | :---: | :--- |
| `description` | string (1–500) | Yes | — | Item description |
| `amount` | number (non-negative) | Yes | — | Item amount |
| `type` | enum (`Professional Fee`, `Government Fee`, `Other`) | No | `Professional Fee` | Item category |

#### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `400 Bad Request` | `VALIDATION_ERROR` | Empty line items, negative amounts, or missing required fields |
| `403 Forbidden` | `FORBIDDEN` | Missing `billing:edit` permission |

---

### 2.3 `GET /v1/invoices/:id`
Retrieves a single invoice by ID with line items, payments, and client metadata.

- **Guards:** Authenticated, `billing:view`.
- **Since-version:** `1.0.0`.
- **Events Emitted:** None.

---

### 2.4 `PUT /v1/invoices/:id` (and `PATCH`)
Updates invoice fields. Protected by field-level security.

- **Guards:** Authenticated, `fieldLevelSecurity` middleware (`billing:edit_client_address` if modifying address; `billing:edit` or `billing:request` otherwise).
- **Since-version:** `2.0.0` (P0-G field-level security).
- **Events Emitted:** None.

#### Request Body (Zod: `updateInvoiceSchema`)
Partial of `createInvoiceSchema` plus:
| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `address` / `clientAddress` | string (max 500) | No | Invoice snapshot client address (requires `billing:edit_client_address`) |
| `archived` | boolean | No | Soft archive state |
| `expectedVersion` | integer (> 0) | No | OCC optimistic concurrency control version |

#### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `403 Forbidden` | `FORBIDDEN` | Modifying address without `billing:edit_client_address` or updating other fields without `billing:edit`/`billing:request` |
| `404 Not Found` | `NOT_FOUND` | Invoice not found |
| `409 Conflict` | `CONCURRENCY_CONFLICT` | OCC version mismatch |

---

### 2.5 `POST /v1/invoices/:id/payments`
Records a payment against an invoice.

- **Guards:** Authenticated, `billing:payments` (Accounting, Admin).
- **Since-version:** `1.0.0`.
- **Events Emitted:** None.

#### Request Body (Zod: `recordPaymentSchema`)
| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `amount` | number (> 0) | Yes | Positive payment amount |
| `method` | string (1–50) | Yes | Payment method (e.g. `Check`, `Bank Transfer`, `Cash`) |
| `reference` | string (max 100) \| null | No | Transaction reference or check number |
| `date` | string | Yes | Payment receipt date |
| `notes` | string (max 500) \| null | No | Optional payment notes |

---

### 2.6 `GET /v1/invoices/aging`
Returns the accounts receivable aging report grouped by client and age brackets (0–30, 31–60, 61–90, 90+ days).

- **Guards:** Authenticated, `billing:view`.
- **Since-version:** `1.0.0`.
- **Events Emitted:** None.

---

### 2.7 `GET /v1/invoices/counts`
Returns aggregate invoice counts by status for the active entity.

- **Guards:** Authenticated, `billing:view`.
- **Since-version:** `1.0.0`.
- **Events Emitted:** None.
