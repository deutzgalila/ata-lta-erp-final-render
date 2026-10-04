---
module: reports
contract_version: 2.0.0
frozen_at: 2026-10-04
frozen_by: P2-7-Freeze
base_url: /v1/reports
---

# /v1/reports — Reports & Analytics API Contract

## Overview
Provides read-only operational analytics, user-filtered dashboard calendar items, periodic activity logs (daily and weekly), monthly pending items, and accounts receivable aging summaries across all system entities.
Enforces RBAC scoping across all endpoints, entity resolution (supporting `ATA`, `LTA`, and consolidated enterprise `ALL`), strict per-user calendar visibility isolation, and dual-layer caching (in-memory server cache + HTTP Cache-Control headers).

- **Guards:** Authenticated (`Authorization: Bearer <token>`), entity-scoped (`X-Active-Entity: ATA|LTA|ALL`).
- **Base URL:** `/v1/reports`
- **Read-Only Tenet:** All report endpoints are read-only; no database mutations or audit logs are created.
- **Entity Consolidation:** Supports `X-Active-Entity: ALL` for consolidated enterprise reporting across ATA and LTA entities.
- **Caching Behavior & Headers:**
  - 30-second in-memory server cache (`ANALYTICS_CACHE_TTL_MS = 30000`) for computed analytics and dashboard summary metrics keyed by entity.
  - HTTP `Cache-Control: private, max-age=30` header returned on `/v1/reports/analytics`.
  - HTTP `Cache-Control: private, no-store` header returned on `/v1/reports/dashboard` because calendar items are visibility-filtered per authenticated user. The calendar payload is NEVER cached in shared server memory to prevent cross-account calendar data leakage.
  - RPC Fallback: `/v1/reports/dashboard` attempts a single Supabase RPC call `get_dashboard_summary({ entity_id })`. If the RPC is unavailable or fails, it falls back gracefully to the parallelized `computeAnalytics` aggregation.

---

## 1. Security & RBAC Scoping

| Endpoint | Guard Permission | Scope & Notes |
| :--- | :--- | :--- |
| `GET /analytics` | `reports:view` | Entity-scoped (`ATA`, `LTA`, or consolidated `ALL`) |
| `GET /dashboard` | `workflow:view` | Entity-scoped (`ATA`, `LTA`, or `ALL`). Calendar items are user-scoped: Back-office (`Admin`) sees all items; Accounting sees all disbursements; non-admin staff only see work requests and linked disbursements they are directly concerned with. |
| `GET /daily` | `reports:view` | Scoped to active entity code (`ATA` or `LTA`) |
| `GET /weekly` | `reports:view` | Scoped to active entity code (`ATA` or `LTA`) |
| `GET /monthly-pending` | `reports:view` | Scoped to active entity code (`ATA` or `LTA`) |
| `GET /aging` | `billing:view` | Scoped to active entity code (`ATA` or `LTA`) |

### RFC 7807 Error Response Format
All error responses from this module conform to RFC 7807 `application/problem+json`:
```json
{
  "status": 400,
  "title": "Validation Error",
  "detail": "date: Date must be in YYYY-MM-DD format"
}
```
Standard properties:
- `status` (integer): HTTP status code matching response status.
- `title` (string): Short human-readable summary of problem type.
- `detail` (string): Specific human-readable explanation of the error.
- `code` (string, optional): Machine-readable error code if explicitly configured.

---

## 2. Endpoints

### 2.1 `GET /v1/reports/analytics`
Returns dashboard-level operational metrics across clients, work requests, documents, invoices, disbursements, transmittals, and net revenue.

- **Guards:** Authenticated, `reports:view`.
- **Headers:** `X-Active-Entity: ATA|LTA|ALL`.
- **Since-version:** `1.0.0` (frozen at `2.0.0`).
- **Cache-Control:** `private, max-age=30`.
- **Events Emitted:** None.

#### Query Parameters
None. The endpoint does not accept query parameters; `req.query` is ignored by `reportsController.analytics`. All calculated metrics reflect all non-deleted records for the resolved entity.

