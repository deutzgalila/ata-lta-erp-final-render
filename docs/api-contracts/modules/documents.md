---
module: documents
contract_version: 2.0.0
frozen_at: 2026-10-04
frozen_by: P2-7-Freeze
base_url: /v1/documents
---

# /v1/documents — Documents / DMS API Contract

## Overview
Provides centralized Document Management System (DMS) capabilities backed by Supabase Storage and PostgreSQL metadata. Enforces a secure two-step direct client-to-storage upload protocol via pre-signed URLs, time-bounded signed download URLs, physical document lifecycle stage tracking, version tracking, comment threads, task and work request attachment links, and soft-deletion/archiving.

- **Guards:** Authenticated (`Authorization: Bearer <token>`), entity-scoped (`X-Active-Entity: ATA|LTA`).
- **Base URL:** `/v1/documents`
- **Audit Logging:** All mutating endpoints (`POST`, `PUT`, `DELETE`, `/archive`, `/unarchive`, `/confirm-upload`, `/lifecycle`) write immutable audit trail records to the `audit_logs` table.
- **Two-Step Upload Protocol:**
  1. `POST /v1/documents`: Creates document metadata with `status = 'pending_upload'`, allocates UUID, deterministically calculates storage path, and returns metadata with a pre-signed `uploadUrl` (valid for 300 seconds).
  2. Direct Transfer: Client uploads file bytes directly to Supabase Storage via `PUT <uploadUrl>`.
  3. `POST /v1/documents/:id/confirm-upload`: Transitions status from `pending_upload` to `active` and timestamps `upload_date`.
- **Pre-signed Download Flow:**
  - `GET /v1/documents/:id/download-url`: Generates a time-bounded signed URL (valid for 300 seconds) targeting the Supabase Storage object.
- **Physical Lifecycle Pipeline:**
  - `collected` → `with_documentations` → `scanned` → `in_envelope` → `stored`
- **Consumed by v2 Operations:**
  The following 6 endpoints are shared infrastructure directly consumed by the Operations module (`/v1/operations`) for work request and task attachment management:
  1. `GET /v1/documents`
  2. `POST /v1/documents`
  3. `GET /v1/documents/:id/download-url`
  4. `POST /v1/documents/:id/confirm-upload`
  5. `PUT /v1/documents/:id`
  6. `DELETE /v1/documents/:id`

---

## 1. Storage Path Layout & Metadata Schema

Storage paths are deterministically structured by entity code and contextual association:
- **Client Document:** `entities/{entityCode}/clients/{clientId}/documents/{documentId}/{safeName}`
- **Work Request / Task Document:** `entities/{entityCode}/work-requests/{workRequestId}/documents/{documentId}/{safeName}`
- **General Document:** `entities/{entityCode}/general/documents/{documentId}/{safeName}`

> **Path Precedence:** If both `clientId` and `workRequestId` are supplied, the client path takes precedence (`entities/{entityCode}/clients/...`), mirroring client ownership priority.

### File Sanitization & Name Handling
- **Sanitized Filename (`file_name` & `storage_path`):** Generated via `sanitizeFileName`: converted to lowercase, whitespace replaced with `-`, non-alphanumeric characters (except `.` `-` `_`) stripped, consecutive hyphens collapsed, and truncated at 200 characters.
- **Display Filename (`original_name`):** Preserves raw user input casing and spaces for human UI display. If `originalName` is omitted in `createDocumentSchema`, it defaults to the raw `fileName`.
- **Maximum File Size:** Enforced at `MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024` (50 MB / 52,428,800 bytes). Payloads declaring `fileSize > 50 MB` are rejected with `400 Validation Error`.

### Document Categories
- `SEC`: Securities and Exchange Commission filings and certifications
- `BIR`: Bureau of Internal Revenue forms, returns, and receipts
- `CONTRACT`: Legal contracts, agreements, and retainers
- `PERMIT`: Business permits, licenses, and clearances
- `FINANCIAL`: Financial statements, ledgers, and reconciliations
- `CORRESPONDENCE`: Formal letters, notices, and transmittals
- `LEGAL`: Board resolutions, court filings, and affidavits
- `HR`: Human resource, payroll, and employment documents
- `OTHER`: Unclassified or miscellaneous documents

