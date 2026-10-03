# Retainer Templates API Contract

> **Owner**: Worker-RETAIN (Parcel P0-E)  
> **Status**: Frozen (Wave 4)  
> **Date**: 2026-10-04  
>
> Downstream modules (P0-H Contract Freeze, P1 React Scaffold, P2 Operations/Admin Screens) depend on these contracts.

---

## 1. Authentication & Common Headers

All HTTP endpoints require:
- `Authorization: Bearer <supabase-jwt>`
- `X-Active-Entity: ATA|LTA`

Optional headers:
- `Idempotency-Key: <uuid|string>` (1–255 characters): Replays cached response for retry operations with `Idempotent-Replay: true`.

Error responses conform to RFC 7807 `application/problem+json`:
```json
{
  "status": 403,
  "title": "Forbidden",
  "detail": "One of permissions [retainers:edit] is required"
}
```

---

## 2. Data Model

### 2.1 Table: `retainer_templates`
```sql
CREATE TABLE retainer_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id    uuid NOT NULL REFERENCES entities(id),
  name         varchar(255) NOT NULL,
  description  text,
  client_id    uuid REFERENCES clients(id),
  schedule     varchar(50),
  priority     varchar(50) DEFAULT 'Normal',
  assigned_to  uuid REFERENCES users(id) ON DELETE SET NULL,
  pf_amount    decimal(15,2) DEFAULT 0,
  recurrence   text NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none', 'annual')),
  tasks        jsonb DEFAULT '[]'::jsonb,
  created_by   uuid,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),
  deleted_at   timestamptz
);

CREATE INDEX idx_retainer_templates_entity_id ON retainer_templates(entity_id);
```

### 2.2 Table: `retainer_template_generations`
```sql
CREATE TABLE retainer_template_generations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id     uuid NOT NULL REFERENCES retainer_templates(id) ON DELETE CASCADE,
  work_request_id uuid NOT NULL REFERENCES work_requests(id) ON DELETE CASCADE,
  period_label    text,
  generated_by    uuid NOT NULL REFERENCES users(id),
  generated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_retainer_template_generations_period UNIQUE (template_id, period_label)
);

CREATE INDEX idx_retainer_template_generations_template_id ON retainer_template_generations(template_id);
CREATE INDEX idx_retainer_template_generations_work_request_id ON retainer_template_generations(work_request_id);
```

---

## 3. RBAC Permission Matrix

| Role / Department | `retainers:use` | `retainers:edit` | Can List Templates | Can Create/Edit/Delete Templates | Can Generate Work Request |
|:---|:---:|:---:|:---:|:---:|:---:|
| **Admin** | ✅ | ✅ | ✅ (200) | ✅ (201 / 200 / 204) | ✅ (201) |
| **Manager** (`Management` dept) | ✅ | ❌ | ✅ (200) | ❌ (403 Forbidden) | ✅ (201) |
| **Operations Staff** | ❌ | ❌ | ❌ (403 Forbidden) | ❌ (403 Forbidden) | ❌ (403 Forbidden) |
| **Accounting / HR / Doc Staff** | ❌ | ❌ | ❌ (403 Forbidden) | ❌ (403 Forbidden) | ❌ (403 Forbidden) |

---

## 4. Endpoints

Base paths: `/v1/operations/templates` and `/v1/operations/retainer-templates` (aliased identically under `/v1/work-requests/templates` and `/v1/work-requests/retainer-templates`).

| Method | Path | Guard | Description |
|:---|:---|:---|:---|
| `GET` | `/templates`, `/retainer-templates` | `retainers:use` | List active templates for current entity |
| `POST` | `/templates`, `/retainer-templates` | `retainers:edit` | Create a new template (Admin only) |
| `PUT` | `/templates/:templateId`, `/retainer-templates/:templateId` | `retainers:edit` | Update template (Admin only) |
| `DELETE` | `/templates/:templateId`, `/retainer-templates/:templateId` | `retainers:edit` | Soft delete template (Admin only) |
| `POST` | `/templates/:templateId/generate`, `/retainer-templates/:templateId/generate` | `retainers:use` | Generate phase-model work request from template |

---

### 4.1 `GET /v1/operations/templates`
Lists all active (non-deleted) retainer templates for the current entity.

#### Guard
`retainers:use` (Manager, Admin).

#### Response `200 OK`
```json
{
  "data": [
    {
      "id": "e0e8e912-32b0-466a-b286-9dcfa2ffbb22",
      "entity_id": "8b52f367-96a9-4672-911d-ef2c16f2b45e",
      "name": "Annual Corporate Retainer",
      "description": "Annual recurring compliance package",
      "client_id": "c1a1a1a1-1111-2222-3333-444444444444",
      "schedule": "Annual",
      "priority": "Normal",
      "pf_amount": 25000,
      "recurrence": "annual",
      "tasks": [
        {
          "local_id": "t_prep",
          "title": "Prepare Annual Statements, Draft Audit Notes",
          "phase": "pre_processing",
          "default_assignees": ["user-uuid-1"]
        },
        {
          "local_id": "t_proc",
          "title": "Filing Submission",
          "phase": "processing",
          "depends_on_local_id": "t_prep"
        }
      ],
      "created_at": "2026-10-04T00:00:00.000Z",
      "updated_at": "2026-10-04T00:00:00.000Z"
    }
  ]
}
```