> **Implementation Note:** Although `analyticsQuerySchema` (`startDate?: string`, `endDate?: string`) is defined in `backend/src/modules/reports/schema.js`, the live controller does not parse or forward these query parameters to `service.getAnalytics`. Passing date parameters has no effect on the calculations in live 2.0.0.

#### Single Entity Response (`X-Active-Entity: ATA` or `LTA`) (200 OK)
```json
{
  "data": {
    "clients": {
      "total": 42
    },
    "workRequests": {
      "total": 128
    },
    "documents": {
      "total": 350
    },
    "invoices": {
      "total": 65,
      "totalBilled": 1250000.0,
      "totalCollected": 950000.0,
      "totalOutstanding": 300000.0,
      "byStatus": {
        "Paid": 45,
        "Partial": 10,
        "Sent": 10
      }
    },
    "disbursements": {
      "total": 80,
      "totalAmount": 420000.0,
      "releasedAmount": 380000.0,
      "byStatus": {
        "Released": 70,
        "Pending": 10
      }
    },
    "transmittals": {
      "total": 30,
      "byStatus": {
        "Delivered": 25,
        "In Transit": 5
      }
    },
    "revenue": {
      "totalBilled": 1250000.0,
      "totalCollected": 950000.0,
      "totalOutstanding": 300000.0,
      "totalExpenses": 380000.0,
      "netIncome": 570000.0
    }
  }
}
```

#### Consolidated Response (`X-Active-Entity: ALL`) (200 OK)
```json
{
  "data": {
    "analyticsByEntity": {
      "ATA": {
        "clients": { "total": 25 },
        "workRequests": { "total": 70 },
        "documents": { "total": 200 },
        "invoices": { ... },
        "disbursements": { ... },
        "transmittals": { ... },
        "revenue": { ... }
      },
      "LTA": {
        "clients": { "total": 17 },
        "workRequests": { "total": 58 },
        "documents": { "total": 150 },
        "invoices": { ... },
        "disbursements": { ... },
        "transmittals": { ... },
        "revenue": { ... }
      }
    }
  }
}
```

#### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `401 Unauthorized` | `UNAUTHORIZED` | Missing, expired, or invalid JWT bearer token |
| `403 Forbidden` | `FORBIDDEN` | Caller lacks `reports:view` permission |

---

### 2.2 `GET /v1/reports/dashboard`
Returns high-performance dashboard analytics combined with upcoming and overdue calendar items. Implements user-scoped visibility filtering and Supabase RPC optimization with an automatic JS aggregator fallback.

- **Guards:** Authenticated, `workflow:view`.
- **Headers:** `X-Active-Entity: ATA|LTA|ALL`.
- **Since-version:** `1.0.0` (frozen at `2.0.0`).
- **Cache-Control:** `private, no-store` (ensures browser and proxies never store user-scoped calendar data).
- **Events Emitted:** None.

#### Optimization & Fallback Architecture
1. **RPC Fast Path:** Attempts to invoke Supabase RPC `get_dashboard_summary({ entity_id })`.
2. **Aggregator Fallback:** If the RPC fails or is unavailable, falls back to `computeAnalytics(entityId)` which queries counts and summaries across all operational tables in parallel.
3. **In-Memory Cache (30s):** Aggregated analytics are cached in memory for 30 seconds per entity.
4. **Calendar Isolation:** The `calendar` items array is **never cached**. It is dynamically computed and filtered for the authenticated user on every request:
   - **Work Requests (`type: 'wr'`):** Up to 200 items due within 30 days (`due_date >= today && due_date <= today + 30`) plus up to 100 overdue items (`due_date < today` in statuses `Draft`, `In Progress`, `For Review`). Embedded `tasks` array included for each work request.
   - **Disbursements (`type: 'db'`):** Up to 200 items due within 30 days plus up to 100 overdue items in statuses `Draft`, `Pending`, `Approved`.
   - **User Scope Rules:**
     - Admin (`user.role === 'Admin'`): Sees all work requests and disbursements.
     - Accounting (`user.role === 'Accounting'` or `user.departments.includes('Accounting')`): Sees all disbursements; work requests restricted to user-concerned requests.
     - Non-accounting staff: Sees only work requests where user is creator (`submitted_by`), requester (`requested_by`), or assigned (via `assigned_to` or `task_assignees`). Sees only disbursements in `Released`, `Funded`, or `Rejected` statuses that link to a concerned work request.
   - Calendar items are returned sorted ascending by `dueDate`.