### Physical Lifecycle States & Transition Semantics
- `collected`: Physical original received from client or courier
- `with_documentations`: Under review by documentation staff
- `scanned`: Digitized and uploaded to DMS
- `in_envelope`: Placed into physical barcoded/labeled envelope
- `stored`: Archived into secure physical cabinet/shelf location

> **Transition Semantics:** While the physical lifecycle follows the progressive workflow `collected → with_documentations → scanned → in_envelope → stored`, the live backend allows setting any of the 5 valid enum states at any time (arbitrary transitions permitted). This accommodates backfills, pre-scanned intake, and physical filing corrections.

### RFC 7807 Error Response Format
All error responses from this module conform to RFC 7807 `application/problem+json`:
```json
{
  "status": 400,
  "title": "Validation Error",
  "detail": "fileName: Required"
}
```
Standard properties:
- `status` (integer): HTTP status code matching response status.
- `title` (string): Short human-readable summary of problem type.
- `detail` (string): Specific human-readable explanation of the error.
- `code` (string, optional): Machine-readable error code if explicitly configured.

---

## 2. RBAC Permissions Matrix

| Endpoint | Action | Allowed Roles / Guards | Consumed by v2 Operations |
| :--- | :--- | :--- | :---: |
| `GET /counts` | Get active/archived counts | `dms:view` | No |
| `GET /` | List documents with filters | `dms:view` | **Yes** |
| `POST /` | Create metadata & get upload URL | `dms:edit`, `workflow:task_upload`, `disbursement:create`, `disbursement:edit`, `disbursement:request`, `billing:create`, `billing:edit`, `billing:request` | **Yes** |
| `GET /:id` | Get document metadata | `dms:view` | No |
| `PUT /:id` | Update document metadata | `dms:edit` | **Yes** |
| `POST /:id/archive` | Mark document archived | `dms:edit` | No |
| `POST /:id/unarchive` | Mark document unarchived | `dms:edit` | No |
| `DELETE /:id` | Soft-delete document | `dms:delete` | **Yes** |
| `POST /:id/confirm-upload` | Confirm storage upload | `dms:edit`, `workflow:task_upload`, `disbursement:create`, `disbursement:edit`, `disbursement:request`, `billing:create`, `billing:edit`, `billing:request` | **Yes** |
| `GET /:id/download-url` | Generate signed download URL | `dms:view` | **Yes** |
| `PUT /:id/lifecycle` | Advance physical lifecycle | `dms:handover` | No |

---

## 3. Endpoints

### 3.1 `GET /v1/documents/counts`
Returns the total counts of active and archived documents for the current active entity.

- **Guards:** Authenticated, `dms:view`.
- **Since-version:** `1.0.0` (frozen at `2.0.0`).
- **Consumed by v2 Operations:** No.
- **Events Emitted:** None.

#### Response (200 OK)
```json
{
  "data": {
    "active": 342,
    "archived": 28
  }
}
```

#### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `401 Unauthorized` | `UNAUTHORIZED` | Missing, expired, or invalid JWT bearer token |
| `403 Forbidden` | `FORBIDDEN` | Caller lacks `dms:view` permission |

---

### 3.2 `GET /v1/documents`
Lists documents for the active entity with multi-parameter filtering, search, and pagination.

> **Note: consumed by v2 Operations.** Used across operations boards to display attachments linked to work requests and tasks.

- **Guards:** Authenticated, `dms:view`.
- **Since-version:** `1.0.0` (frozen at `2.0.0`).
- **Consumed by v2 Operations:** **Yes**.
- **Events Emitted:** None.

#### Query Parameters
| Parameter | Type | Required | Default | Description |
| :--- | :--- | :---: | :---: | :--- |
| `category` | enum | No | — | Filter by category (`SEC`, `BIR`, `CONTRACT`, etc.) |
| `status` | string | No | — | Filter by status (`active`, `pending_upload`) |
| `lifecycle` | enum | No | — | Filter by lifecycle (`collected`, `with_documentations`, `scanned`, `in_envelope`, `stored`) |
| `clientId` | UUID | No | — | Filter by associated client ID |
| `workRequestId` | UUID | No | — | Filter by associated work request ID |
| `linkedTaskId` | UUID | No | — | Filter by linked task ID |
| `search` | string | No | — | Case-insensitive substring search across `original_name`, `description`, `document_type` |
| `archived` | boolean string | No | `false` | When `"true"`, queries archived; otherwise queries unarchived |
| `page` | integer | No | `1` | Pagination page number ($\ge 1$). Offset is computed as `(page - 1) * limit` |
| `limit` | integer | No | `50` | Pagination page size (capped at 100 via `Math.min(limit, 100)`) |

