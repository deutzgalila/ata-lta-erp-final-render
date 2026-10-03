# Disbursements API Contract

> **Owner**: Worker-FINPERM (Parcel P0-G)  
> **Status**: Frozen (Wave 2)  
> **Date**: 2026-10-03  
>
> Downstream modules (P0-H Contract Freeze, P2 Disbursements React Module) depend on these contracts.

---

## 1. Authentication & Common Headers

All HTTP endpoints require:
- `Authorization: Bearer <supabase-jwt>`
- `X-Active-Entity: ATA|LTA` (or `ALL` for badge counters)

All error responses conform to RFC 7807 `application/problem+json`:
```json
{
  "status": 403,
  "title": "Forbidden",
  "detail": "Permission disbursement:approve is required"
}
```

---

## 2. Disbursement Status Lifecycle

Disbursement records follow this deterministic lifecycle:
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

- **Creation Routing (AC-1, R1):**
  - Staff creators (`HR`, `Operations`, `Documentation`) produce records initialized in `Pending`.
  - Non-staff creators (`Management`, `Accounting`, `Admin`) produce records initialized in `Draft`.
  - Client-supplied `status` values on creation are strictly prohibited; status forgery returns HTTP `400 Bad Request`.
- **Approval Gate (AC-2, R2, R3):**
  - Only `Admin` holding `disbursement:approve` can approve disbursements.
  - Transitions strictly from `Pending` → `Approved`.
  - Approving a disbursement in any status other than `Pending` (including already-`Approved` or `Draft`) returns HTTP `409 Conflict`.
- **Rejection Flow (AC-3, R2, R5):**
  - Only `Admin` holding `disbursement:approve` can reject disbursements.
  - Requires mandatory non-empty `reason` string (trimmed length >= 1; HTTP `400 Bad Request` if missing or whitespace).
  - Transitions strictly from `Pending` → `Rejected` (rejecting from `Approved` or `Draft` returns HTTP `409 Conflict`).
  - Stores `rejection_reason`, `rejected_by`, `rejected_at` on the disbursement record.
  - Emits in-app `pending_request.resolved` notification to the creator (`requested_by`). Notification failures are non-blocking.

---

## 3. Endpoints

### 3.1 Create Disbursement

- **Method**: `POST`
- **Path**: `/v1/disbursements`
- **Guard**: `disbursement:create` (granted to all departments per P0-A)
- **Request Body**:
```json
{
  "category": "Transportation",
  "description": "Travel expenses for client onsite visit",
  "amount": 2500,
  "fundSource": "Firm Fund",
  "clientId": "11111111-1111-1111-1111-111111111111",
  "linkedWorkRequestId": "33333333-3333-3333-3333-333333333333",
  "linkedTaskId": "44444444-4444-4444-4444-444444444444",
  "linkedTransmittalId": null,
  "dueDate": "2026-10-31",
  "notes": "Original receipt submitted to admin"
}
```
*Note: Any client payload including a `status` field is rejected with HTTP 400.*

- **Response (201 Created — Staff creator)**:
```json
{
  "data": {
    "id": "c1f54790-21a4-4f9e-a0e2-638bc93a8d11",
    "disbursement_number": "DISB-ATA-20261003-0001",
    "entity_id": "ent-ata",
    "entity_code": "ATA",
    "category": "Transportation",
    "description": "Travel expenses for client onsite visit",
    "amount": 2500,
    "fund_source": "Firm Fund",
    "status": "Pending",
    "requested_by": "user-uuid",
    "created_by": "user-uuid",
    "updated_by": "user-uuid",
    "created_at": "2026-10-03T12:00:00.000Z",
    "version": 1
  }
}
```

- **Response (201 Created — Management / Accounting / Admin creator)**:
```json
{
  "data": {
    "id": "c1f54790-21a4-4f9e-a0e2-638bc93a8d11",
    "status": "Draft",
    "disbursement_number": "DISB-ATA-20261003-0002"
  }
}
```