#### Response (200 OK)
```json
{
  "data": {
    "clients": { "total": 42 },
    "workRequests": { "total": 128 },
    "documents": { "total": 350 },
    "invoices": {
      "total": 65,
      "totalBilled": 1250000.0,
      "totalCollected": 950000.0,
      "totalOutstanding": 300000.0,
      "byStatus": { "Paid": 45, "Partial": 10, "Sent": 10 }
    },
    "disbursements": {
      "total": 80,
      "totalAmount": 420000.0,
      "releasedAmount": 380000.0,
      "byStatus": { "Released": 70, "Pending": 10 }
    },
    "transmittals": {
      "total": 30,
      "byStatus": { "Delivered": 25, "In Transit": 5 }
    },
    "revenue": {
      "totalBilled": 1250000.0,
      "totalCollected": 950000.0,
      "totalOutstanding": 300000.0,
      "totalExpenses": 380000.0,
      "netIncome": 570000.0
    },
    "calendar": [
      {
        "id": "11111111-1111-1111-1111-111111111111",
        "type": "wr",
        "title": "Corporate Secretary Retainer Q4",
        "status": "In Progress",
        "dueDate": "2026-10-15",
        "clientId": "22222222-2222-2222-2222-222222222222",
        "assigneeId": "33333333-3333-3333-3333-333333333333",
        "entity": "ATA",
        "tasks": [
          {
            "id": "44444444-4444-4444-4444-444444444444",
            "title": "Draft Minutes of Meeting",
            "status": "In Progress",
            "assigneeId": "33333333-3333-3333-3333-333333333333",
            "assigneeName": "Maria Santos",
            "dueDate": "2026-10-14"
          }
        ]
      },
      {
        "id": "55555555-5555-5555-5555-555555555555",
        "type": "db",
        "title": "DB-2026-088",
        "status": "Released",
        "dueDate": "2026-10-18",
        "clientId": "22222222-2222-2222-2222-222222222222",
        "entity": "ATA",
        "amount": 7500.0
      }
    ]
  }
}
```