> **Sorting & Ordering:** Results are always ordered deterministically by `created_at DESC` (newest records first).

#### Response (200 OK)
```json
{
  "data": [
    {
      "id": "11111111-1111-1111-1111-111111111111",
      "file_name": "bir-form-1702-q3-2026.pdf",
      "original_name": "BIR Form 1702 Q3 2026.pdf",
      "work_request_id": "22222222-2222-2222-2222-222222222222",
      "linked_task_id": "33333333-3333-3333-3333-333333333333",
      "client_id": "44444444-4444-4444-4444-444444444444",
      "document_type": "Tax Return",
      "category": "BIR",
      "uploader_id": "55555555-5555-5555-5555-555555555555",
      "description": "Quarterly Income Tax Return stamped by RDO 048",
      "entity_id": "66666666-6666-6666-6666-666666666666",
      "status": "active",
      "document_lifecycle": "scanned",
      "archived": false,
      "file_size": 2457600,
      "content_type": "application/pdf",
      "storage_path": "entities/ATA/work-requests/22222222-2222-2222-2222-222222222222/documents/11111111-1111-1111-1111-111111111111/bir-form-1702-q3-2026.pdf",
      "external_url": null,
      "scanned_by": "Maria Santos",
      "envelope_id": "ENV-2026-042",
      "stored_location": "Cabinet 3, Shelf B",
      "handover_log": [],
      "comments": [
        {
          "id": "c1",
          "userId": "55555555-5555-5555-5555-555555555555",
          "date": "2026-10-04T06:00:00.000Z",
          "text": "Stamped copy verified against BIR eFPS confirmation"
        }
      ],
      "versions": [
        {
          "version": 1,
          "fileName": "BIR Form 1702 Q3 2026.pdf",
          "uploader": "Maria Santos",
          "uploadDate": "2026-10-04T05:45:00.000Z"
        }
      ],
      "upload_date": "2026-10-04T05:45:00.000Z",
      "created_by": "55555555-5555-5555-5555-555555555555",
      "updated_by": "55555555-5555-5555-5555-555555555555",
      "created_at": "2026-10-04T05:40:00.000Z",
      "updated_at": "2026-10-04T06:00:00.000Z",
      "deleted_at": null
    }
  ],
  "meta": {
    "total": 1,
    "page": 1,
    "limit": 50
  }
}
```

#### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `401 Unauthorized` | `UNAUTHORIZED` | Missing, expired, or invalid JWT bearer token |
| `403 Forbidden` | `FORBIDDEN` | Caller lacks `dms:view` permission |
| `500 Internal Server Error` | `DATABASE_ERROR` | Database query failure fetching documents |

---

### 3.3 `POST /v1/documents`
Creates a document metadata record and initiates the upload protocol by returning a pre-signed Supabase Storage upload URL (Step 1 of upload flow).

> **Note: consumed by v2 Operations.** Used whenever users attach documents to work requests or tasks in operations modals.

- **Guards:** Authenticated; any one of `dms:edit`, `workflow:task_upload`, `disbursement:create`, `disbursement:edit`, `disbursement:request`, `billing:create`, `billing:edit`, `billing:request`.
- **Audit Action:** `document.create` (`table: 'documents'`).
- **Since-version:** `1.0.0` (frozen at `2.0.0`).
- **Consumed by v2 Operations:** **Yes**.
- **Events Emitted:** None.

#### Request Body (Zod: `createDocumentSchema`)
| Field | Type | Required | Bounds / Validation | Description |
| :--- | :--- | :---: | :---: | :--- |
| `fileName` | string | Yes | 1 to 255 characters | Target file name (sanitized server-side) |
| `contentType` | string \| null | No | 1 to 100 characters | MIME type (e.g. `application/pdf`, `image/png`) |
| `fileSize` | integer \| null | No | $\ge 0$, $\le$ 50 MB (`MAX_FILE_SIZE_BYTES`) | File size in bytes |
| `originalName` | string | No | Max 255 characters | Display name; defaults to `fileName` |
| `workRequestId` | UUID \| null | No | Valid UUID | Associated work request ID |
| `linkedTaskId` | UUID \| null | No | Valid UUID | Linked task ID. Validated: task must exist, and if `workRequestId` is also provided, task must belong to that work request. |
| `clientId` | UUID \| null | No | Valid UUID | Associated client ID |
| `documentType` | string | No | Max 100 characters | Document type classification |
| `category` | enum | No | One of valid 9 categories | Document category (`SEC`, `BIR`, etc.) |
| `description` | string | No | Max 2000 characters | Optional description |
| `externalUrl` | string \| null | No | Max 2000 characters | External link. When provided, storage upload is skipped (`uploadUrl = null`, `status = 'active'`). |