- **Error Responses**:
  - `400 Bad Request`: Validation failure or status forgery attempt (`"Explicit status cannot be set on creation; status forgery is prohibited"`).
  - `401 Unauthorized`: Missing or invalid bearer token.
  - `403 Forbidden`: User lacks `disbursement:create`.

---

### 3.2 Approve Disbursement

- **Method**: `POST`
- **Path**: `/v1/disbursements/:id/approve`
- **Guard**: `disbursement:approve` (strictly Admin only per R3)
- **Request Body**: empty or `{}`
- **Response (200 OK)**:
```json
{
  "data": {
    "id": "c1f54790-21a4-4f9e-a0e2-638bc93a8d11",
    "disbursement_number": "DISB-ATA-20261003-0001",
    "status": "Approved",
    "approved_by": "admin-uuid",
    "approved_at": "2026-10-03T12:30:00.000Z",
    "version": 2
  }
}
```
- **Side Effect**: Dispatches non-blocking `pending_request.resolved` notification to `requested_by`.
- **Error Responses**:
  - `401 Unauthorized`: Missing authentication.
  - `403 Forbidden`: User lacks `disbursement:approve` (non-admin caller).
  - `404 Not Found`: Disbursement does not exist.
  - `409 Conflict`: Disbursement status is not `Pending` (e.g. already `Approved` or in `Draft`).

---

### 3.3 Reject Disbursement

- **Method**: `POST`
- **Path**: `/v1/disbursements/:id/reject`
- **Guard**: `disbursement:approve` (strictly Admin only per R3)
- **Request Body**:
```json
{
  "reason": "Exceeds quarterly department budget for onsite visits"
}
```
- **Validation**: `reason` must be a non-empty, trimmed string (max 500 characters).
- **Response (200 OK)**:
```json
{
  "data": {
    "id": "c1f54790-21a4-4f9e-a0e2-638bc93a8d11",
    "disbursement_number": "DISB-ATA-20261003-0001",
    "status": "Rejected",
    "rejected_by": "admin-uuid",
    "rejected_at": "2026-10-03T12:35:00.000Z",
    "rejection_reason": "Exceeds quarterly department budget for onsite visits",
    "version": 2
  }
}
```
- **Side Effect**: Dispatches non-blocking `pending_request.resolved` notification to `requested_by`.
- **Error Responses**:
  - `400 Bad Request`: `reason` is missing, empty, or whitespace-only.
  - `401 Unauthorized`: Missing authentication.
  - `403 Forbidden`: User lacks `disbursement:approve` (non-admin caller).
  - `404 Not Found`: Disbursement does not exist.
  - `409 Conflict`: Disbursement status is not `Pending` (e.g. attempting to reject from `Approved`, `Draft`, or `Rejected`).

---

## 4. Notification Integration (`pending_request.resolved`)

On approval or rejection, the resolution event is dispatched to the disbursement creator (`requested_by || created_by`):

- **Type**: `pending_request.resolved`
- **Payload Schema**:
```json
{
  "request_id": "c1f54790-21a4-4f9e-a0e2-638bc93a8d11",
  "table_name": "disbursements",
  "outcome": "approved" | "rejected",
  "reason": "Exceeds quarterly budget allocation",
  "title": "DISB-ATA-20261003-0001"
}
```
- **Error Behavior**: Dispatched asynchronously via non-blocking try/catch. Notification failure NEVER fails the HTTP approve/reject transaction (Rule R5).

---

## 5. Summary of Rules

| Rule | Enforcement | Result on Violation |
|---|---|---|
| R1 | Client status forgery rejected | HTTP 400 Bad Request |
| R2 | Approve/reject valid only from `Pending` | HTTP 409 Conflict |
| R2 | Rejection reason strictly mandatory | HTTP 400 Bad Request |
| R3 | `disbursement:approve` held strictly by Admin | HTTP 403 Forbidden |
| R5 | Notification emission non-blocking | HTTP 200 preserved |
| R6 | Existing release / fund workflow untouched | Maintained |