---

### 4.2 `POST /v1/operations/templates`
Creates a new retainer template.

#### Guard
`retainers:edit` (Admin only; Managers receive `403 Forbidden`).

#### Request Body
```json
{
  "name": "Annual Corporate Retainer",
  "description": "Annual recurring compliance package",
  "clientId": "c1a1a1a1-1111-2222-3333-444444444444",
  "schedule": "Annual",
  "priority": "High",
  "pfAmount": 25000,
  "recurrence": "annual",
  "tasks": [
    {
      "title": "Prepare FS",
      "phase": "pre_processing",
      "default_assignees": ["user-uuid-1"]
    },
    {
      "title": "Tax Filing",
      "phase": "processing"
    }
  ]
}
```

#### Response `201 Created`
Returns the created template record.

---

### 4.3 `PUT /v1/operations/templates/:templateId`
Updates an existing retainer template.

#### Guard
`retainers:edit` (Admin only; Managers receive `403 Forbidden`).

#### Response `200 OK`
Returns the updated template record.

---

### 4.4 `DELETE /v1/operations/templates/:templateId`
Soft-deletes a retainer template.

#### Guard
`retainers:edit` (Admin only; Managers receive `403 Forbidden`).

#### Response `204 No Content`

---

### 4.5 `POST /v1/operations/templates/:templateId/generate`
Generates a full work request graph from a template using the P0-D creation pipeline, and creates an audit record in `retainer_template_generations`.

#### Guard
`retainers:use` (Manager and Admin).

#### Request Body
```json
{
  "period_label": "FY-2026",
  "overrides": {
    "title": "Annual Retainer - FY-2026 Custom Title",
    "priority": "Urgent",
    "assignedTo": "user-uuid-2"
  }
}
```

#### Request Fields
- `period_label` *(string, optional; required if `template.recurrence === 'annual'`)*: Unique period label (e.g. `'FY-2026'`). Also accepts `periodLabel`.
- `overrides` *(object, optional)*: Overrides for top-level work request fields (`title`, `description`, `clientId`, `priority`, `assignedTo`, `coAssignees`, `dueDate`).
  - If `overrides.title` is omitted, the title defaults to `${template.name} - ${period_label}` if `period_label` is present, or `${template.name}` otherwise.

#### Processing Guarantees
1. **Pipeline Reuse**: Directly invokes `createWorkRequest({ entityId, data, user })` in `backend/src/modules/operations/service.js`.
2. **Phase Model Integration**: Automatically organizes template tasks into `pre_processing` and `processing` phases.
3. **Delimiter Tokenization**: Multi-task delimiter strings (e.g., `"Prepare Statements, File Docs; Review Notes"`) in task titles are tokenized into sibling tasks, preserving the original string in audit note.
4. **Assignee Attribution**: Dual-writes attribution to `task_assignees` with caller attribution (`assigned_by = req.user.id`).
5. **Anti-Duplicate Period Guard**: If `(template_id, period_label)` has already been generated, immediately returns `409 Conflict`.
6. **Transactional Audit Logging**: Inserts generation metadata into `retainer_template_generations` with `(template_id, work_request_id, period_label, generated_by, generated_at)`.
7. **Idempotency**: Replaying with the same `Idempotency-Key` header replays the original response without duplicate records.

#### Response `201 Created`
```json
{
  "data": {
    "id": "wr-uuid-1",
    "title": "Annual Corporate Retainer - FY-2026",
    "phase": "pre_processing",
    "status": "Draft",
    "priority": "High",
    "clientId": "c1a1a1a1-1111-2222-3333-444444444444",
    "phases": {
      "pre_processing": {
        "tasks": [ ... ]
      },
      "processing": {
        "tasks": [ ... ]
      }
    },
    "tasks": [ ... ],
    "generation": {
      "id": "gen-uuid-1",
      "template_id": "tpl-uuid-1",
      "work_request_id": "wr-uuid-1",
      "period_label": "FY-2026",
      "generated_by": "user-uuid-caller",
      "generated_at": "2026-10-04T01:00:00.000Z"
    }
  }
}
```

#### Error Scenarios
- `400 Bad Request` (`code: 'PERIOD_LABEL_REQUIRED'`): `period_label` was omitted when `recurrence === 'annual'`.
- `404 Not Found`: Template does not exist, belongs to another entity, or is soft-deleted.
- `409 Conflict` (`code: 'PERIOD_ALREADY_GENERATED'`): Work request for this `(template_id, period_label)` was already generated.
