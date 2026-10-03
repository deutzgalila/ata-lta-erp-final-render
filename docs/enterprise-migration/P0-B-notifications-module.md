---
id: P0-B
phase: 0
depends_on: [P0-A]
touches: [backend/migrations/, backend/src/modules/notifications/ (new), backend/src/modules/me/, backend/src/app.js, backend/tests/]
status: pending
---

# P0-B — Notifications Module (In-App Only)

## 1. Mission

Provide the persistence + query + read-state plumbing every user-facing notification flows through. **No UI** (vanilla frozen; the bell ships in React). Done = table + module + 4 trigger emitters wired as a reusable `notify()` helper that P0-D and P0-G call.

## 2. Ground Truth

- No notifications module exists today (verified module list: admin, auth, billing, clients, disbursements, documents, me, operations, operationsRequests, reports, transmittals).
- Key `notifications:view` arrives via P0-A for every authenticated user.
- Route conventions to mimic: `operationsRequests/routes.js` — `router.use(auth, entityScope)` then per-route `resolveEntity`, `requirePermission`, `audit`.
- Migration numbering: node-pg-migrate JS files under `backend/migrations/`, latest ≈ `000036_*`; use next sequence number.
- `/me` payload gained `permissions` in P0-A; this parcel adds `unread_notifications` the same additive way.

## 3. Contract

### 3.1 Migration `000037_create_notifications.js` (number = next free)

```sql
CREATE TABLE notifications (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         text NOT NULL CHECK (type IN (
                 'pending_request.resolved',
                 'wr.transition_request.received',
                 'wr.transition_request.resolved',
                 'wr.qa_reroute'
               )),
  payload      jsonb NOT NULL DEFAULT '{}',
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id) WHERE read_at IS NULL;
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);
```

(If the users table name differs — verify in migrations first — follow the actual referenced table.)

### 3.2 Endpoints (new module `backend/src/modules/notifications/`, mounted `/v1/notifications`)

| Method | Path | Guard | Behavior |
| :--- | :--- | :--- | :--- |
| GET | `/v1/notifications?limit=&cursor=` | `notifications:view` | Own notifications, newest first, cursor-paginated (follow existing pagination conventions) |
| POST | `/v1/notifications/:id/read` | `notifications:view` | Sets `read_at` if owned & unread; idempotent |
| POST | `/v1/notifications/read-all` | `notifications:view` | Marks all own unread as read |

### 3.3 `unread_notifications` count

`GET /v1/me` response gains `unread_notifications: <int>` (cheap COUNT over the partial index).

### 3.4 Emitter helper (the real deliverable)

`backend/src/services/notify.js` → `notify(userIds: string[], type: string, payload: object): Promise<void>` — bulk insert, never throws into request path (log-and-continue on failure), no delivery side effects (v1 in-app only).

### 3.5 Payload shapes per type (freeze exactly)

| Type | Payload |
| :--- | :--- |
| `pending_request.resolved` | `{ request_id, table_name, outcome: 'approved'|'rejected', reason?, title }` |
| `wr.transition_request.received` | `{ request_id, work_request_id, wr_title, from_phase, to_phase, requested_by_name }` |
| `wr.transition_request.resolved` | `{ request_id, work_request_id, outcome, reason?, to_phase }` |
| `wr.qa_reroute` | `{ work_request_id, wr_title, to_phase, reason, failed_task_ids: [] }` |

Deep links are a React-side concern: payload carries ids, not URLs.

## 4. Rules

- R1. Users can only ever read/mark their own rows (enforce in queries by `req.user.id`, never client-supplied user_id).
- R2. All four types pass the CHECK; unknown type → 400 from the emitter path, never a silent string.
- R3. `notify()` failure must not fail the triggering business operation (try/catch + logger). Include a test asserting this.
- R4. Idempotent read-marking (double POST → 200 both times).
- R5. No email, no websocket, no push — in-app rows only.
- R6. Emitters are **not wired** to business events in this parcel; P0-D/P0-G do that. This parcel delivers the helper + module only, but unit-proves `notify()` with the four frozen type/payload pairs.

## 5. Acceptance Criteria

- AC-1 (R1): Supertest — user B cannot read/mark user A's notification (403/404), verified both endpoints.
- AC-2 (R2,R6): unit tests of `notify()` cover all four type/payload combos + unknown-type rejection.
- AC-3 (R3): forced DB failure during `notify()` leaves the caller's operation succeeding.
- AC-4 (R4): `POST :id/read` twice → both 200; second is a no-op.
- AC-5: migration up/down clean on a scratch DB; full existing suite green.

## 6. Tests Required

- `backend/tests/notifications.spec.js` — AC-1..AC-4 as named cases + pagination ordering.
- `backend/tests/notify.service.spec.js` — emitter unit tests per AC-2/AC-3.

## 7. Explicit Non-Goals

- ❌ No vanilla UI, no bell, no badge.
- ❌ No email/SSE/websockets/push.
- ❌ No business-event wiring (P0-D/P0-G own the emit calls).
- ❌ No notification preferences/settings.

## 8. Working Constraints

Branch `feat/p0-b-notifications`. Mirror `modules/operationsRequests` file layout (controller/routes/service/schema + Zod). Publish endpoint docs into `docs/api-contracts/` in the same PR.

## 9. Handoff

Produces: `notify()` helper + frozen type/payload vocabulary → imported by P0-D (transition + reroute events) and P0-G (pending-resolution events); `unread_notifications` on `/me` → consumed by P1 React shell.

## 10. References

Vault master spec §2.5 · alignment memory (D9) · `modules/operationsRequests/routes.js` for route idioms.