#### Consolidated Response (`X-Active-Entity: ALL`) (200 OK)
```json
{
  "data": {
    "analyticsByEntity": {
      "ATA": {
        "clients": { "total": 25 },
        "workRequests": { "total": 70 },
        "documents": { "total": 200 },
        "invoices": { "total": 35, "totalBilled": 700000.0, "totalCollected": 500000.0, "totalOutstanding": 200000.0, "byStatus": { "Paid": 25, "Sent": 10 } },
        "disbursements": { "total": 45, "totalAmount": 220000.0, "releasedAmount": 200000.0, "byStatus": { "Released": 40, "Pending": 5 } },
        "transmittals": { "total": 18, "byStatus": { "Delivered": 15, "In Transit": 3 } },
        "revenue": { "totalBilled": 700000.0, "totalCollected": 500000.0, "totalOutstanding": 200000.0, "totalExpenses": 200000.0, "netIncome": 300000.0 }
      },
      "LTA": {
        "clients": { "total": 17 },
        "workRequests": { "total": 58 },
        "documents": { "total": 150 },
        "invoices": { "total": 30, "totalBilled": 550000.0, "totalCollected": 450000.0, "totalOutstanding": 100000.0, "byStatus": { "Paid": 20, "Sent": 10 } },
        "disbursements": { "total": 35, "totalAmount": 200000.0, "releasedAmount": 180000.0, "byStatus": { "Released": 30, "Pending": 5 } },
        "transmittals": { "total": 12, "byStatus": { "Delivered": 10, "In Transit": 2 } },
        "revenue": { "totalBilled": 550000.0, "totalCollected": 450000.0, "totalOutstanding": 100000.0, "totalExpenses": 180000.0, "netIncome": 270000.0 }
      }
    },
    "ATA": {
      "clients": { "total": 25 },
      "workRequests": { "total": 70 },
      "documents": { "total": 200 },
      "invoices": { "total": 35, "totalBilled": 700000.0, "totalCollected": 500000.0, "totalOutstanding": 200000.0, "byStatus": { "Paid": 25, "Sent": 10 } },
      "disbursements": { "total": 45, "totalAmount": 220000.0, "releasedAmount": 200000.0, "byStatus": { "Released": 40, "Pending": 5 } },
      "transmittals": { "total": 18, "byStatus": { "Delivered": 15, "In Transit": 3 } },
      "revenue": { "totalBilled": 700000.0, "totalCollected": 500000.0, "totalOutstanding": 200000.0, "totalExpenses": 200000.0, "netIncome": 300000.0 }
    },
    "LTA": {
      "clients": { "total": 17 },
      "workRequests": { "total": 58 },
      "documents": { "total": 150 },
      "invoices": { "total": 30, "totalBilled": 550000.0, "totalCollected": 450000.0, "totalOutstanding": 100000.0, "byStatus": { "Paid": 20, "Sent": 10 } },
      "disbursements": { "total": 35, "totalAmount": 200000.0, "releasedAmount": 180000.0, "byStatus": { "Released": 30, "Pending": 5 } },
      "transmittals": { "total": 12, "byStatus": { "Delivered": 10, "In Transit": 2 } },
      "revenue": { "totalBilled": 550000.0, "totalCollected": 450000.0, "totalOutstanding": 100000.0, "totalExpenses": 180000.0, "netIncome": 270000.0 }
    },
    "calendar": [
      {
        "id": "11111111-1111-1111-1111-111111111111",
        "type": "wr",
        "title": "Corporate Secretary Retainer Q4",
        "status": "In Progress",
        "dueDate": "2026-10-15",
        "clientId": "22222222-2222-2222-2222-222222222222",
        "assigneeId": "33333333-3333-3333-3333-333333333333",
        "entity": "ATA",
        "tasks": []
      },
      {
        "id": "55555555-5555-5555-5555-555555555555",
        "type": "db",
        "title": "DB-2026-088",
        "status": "Released",
        "dueDate": "2026-10-18",
        "clientId": "22222222-2222-2222-2222-222222222222",
        "entity": "LTA",
        "amount": 7500.0
      }
    ]
  }
}
```

#### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `401 Unauthorized` | `UNAUTHORIZED` | Missing, expired, or invalid JWT bearer token |
| `403 Forbidden` | `FORBIDDEN` | Caller lacks `workflow:view` permission |

---

### 2.3 `GET /v1/reports/daily`
Returns an itemized operational activity log and summary totals for a single specific calendar date.

- **Guards:** Authenticated, `reports:view`.
- **Headers:** `X-Active-Entity: ATA|LTA`.
- **Since-version:** `1.0.0` (frozen at `2.0.0`).
- **Events Emitted:** None.

> **Entity Scoping Note:** Requires a concrete entity code (`ATA` or `LTA`). Unlike `/analytics` and `/dashboard`, `/daily` does not consolidate across entities; passing `X-Active-Entity: ALL` results in an empty dataset because records are queried with `entity_id = 'ALL'`.

#### Query Parameters (Zod: `dailyQuerySchema`)
| Parameter | Type | Required | Format / Validation | Description |
| :--- | :--- | :---: | :---: | :--- |
| `date` | string | Yes | YYYY-MM-DD (`^\d{4}-\d{2}-\d{2}$`) | Target report date |

