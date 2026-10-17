---
id: P0-E
phase: 0
depends_on: [P0-A, P0-D]
touches: [backend/src/modules/ (retainer templates location — verify), backend/migrations/, backend/tests/]
status: pending
---

# P0-E — Retainer Templates: Manager-Use, Admin-Edit, Annual Recurrence

## 1. Mission

Deliver the client's retainer-template workflow: **Admin owns templates; Managers generate work requests from them; generation supports manual annual recurrence.** Includes seeding the new client-provided template (WR list supplied during UAT) once Admin confirms content. Done = generation produces a phase-model WR (per P0-D shape) with correct permissions and an auditable generation log.

## 2. Ground Truth

- Retainer templates already exist: migration `025-create-retainer-templates.sql` (verify exact table/shape before writing — record deltas in PR).
- Keys from P0-A: `retainers:use` (Management, Admin), `retainers:edit` (Admin only).
- WR creation graph shape is P0-D §3.1's phase model — generation MUST reuse P0-D's creation service function (single pipeline, single idempotency/transaction semantics). Do not fork the creation logic.
- UAT ask: "new retainer template covering the provided list of work requests" + "manually recurring (annually)" + "managers use but cannot edit/create."

## 3. Contract

### 3.1 Schema (migration; verify existing columns first)

```sql
ALTER TABLE retainer_templates ADD COLUMN IF NOT EXISTS recurrence text
  NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none','annual'));

CREATE TABLE IF NOT EXISTS retainer_template_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES retainer_templates(id) ON DELETE CASCADE,
  work_request_id uuid NOT NULL REFERENCES <work_requests>(id),
  period_label text,              -- e.g. 'FY-2026'; required when recurrence='annual'
  generated_by uuid NOT NULL REFERENCES users(id),
  generated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, period_label)
);
```

`UNIQUE(template_id, period_label)` is the anti-duplicate guard for annual regeneration.

### 3.2 Endpoints (module location: follow where templates live today; likely under billing or operations — verify and state in PR)

| Method | Path | Guard | Behavior |
| :--- | :--- | :--- | :--- |
| POST | `.../retainer-templates` | `retainers:edit` | Create template (items = phase-tagged task definitions) |
| PUT | `.../retainer-templates/:id` | `retainers:edit` | Edit |
| GET | `.../retainer-templates` | `retainers:use` | List (managers see use-only view) |
| POST | `.../retainer-templates/:id/generate` | `retainers:use` | Body `{ period_label?, overrides? }` → creates WR via P0-D pipeline; 409 on duplicate period_label; returns full WR graph |

Template items schema: `{ title, description, phase: 'pre_processing'|'processing', default_assignees?: [], depends_on_local_id? }` — the generate path materializes them through the same tokenizer/create path as P0-D (tokenization applies to `title` if client list arrives delimiter-formatted).

## 4. Rules

- R1. Manager never reaches create/edit endpoints (403) — enforced server-side, not UI-hidden only.
- R2. Generation uses P0-D's create service; a manual WR and a template-generated WR are indistinguishable downstream.
- R3. Recurrence is **manual**: no cron, no scheduler. "Recurring annually" = the template supports repeated generation with distinct `period_label`s, guarded by the unique constraint.
- R4. Generation is transactional and idempotent (Idempotency-Key like P0-D §3.1).
- R5. Generation writes a `retainer_template_generations` row in the same transaction (audit + duplicate guard).
- R6. The client's new template seed: deliver as an idempotent seed script or admin-UI-created record; the UAT-provided WR list is inserted verbatim (with delimiter tokenization applied where items contain delimiters) — content approved by Admin before seeding prod (P3 checklist item).

## 5. Acceptance Criteria

- AC-1 (R1): Manager `POST/PUT /retainer-templates` → 403; `POST .../generate` → 201.
- AC-2 (R2): generated WR passes all P0-D invariants (phase tags, gates, transactionality) — assert generated graph shape matches create-endpoint shape.
- AC-3 (R3,R5): generating twice with same `period_label` → 409; different label → second WR; both generations logged.
- AC-4 (R4): retry with same Idempotency-Key → single WR + single generation row.

## 6. Tests Required

`backend/tests/retainer-templates.spec.js` — permission matrix (Manager/Admin/staff × each endpoint), generation graph integrity, recurrence duplicate guard, idempotency.

## 7. Explicit Non-Goals

- ❌ No scheduler/cron/auto-generation.
- ❌ No React/template-builder UI (P2 Admin module).
- ❌ No edits to billing payment templates (`billing:templates` key territory — separate concept).
- ❌ Do not seed production — seeding is a P3 cutover step after Admin content sign-off.

## 8. Working Constraints

Branch `feat/p0-e-retainer-templates`. If the generate path reveals P0-D service cannot be imported cleanly (circular deps), stop and coordinate — do not copy-paste the creation logic.

## 9. Handoff

Produces: template contract + generation endpoint for P0-H freeze and the React Admin/Operations screens; `period_label` vocabulary for reporting.

## 10. References

Vault master spec §2.6 · migration `025-create-retainer-templates.sql` · P0-D §3.1 (creation contract).