#### Response (201 Created)
```json
{
  "data": {
    "document": {
      "id": "11111111-1111-1111-1111-111111111111",
      "file_name": "service-agreement-signed.pdf",
      "original_name": "Service Agreement Signed.pdf",
      "work_request_id": "22222222-2222-2222-2222-222222222222",
      "linked_task_id": "33333333-3333-3333-3333-333333333333",
      "client_id": "44444444-4444-4444-4444-444444444444",
      "document_type": "Agreement",
      "category": "CONTRACT",
      "uploader_id": "55555555-5555-5555-5555-555555555555",
      "description": "Fully executed retainer agreement",
      "entity_id": "66666666-6666-6666-6666-666666666666",
      "status": "pending_upload",
      "document_lifecycle": "collected",
      "archived": false,
      "file_size": 1548200,
      "content_type": "application/pdf",
      "storage_path": "entities/ATA/work-requests/22222222-2222-2222-2222-222222222222/documents/11111111-1111-1111-1111-111111111111/service-agreement-signed.pdf",
      "external_url": null,
      "comments": [],
      "versions": [],
      "created_by": "55555555-5555-5555-5555-555555555555",
      "updated_by": "55555555-5555-5555-5555-555555555555",
      "created_at": "2026-10-04T07:00:00.000Z",
      "updated_at": "2026-10-04T07:00:00.000Z",
      "deleted_at": null
    },
    "uploadUrl": "https://storage.supabase.co/storage/v1/object/upload/sign/documents/entities/ATA/work-requests/22222222-2222-2222-2222-222222222222/documents/11111111-1111-1111-1111-111111111111/service-agreement-signed.pdf?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

#### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `400 Bad Request` | `VALIDATION_ERROR` | Missing `fileName`, invalid UUID, file size > 50 MB, or `linkedTaskId` does not exist / does not belong to `workRequestId` |
| `401 Unauthorized` | `UNAUTHORIZED` | Missing, expired, or invalid JWT bearer token |
| `403 Forbidden` | `FORBIDDEN` | Caller lacks any required creation permission |
| `500 Internal Server Error` | `DATABASE_ERROR` | Failed to insert document metadata |

---

### 3.4 `GET /v1/documents/:id`
Retrieves a single document metadata record by ID.

- **Guards:** Authenticated, `dms:view`.
- **Since-version:** `1.0.0` (frozen at `2.0.0`).
- **Consumed by v2 Operations:** No.
- **Events Emitted:** None.

#### Response (200 OK)
```json
{
  "data": {
    "id": "11111111-1111-1111-1111-111111111111",
    "file_name": "service-agreement-signed.pdf",
    "original_name": "Service Agreement Signed.pdf",
    "work_request_id": "22222222-2222-2222-2222-222222222222",
    "linked_task_id": "33333333-3333-3333-3333-333333333333",
    "client_id": "44444444-4444-4444-4444-444444444444",
    "document_type": "Agreement",
    "category": "CONTRACT",
    "uploader_id": "55555555-5555-5555-5555-555555555555",
    "description": "Fully executed retainer agreement",
    "entity_id": "66666666-6666-6666-6666-666666666666",
    "status": "active",
    "document_lifecycle": "scanned",
    "archived": false,
    "file_size": 1548200,
    "content_type": "application/pdf",
    "storage_path": "entities/ATA/work-requests/22222222-2222-2222-2222-222222222222/documents/11111111-1111-1111-1111-111111111111/service-agreement-signed.pdf",
    "external_url": null,
    "scanned_by": "Maria Santos",
    "envelope_id": "ENV-2026-042",
    "stored_location": "Cabinet 3, Shelf B",
    "handover_log": [],
    "comments": [],
    "versions": [],
    "created_by": "55555555-5555-5555-5555-555555555555",
    "updated_by": "55555555-5555-5555-5555-555555555555",
    "created_at": "2026-10-04T07:00:00.000Z",
    "updated_at": "2026-10-04T07:05:00.000Z",
    "deleted_at": null
  }
}
```

#### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `401 Unauthorized` | `UNAUTHORIZED` | Missing, expired, or invalid JWT bearer token |
| `403 Forbidden` | `FORBIDDEN` | Caller lacks `dms:view` permission |
| `404 Not Found` | `NOT_FOUND` | Document does not exist, belongs to different entity, or is soft-deleted |

---

### 3.5 `PUT /v1/documents/:id`
Updates document metadata, physical location attributes, handover entries, comment history, version tracking, and task links.

> **Note: consumed by v2 Operations.** Used when modifying task attachment associations and adding inline document comments from task panels.

- **Guards:** Authenticated, `dms:edit`.
- **Audit Action:** `document.update` (`table: 'documents'`).
- **Since-version:** `1.0.0` (frozen at `2.0.0`).
- **Consumed by v2 Operations:** **Yes**.
- **Events Emitted:** None.

#### Request Body (Zod: `updateDocumentSchema`)
| Field | Type | Required | Bounds / Validation | Description |
| :--- | :--- | :---: | :---: | :--- |
| `documentType` | string | No | Max 100 characters | Document type classification |
| `category` | enum | No | Valid category enum | Document category |
| `description` | string | No | Max 2000 characters | Document description |
| `linkedTaskId` | UUID \| null | No | Valid UUID | Relink document to another task |
| `externalUrl` | string \| null | No | Max 2000 characters | External document link |
| `scannedBy` | string | No | Max 255 characters | Name of scanning operator |
| `envelopeId` | string | No | Max 100 characters | Physical envelope identifier |
| `storedLocation` | string | No | Max 255 characters | Physical storage coordinates |
| `handoverLog` | array of objects | No | — | Array of `{ handed_to, handed_date, method, notes? }` |
| `archived` | boolean | No | — | Archive status toggle |
| `comments` | array of objects | No | — | Array of `{ id?, userId, date, text }` |
| `versions` | array of objects | No | — | Array of `{ version, fileName, uploader, uploadDate }` |

#### Response (200 OK)
```json
{
  "data": {
    "id": "11111111-1111-1111-1111-111111111111",
    "file_name": "service-agreement-signed.pdf",
    "original_name": "Service Agreement Signed.pdf",
    "work_request_id": "22222222-2222-2222-2222-222222222222",
    "linked_task_id": "33333333-3333-3333-3333-333333333333",
    "client_id": "44444444-4444-4444-4444-444444444444",
    "document_type": "Agreement",
    "category": "CONTRACT",
    "uploader_id": "55555555-5555-5555-5555-555555555555",
    "description": "Updated retainer agreement notes",
    "entity_id": "66666666-6666-6666-6666-666666666666",
    "status": "active",
    "document_lifecycle": "scanned",
    "archived": false,
    "file_size": 1548200,
    "content_type": "application/pdf",
    "storage_path": "entities/ATA/work-requests/22222222-2222-2222-2222-222222222222/documents/11111111-1111-1111-1111-111111111111/service-agreement-signed.pdf",
    "external_url": null,
    "scanned_by": "Maria Santos",
    "envelope_id": "ENV-2026-042",
    "stored_location": "Cabinet 3, Shelf B",
    "handover_log": [
      {
        "handed_to": "Atty. Juan Dela Cruz",
        "handed_date": "2026-10-04T07:10:00.000Z",
        "method": "Personal Handover",
        "notes": "Original hardcopy signed"
      }
    ],
    "comments": [
      {
        "id": "c1",
        "userId": "55555555-5555-5555-5555-555555555555",
        "date": "2026-10-04T07:05:00.000Z",
        "text": "Attached to operational task"
      }
    ],
    "versions": [
      {
        "version": 1,
        "fileName": "service-agreement-signed.pdf",
        "uploader": "Maria Santos",
        "uploadDate": "2026-10-04T07:00:00.000Z"
      }
    ],
    "upload_date": "2026-10-04T07:05:00.000Z",
    "created_by": "55555555-5555-5555-5555-555555555555",
    "updated_by": "55555555-5555-5555-5555-555555555555",
    "created_at": "2026-10-04T07:00:00.000Z",
    "updated_at": "2026-10-04T07:15:00.000Z",
    "deleted_at": null
  }
}
```

#### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `400 Bad Request` | `VALIDATION_ERROR` | Payload validation failure |
| `401 Unauthorized` | `UNAUTHORIZED` | Missing, expired, or invalid JWT bearer token |
| `403 Forbidden` | `FORBIDDEN` | Caller lacks `dms:edit` permission |
| `404 Not Found` | `NOT_FOUND` | Document ID not found or soft-deleted |

---

### 3.6 `POST /v1/documents/:id/archive`
Sets `archived = true` on a document record without soft-deleting it.

- **Guards:** Authenticated, `dms:edit`.
- **Audit Action:** `document.archive` (`table: 'documents'`).
- **Since-version:** `1.0.0` (frozen at `2.0.0`).
- **Consumed by v2 Operations:** No.
- **Events Emitted:** None.

#### Response (200 OK)
```json
{
  "data": {
    "id": "11111111-1111-1111-1111-111111111111",
    "file_name": "service-agreement-signed.pdf",
    "original_name": "Service Agreement Signed.pdf",
    "work_request_id": "22222222-2222-2222-2222-222222222222",
    "linked_task_id": "33333333-3333-3333-3333-333333333333",
    "client_id": "44444444-4444-4444-4444-444444444444",
    "document_type": "Agreement",
    "category": "CONTRACT",
    "uploader_id": "55555555-5555-5555-5555-555555555555",
    "description": "Retainer agreement",
    "entity_id": "66666666-6666-6666-6666-666666666666",
    "status": "active",
    "document_lifecycle": "stored",
    "archived": true,
    "file_size": 1548200,
    "content_type": "application/pdf",
    "storage_path": "entities/ATA/work-requests/22222222-2222-2222-2222-222222222222/documents/11111111-1111-1111-1111-111111111111/service-agreement-signed.pdf",
    "external_url": null,
    "scanned_by": "Maria Santos",
    "envelope_id": "ENV-2026-042",
    "stored_location": "Cabinet 3, Shelf B",
    "handover_log": [],
    "comments": [],
    "versions": [],
    "upload_date": "2026-10-04T07:05:00.000Z",
    "created_by": "55555555-5555-5555-5555-555555555555",
    "updated_by": "55555555-5555-5555-5555-555555555555",
    "created_at": "2026-10-04T07:00:00.000Z",
    "updated_at": "2026-10-04T07:20:00.000Z",
    "deleted_at": null
  }
}
```

#### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `401 Unauthorized` | `UNAUTHORIZED` | Missing, expired, or invalid JWT bearer token |
| `403 Forbidden` | `FORBIDDEN` | Caller lacks `dms:edit` permission |
| `404 Not Found` | `NOT_FOUND` | Document ID not found |

---

### 3.7 `POST /v1/documents/:id/unarchive`
Restores an archived document by resetting `archived = false`.

- **Guards:** Authenticated, `dms:edit`.
- **Audit Action:** `document.unarchive` (`table: 'documents'`).
- **Since-version:** `1.0.0` (frozen at `2.0.0`).
- **Consumed by v2 Operations:** No.
- **Events Emitted:** None.

#### Response (200 OK)
```json
{
  "data": {
    "id": "11111111-1111-1111-1111-111111111111",
    "file_name": "service-agreement-signed.pdf",
    "original_name": "Service Agreement Signed.pdf",
    "work_request_id": "22222222-2222-2222-2222-222222222222",
    "linked_task_id": "33333333-3333-3333-3333-333333333333",
    "client_id": "44444444-4444-4444-4444-444444444444",
    "document_type": "Agreement",
    "category": "CONTRACT",
    "uploader_id": "55555555-5555-5555-5555-555555555555",
    "description": "Retainer agreement",
    "entity_id": "66666666-6666-6666-6666-666666666666",
    "status": "active",
    "document_lifecycle": "stored",
    "archived": false,
    "file_size": 1548200,
    "content_type": "application/pdf",
    "storage_path": "entities/ATA/work-requests/22222222-2222-2222-2222-222222222222/documents/11111111-1111-1111-1111-111111111111/service-agreement-signed.pdf",
    "external_url": null,
    "scanned_by": "Maria Santos",
    "envelope_id": "ENV-2026-042",
    "stored_location": "Cabinet 3, Shelf B",
    "handover_log": [],
    "comments": [],
    "versions": [],
    "upload_date": "2026-10-04T07:05:00.000Z",
    "created_by": "55555555-5555-5555-5555-555555555555",
    "updated_by": "55555555-5555-5555-5555-555555555555",
    "created_at": "2026-10-04T07:00:00.000Z",
    "updated_at": "2026-10-04T07:25:00.000Z",
    "deleted_at": null
  }
}
```

#### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `401 Unauthorized` | `UNAUTHORIZED` | Missing, expired, or invalid JWT bearer token |
| `403 Forbidden` | `FORBIDDEN` | Caller lacks `dms:edit` permission |
| `404 Not Found` | `NOT_FOUND` | Document ID not found |

---

### 3.8 `DELETE /v1/documents/:id`
Soft-deletes a document by setting `deleted_at = now()` and recording the deleter ID in `updated_by`.

> **Note: consumed by v2 Operations.** Used when removing attachments from work requests and tasks.

- **Guards:** Authenticated, `dms:delete`.
- **Audit Action:** `document.delete` (`table: 'documents'`).
- **Since-version:** `1.0.0` (frozen at `2.0.0`).
- **Consumed by v2 Operations:** **Yes**.
- **Events Emitted:** None.

#### Response (204 No Content)
Empty body (`res.status(204).send()`).

#### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `401 Unauthorized` | `UNAUTHORIZED` | Missing, expired, or invalid JWT bearer token |
| `403 Forbidden` | `FORBIDDEN` | Caller lacks `dms:delete` permission |
| `404 Not Found` | `NOT_FOUND` | Document ID not found |

---

### 3.9 `POST /v1/documents/:id/confirm-upload`
Confirms that the client successfully completed the storage PUT upload (Step 2 of upload flow). Transitions document status from `pending_upload` to `active` and records the `upload_date`.

> **Note: consumed by v2 Operations.** Finalizes file upload immediately after client writes bytes to Supabase Storage.

- **Guards:** Authenticated; any one of `dms:edit`, `workflow:task_upload`, `disbursement:create`, `disbursement:edit`, `disbursement:request`, `billing:create`, `billing:edit`, `billing:request`.
- **Audit Action:** `document.confirm-upload` (`table: 'documents'`).
- **Since-version:** `1.0.0` (frozen at `2.0.0`).
- **Consumed by v2 Operations:** **Yes**.
- **Events Emitted:** None.

#### Response (200 OK)
Returns the complete document metadata record with updated `status: "active"` and timestamped `upload_date`.
```json
{
  "data": {
    "id": "11111111-1111-1111-1111-111111111111",
    "file_name": "service-agreement-signed.pdf",
    "original_name": "Service Agreement Signed.pdf",
    "work_request_id": "22222222-2222-2222-2222-222222222222",
    "linked_task_id": "33333333-3333-3333-3333-333333333333",
    "client_id": "44444444-4444-4444-4444-444444444444",
    "document_type": "Agreement",
    "category": "CONTRACT",
    "uploader_id": "55555555-5555-5555-5555-555555555555",
    "description": "Retainer agreement",
    "entity_id": "66666666-6666-6666-6666-666666666666",
    "status": "active",
    "document_lifecycle": "collected",
    "archived": false,
    "file_size": 1548200,
    "content_type": "application/pdf",
    "storage_path": "entities/ATA/work-requests/22222222-2222-2222-2222-222222222222/documents/11111111-1111-1111-1111-111111111111/service-agreement-signed.pdf",
    "external_url": null,
    "scanned_by": null,
    "envelope_id": null,
    "stored_location": null,
    "handover_log": [],
    "comments": [],
    "versions": [],
    "upload_date": "2026-10-04T07:05:00.000Z",
    "created_by": "55555555-5555-5555-5555-555555555555",
    "updated_by": "55555555-5555-5555-5555-555555555555",
    "created_at": "2026-10-04T07:00:00.000Z",
    "updated_at": "2026-10-04T07:05:00.000Z",
    "deleted_at": null
  }
}
```

#### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `401 Unauthorized` | `UNAUTHORIZED` | Missing, expired, or invalid JWT bearer token |
| `403 Forbidden` | `FORBIDDEN` | Caller lacks required permission |
| `404 Not Found` | `NOT_FOUND` | Document ID not found |
| `409 Conflict` | `CONFLICT` | Document is not in `pending_upload` status (`Document is already in status "<status>"`) |

---

### 3.10 `GET /v1/documents/:id/download-url`
Generates a pre-signed download URL (expires in 300 seconds) targeting the Supabase Storage object.

> **Note: consumed by v2 Operations.** Invoked by UI attachment previewers and download buttons across task and work request cards.

- **Guards:** Authenticated, `dms:view`.
- **Since-version:** `1.0.0` (frozen at `2.0.0`).
- **Consumed by v2 Operations:** **Yes**.
- **Events Emitted:** None.

> **External URL Handling:** For documents created with an `externalUrl`, `storage_path` is `null`. Requesting a download URL returns `404 Not Found` (`"Document has no associated file"`). Clients must inspect `external_url` directly on the document record instead of calling this endpoint.

#### Response (200 OK)
```json
{
  "data": {
    "url": "https://storage.supabase.co/storage/v1/object/sign/documents/entities/ATA/work-requests/22222222-2222-2222-2222-222222222222/documents/11111111-1111-1111-1111-111111111111/service-agreement-signed.pdf?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "fileName": "Service Agreement Signed.pdf"
  }
}
```

#### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `401 Unauthorized` | `UNAUTHORIZED` | Missing, expired, or invalid JWT bearer token |
| `403 Forbidden` | `FORBIDDEN` | Caller lacks `dms:view` permission |
| `404 Not Found` | `NOT_FOUND` | Document ID not found or has no associated file (`storage_path` is null) |
| `409 Conflict` | `CONFLICT` | Document upload has not been confirmed yet (`status === 'pending_upload'`) |

---

### 3.11 `PUT /v1/documents/:id/lifecycle`
Transitions the document's physical processing state along the custody pipeline.

- **Guards:** Authenticated, `dms:handover`.
- **Audit Action:** `document.lifecycle` (`table: 'documents'`).
- **Since-version:** `1.0.0` (frozen at `2.0.0`).
- **Consumed by v2 Operations:** No.
- **Events Emitted:** None.

#### Request Body (Zod: `lifecycleSchema`)
| Field | Type | Required | Allowed Values | Description |
| :--- | :--- | :---: | :---: | :--- |
| `lifecycle` | enum | Yes | `collected`, `with_documentations`, `scanned`, `in_envelope`, `stored` | Target lifecycle state (arbitrary transitions among the 5 states permitted) |

#### Response (200 OK)
Returns the complete document metadata record with updated `document_lifecycle` and `updated_by`.
```json
{
  "data": {
    "id": "11111111-1111-1111-1111-111111111111",
    "file_name": "service-agreement-signed.pdf",
    "original_name": "Service Agreement Signed.pdf",
    "work_request_id": "22222222-2222-2222-2222-222222222222",
    "linked_task_id": "33333333-3333-3333-3333-333333333333",
    "client_id": "44444444-4444-4444-4444-444444444444",
    "document_type": "Agreement",
    "category": "CONTRACT",
    "uploader_id": "55555555-5555-5555-5555-555555555555",
    "description": "Retainer agreement",
    "entity_id": "66666666-6666-6666-6666-666666666666",
    "status": "active",
    "document_lifecycle": "scanned",
    "archived": false,
    "file_size": 1548200,
    "content_type": "application/pdf",
    "storage_path": "entities/ATA/work-requests/22222222-2222-2222-2222-222222222222/documents/11111111-1111-1111-1111-111111111111/service-agreement-signed.pdf",
    "external_url": null,
    "scanned_by": "Maria Santos",
    "envelope_id": "ENV-2026-042",
    "stored_location": "Cabinet 3, Shelf B",
    "handover_log": [],
    "comments": [],
    "versions": [],
    "upload_date": "2026-10-04T07:05:00.000Z",
    "created_by": "55555555-5555-5555-5555-555555555555",
    "updated_by": "55555555-5555-5555-5555-555555555555",
    "created_at": "2026-10-04T07:00:00.000Z",
    "updated_at": "2026-10-04T07:15:00.000Z",
    "deleted_at": null
  }
}
```

#### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `400 Bad Request` | `VALIDATION_ERROR` | `lifecycle` is missing or not one of the allowed 5 enum states |
| `401 Unauthorized` | `UNAUTHORIZED` | Missing, expired, or invalid JWT bearer token |
| `403 Forbidden` | `FORBIDDEN` | Caller lacks `dms:handover` permission |
| `404 Not Found` | `NOT_FOUND` | Document ID not found |