#### Response (200 OK)
```json
{
  "data": {
    "date": "2026-10-04",
    "workRequests": [
      {
        "id": "11111111-1111-1111-1111-111111111111",
        "title": "SEC Annual General Information Sheet",
        "status": "Draft",
        "created_at": "2026-10-04T08:30:00.000Z"
      }
    ],
    "documents": [
      {
        "id": "22222222-2222-2222-2222-222222222222",
        "original_name": "GIS_2026_Signed.pdf",
        "category": "SEC",
        "created_at": "2026-10-04T09:15:00.000Z"
      }
    ],
    "invoices": [
      {
        "id": "33333333-3333-3333-3333-333333333333",
        "invoice_number": "INV-2026-104",
        "total": 35000.0,
        "status": "Sent",
        "created_at": "2026-10-04T10:00:00.000Z"
      }
    ],
    "payments": [
      {
        "id": "44444444-4444-4444-4444-444444444444",
        "amount": 35000.0,
        "method": "Bank Transfer",
        "payment_date": "2026-10-04",
        "invoice_id": "33333333-3333-3333-3333-333333333333"
      }
    ],
    "disbursements": [
      {
        "id": "55555555-5555-5555-5555-555555555555",
        "disbursement_number": "DB-2026-092",
        "amount": 2800.0,
        "status": "Pending",
        "created_at": "2026-10-04T11:20:00.000Z"
      }
    ],
    "transmittals": [
      {
        "id": "66666666-6666-6666-6666-666666666666",
        "tracking_number": "TR-2026-041",
        "status": "Draft",
        "created_at": "2026-10-04T13:45:00.000Z"
      }
    ],
    "summary": {
      "workRequests": 1,
      "documents": 1,
      "invoices": 1,
      "invoicesTotal": 35000.0,
      "payments": 1,
      "paymentsTotal": 35000.0,
      "disbursements": 1,
      "disbursementsTotal": 2800.0,
      "transmittals": 1
    }
  }
}
```

#### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `400 Bad Request` | `VALIDATION_ERROR` | Missing `date` parameter or invalid date format (must be YYYY-MM-DD) |
| `401 Unauthorized` | `UNAUTHORIZED` | Missing, expired, or invalid JWT bearer token |
| `403 Forbidden` | `FORBIDDEN` | Caller lacks `reports:view` permission |

---

### 2.4 `GET /v1/reports/weekly`
Returns an activity report covering the entire week (Monday 00:00:00Z to Sunday 23:59:59.999Z) that contains the requested date.

- **Guards:** Authenticated, `reports:view`.
- **Headers:** `X-Active-Entity: ATA|LTA`.
- **Since-version:** `1.0.0` (frozen at `2.0.0`).
- **Events Emitted:** None.

> **Entity Scoping Note:** Requires a concrete entity code (`ATA` or `LTA`). Passing `X-Active-Entity: ALL` results in an empty dataset because records are queried with `entity_id = 'ALL'`.

#### Query Parameters (Zod: `weeklyQuerySchema`)
| Parameter | Type | Required | Format / Validation | Description |
| :--- | :--- | :---: | :---: | :--- |
| `date` | string | Yes | YYYY-MM-DD (`^\d{4}-\d{2}-\d{2}$`) | Any date within the target week |

#### Response (200 OK)
```json
{
  "data": {
    "weekStart": "2026-09-28",
    "weekEnd": "2026-10-04",
    "summary": {
      "workRequests": 14,
      "invoices": 9,
      "invoicesTotal": 410000.0,
      "payments": 8,
      "paymentsTotal": 385000.0,
      "disbursements": 18,
      "disbursementsTotal": 76500.0,
      "documents": 28,
      "transmittals": 6
    },
    "details": {
      "workRequests": [
        {
          "id": "11111111-1111-1111-1111-111111111111",
          "title": "Tax Compliance Review",
          "status": "In Progress",
          "created_at": "2026-09-29T02:00:00.000Z"
        }
      ],
      "invoices": [
        {
          "id": "22222222-2222-2222-2222-222222222222",
          "invoice_number": "INV-2026-098",
          "total": 55000.0,
          "status": "Paid",
          "created_at": "2026-09-30T05:30:00.000Z"
        }
      ],
      "payments": [
        {
          "id": "33333333-3333-3333-3333-333333333333",
          "amount": 55000.0,
          "method": "Check",
          "created_at": "2026-10-01T04:15:00.000Z"
        }
      ],
      "disbursements": [
        {
          "id": "44444444-4444-4444-4444-444444444444",
          "disbursement_number": "DB-2026-085",
          "amount": 4500.0,
          "status": "Released",
          "created_at": "2026-09-28T09:00:00.000Z"
        }
      ],
      "documents": [
        {
          "id": "55555555-5555-5555-5555-555555555555",
          "original_name": "Official_Receipt_455.pdf",
          "created_at": "2026-09-29T10:00:00.000Z"
        }
      ],
      "transmittals": [
        {
          "id": "66666666-6666-6666-6666-666666666666",
          "tracking_number": "TR-2026-039",
          "status": "Delivered",
          "created_at": "2026-09-28T11:00:00.000Z"
        }
      ]
    }
  }
}
```

#### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `400 Bad Request` | `VALIDATION_ERROR` | Missing `date` parameter or invalid date format |
| `401 Unauthorized` | `UNAUTHORIZED` | Missing, expired, or invalid JWT bearer token |
| `403 Forbidden` | `FORBIDDEN` | Caller lacks `reports:view` permission |

---

### 2.5 `GET /v1/reports/monthly-pending`
Returns pending operational and financial tasks requiring administrative attention. The `month` parameter scopes overdue invoices, while pending disbursements and stale draft transmittals reflect current real-time pending queues.

- **Guards:** Authenticated, `reports:view`.
- **Headers:** `X-Active-Entity: ATA|LTA`.
- **Since-version:** `1.0.0` (frozen at `2.0.0`).
- **Events Emitted:** None.

> **Entity Scoping Note:** Requires a concrete entity code (`ATA` or `LTA`). Passing `X-Active-Entity: ALL` results in an empty dataset because records are queried with `entity_id = 'ALL'`.

#### Query Parameters (Zod: `monthlyPendingQuerySchema`)
| Parameter | Type | Required | Format / Validation | Description |
| :--- | :--- | :---: | :---: | :--- |
| `month` | string | No | YYYY-MM (`^\d{4}-\d{2}$`) | Evaluation month for overdue invoices; defaults to current UTC month |

#### Per-Section Filtering Semantics
- **`overdueInvoices`**: Scoped by `due_date <= ${targetMonth}-31` and `balance > 0`. Evaluates outstanding invoices due on or before the designated month.
- **`pendingDisbursements`**: Unbounded by `month`. Always returns all disbursements for the entity currently in `Pending` or `Approved` status regardless of the requested `month`.
- **`staleTransmittals`**: Unbounded by `month`. Always queries draft transmittals older than 7 days relative to the current execution timestamp (`created_at < now - 7 days`), regardless of the requested `month`.

#### Response (200 OK)
```json
{
  "data": {
    "month": "2026-10",
    "overdueInvoices": {
      "count": 2,
      "totalOutstanding": 75000.0,
      "items": [
        {
          "id": "11111111-1111-1111-1111-111111111111",
          "invoice_number": "INV-2026-072",
          "client_id": "22222222-2222-2222-2222-222222222222",
          "due_date": "2026-09-15",
          "total": 50000.0,
          "balance": 50000.0,
          "status": "Sent",
          "clients": {
            "name": "Global Trade Ventures Inc."
          }
        },
        {
          "id": "33333333-3333-3333-3333-333333333333",
          "invoice_number": "INV-2026-081",
          "client_id": "44444444-4444-4444-4444-444444444444",
          "due_date": "2026-10-01",
          "total": 35000.0,
          "balance": 25000.0,
          "status": "Partial",
          "clients": {
            "name": "Pacific Retail Group"
          }
        }
      ]
    },
    "pendingDisbursements": {
      "count": 2,
      "totalAmount": 14500.0,
      "items": [
        {
          "id": "55555555-5555-5555-5555-555555555555",
          "disbursement_number": "DB-2026-089",
          "amount": 9500.0,
          "status": "Pending",
          "category": "Filing Fees",
          "created_at": "2026-10-02T03:30:00.000Z"
        },
        {
          "id": "66666666-6666-6666-6666-666666666666",
          "disbursement_number": "DB-2026-090",
          "amount": 5000.0,
          "status": "Approved",
          "category": "Transportation",
          "created_at": "2026-10-03T07:10:00.000Z"
        }
      ]
    },
    "staleTransmittals": {
      "count": 1,
      "items": [
        {
          "id": "77777777-7777-7777-7777-777777777777",
          "tracking_number": "TR-2026-031",
          "client_id": "22222222-2222-2222-2222-222222222222",
          "created_at": "2026-09-21T06:00:00.000Z",
          "clients": {
            "name": "Global Trade Ventures Inc."
          }
        }
      ]
    }
  }
}
```

#### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `400 Bad Request` | `VALIDATION_ERROR` | Invalid `month` parameter format (must be YYYY-MM) |
| `401 Unauthorized` | `UNAUTHORIZED` | Missing, expired, or invalid JWT bearer token |
| `403 Forbidden` | `FORBIDDEN` | Caller lacks `reports:view` permission |

---

### 2.6 `GET /v1/reports/aging`
Calculates the accounts receivable (AR) aging report across all outstanding invoices (`balance > 0`) for the entity. Groups unpaid invoices into 5 aging buckets based on days overdue relative to current system time.

- **Guards:** Authenticated, `billing:view`.
- **Headers:** `X-Active-Entity: ATA|LTA`.
- **Since-version:** `1.0.0` (frozen at `2.0.0`).
- **Events Emitted:** None.

> **Entity Scoping Note:** Requires a concrete entity code (`ATA` or `LTA`). Passing `X-Active-Entity: ALL` results in an empty dataset because records are queried with `entity_id = 'ALL'`.

#### Query Parameters
None. The live endpoint does not accept query parameters (`req.query` is ignored by `reportsController.aging`).

> **Implementation Note:** Although `agingQuerySchema` (`clientId?: UUID`) is defined in `backend/src/modules/reports/schema.js`, `reportsController.aging` invokes `service.getAgingReport({ entityId })` without passing query parameters. All outstanding invoices for the active entity are included in aging buckets regardless of any client query filter in live 2.0.0.

#### Aging Buckets
- `current`: Invoices not yet due (`daysOverdue <= 0`)
- `1-30`: Overdue by 1 to 30 days
- `31-60`: Overdue by 31 to 60 days
- `61-90`: Overdue by 61 to 90 days
- `90+`: Overdue by more than 90 days

#### Response (200 OK)
```json
{
  "data": {
    "summary": {
      "current": 125000.0,
      "1-30": 45000.0,
      "31-60": 30000.0,
      "61-90": 15000.0,
      "90+": 10000.0,
      "grandTotal": 225000.0
    },
    "buckets": {
      "current": {
        "total": 125000.0,
        "count": 2,
        "invoices": [
          {
            "id": "11111111-1111-1111-1111-111111111111",
            "invoiceNumber": "INV-2026-101",
            "clientName": "Apex Technologies Ltd.",
            "clientId": "22222222-2222-2222-2222-222222222222",
            "dueDate": "2026-10-25",
            "total": 75000.0,
            "balance": 75000.0,
            "daysOverdue": 0
          },
          {
            "id": "33333333-3333-3333-3333-333333333333",
            "invoiceNumber": "INV-2026-102",
            "clientName": "Zenith Real Estate Corp.",
            "clientId": "44444444-4444-4444-4444-444444444444",
            "dueDate": "2026-10-18",
            "total": 50000.0,
            "balance": 50000.0,
            "daysOverdue": 0
          }
        ]
      },
      "1-30": {
        "total": 45000.0,
        "count": 1,
        "invoices": [
          {
            "id": "55555555-5555-5555-5555-555555555555",
            "invoiceNumber": "INV-2026-085",
            "clientName": "Horizon Logistics Inc.",
            "clientId": "66666666-6666-6666-6666-666666666666",
            "dueDate": "2026-09-20",
            "total": 45000.0,
            "balance": 45000.0,
            "daysOverdue": 14
          }
        ]
      },
      "31-60": {
        "total": 30000.0,
        "count": 1,
        "invoices": [ ... ]
      },
      "61-90": {
        "total": 15000.0,
        "count": 1,
        "invoices": [ ... ]
      },
      "90+": {
        "total": 10000.0,
        "count": 1,
        "invoices": [ ... ]
      }
    }
  }
}
```

#### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `401 Unauthorized` | `UNAUTHORIZED` | Missing, expired, or invalid JWT bearer token |
| `403 Forbidden` | `FORBIDDEN` | Caller lacks `billing:view` permission |
| `500 Internal Server Error` | `DATABASE_ERROR` | Database query failure fetching invoices |
