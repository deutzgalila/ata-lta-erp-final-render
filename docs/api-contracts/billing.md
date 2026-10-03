# Billing & Invoices API Contract — Field-Level Security & Client Immutability

> **Owner**: Worker-FINPERM (Parcel P0-G)  
> **Status**: Frozen (Wave 2)  
> **Date**: 2026-10-03  
>
> Downstream modules (P0-H Contract Freeze, P2 Billing React Module) depend on these contracts.

---

## 1. Authentication & Common Headers

All HTTP endpoints require:
- `Authorization: Bearer <supabase-jwt>`
- `X-Active-Entity: ATA|LTA`

All error responses conform to RFC 7807 `application/problem+json`:
```json
{
  "status": 403,
  "title": "Forbidden",
  "detail": "Permission billing:edit_client_address is required to modify client address"
}
```

---

## 2. Field-Level Security (FLS) & Permission Scoping

Invoice updates (`PATCH /v1/invoices/:id` and `PUT /v1/invoices/:id`) enforce dynamic Field-Level Security based on request payload content:

| Payload Content | Required Permission | Allowed Roles / Departments | Forbidden Roles / Response |
|---|---|---|---|
| Contains `address` or `clientAddress` | `billing:edit_client_address` | Accounting, Management, Admin | Operations, Documentation, HR → **HTTP 403 Forbidden** |
| Does **NOT** contain `address` | `billing:edit` OR `billing:request` | Accounting, Management, Admin, Operations | Unauthenticated / external → **HTTP 401 / 403** |

---

## 3. Client Master Record Immutability (Rule R4 & AC-5)

### Architectural Ground Truth
- **Source of Truth Distinction**: Prior to P0-G, billing read client address via foreign-key join (`invoices.client_id -> clients.address`).
- **Billing Record Override**: When client address is updated via billing (`PATCH /v1/invoices/:id`), the new address is stored directly on the invoice record (`invoices.address`).
- **Master Immutability Guarantee**: The master `clients` table row is **NEVER** updated, touched, or mutated during invoice updates. The master `clients` record remains 100% byte-identical before and after the billing operation.

---

## 4. Endpoints

### 4.1 Update Invoice (PATCH / PUT)

- **Method**: `PATCH` / `PUT`
- **Path**: `/v1/invoices/:id`
- **Guard**: Dynamic Field-Level Security (FLS)
- **Request Headers**:
  - `Authorization: Bearer <token>`
  - `X-Active-Entity: ATA`
  - `If-Match: "<version>"` (optional OCC optimistic concurrency check)

#### Request Body (With Address Update — Accounting / Admin only)
```json
{
  "address": "456 Corporate Center, Suite 800, BGC, Taguig City, Philippines"
}
```

- **Response (200 OK — Accounting / Admin)**:
```json
{
  "data": {
    "id": "e4e82a50-a85c-4c27-bda9-de1d00ab2bec",
    "entity_id": "ent-ata",
    "entity_code": "ATA",
    "invoice_number": "ATA-SI-2026-0001",
    "client_id": "11111111-1111-1111-1111-111111111111",
    "address": "456 Corporate Center, Suite 800, BGC, Taguig City, Philippines",
    "status": "Draft",
    "subtotal": 15000,
    "total": 15000,
    "balance": 15000,
    "version": 2,
    "updated_at": "2026-10-03T12:45:00.000Z"
  }
}
```

- **Response (403 Forbidden — Operations attempting address update)**:
```json
{
  "status": 403,
  "title": "Forbidden",
  "detail": "Permission billing:edit_client_address is required to modify client address"
}
```

#### Request Body (Without Address Update — Operations allowed)
```json
{
  "notes": "Operations verified deliverables; invoice approved for courier dispatch"
}
```

- **Response (200 OK — Operations)**:
```json
{
  "data": {
    "id": "e4e82a50-a85c-4c27-bda9-de1d00ab2bec",
    "notes": "Operations verified deliverables; invoice approved for courier dispatch",
    "version": 2
  }
}
```

- **Error Responses**:
  - `400 Bad Request`: Validation error (e.g. `address` string exceeds 500 characters, invalid line items).
  - `401 Unauthorized`: Missing or invalid token.
  - `403 Forbidden`: User lacks necessary base or field permission.
  - `404 Not Found`: Invoice not found for active entity.
  - `409 Conflict`: OCC concurrency version conflict (`ERR_CONCURRENCY_CONFLICT`).

---

## 5. Field-Level Audit Logging

When an invoice client address is modified, a dedicated field-level audit entry is persisted in the `audit_logs` table:

```json
{
  "action": "billing.address_update",
  "table_name": "invoices",
  "record_id": "e4e82a50-a85c-4c27-bda9-de1d00ab2bec",
  "entity": "ATA",
  "user_id": "acct-user-uuid",
  "details": {
    "field": "address",
    "from": "100 Ayala Avenue, Makati City, Metro Manila",
    "to": "456 Corporate Center, Suite 800, BGC, Taguig City, Philippines"
  }
}
```

- Non-address invoice updates continue to record the standard `invoice.update` audit entry.
- Address updates record both the field-level diff (`billing.address_update`) and the standard update log.
