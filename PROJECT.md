# Project: Real-Time Caching & CDC Synchronization Remediation (SPEC-REALTIME-SYNC-001)

## Architecture
The Real-Time Caching and CDC Synchronization architecture resolves multi-user stale cache snapshots and unifies PostgreSQL logical replication with TanStack Query client caches across the ATA/LTA ERP platform:
1. **PostgreSQL Logical Replication & Supabase Realtime Publication**:
   - `supabase_realtime` publication expanded to include all collaborative entities: `work_requests`, `tasks`, `operations_requests`, `notifications`, `disbursements`, `invoices`, `transmittals`, `documents`, `task_assignees`.
   - `REPLICA IDENTITY FULL` configured across all 9 collaborative tables ensuring complete previous row attributes (`payload.old`) during UPDATE and DELETE operations.
2. **Frontend CDC Normalization & Reconciler Subsystem**:
   - Dual-case normalization engine (`normalizeCdcPayload`) bridging snake_case PostgreSQL attributes with camelCase API models in TanStack Query.
   - Comprehensive soft-delete eviction (`deleted_at != null || deletedAt != null` treated as `isDelete`), evicting detail caches, filtering list caches, and removing tasks from phase containers (`patchTaskInPhases`).
   - Precision query matching (`isTaskListOfTargetWr`) preventing cross-work-request task cache pollution under `listRootKey`.
   - Cross-domain co-invalidations propagating task mutations to work request details, work request counts, taskRelated queries, and linked financial/transmittal/document records.
3. **Reactive In-App Notifications Subsystem**:
   - User-scoped real-time subscription (`user_id=eq.${user.id}`) in `useNotificationRealtimeSync`.
   - Immediate unread counter increment in `useSessionStore` and cache prepending on notification INSERT.
   - Live subscription mounted in `NotificationBellPanel.tsx`.
4. **Reactive Operations Requests & Approvals**:
   - Real-time subscription for `operations_requests` mounted in `operations.tsx`.
   - Live badge counters and inbox lists updating on request creation, approval, and rejection.
5. **Reactive Kanban Board & Task Detail Modal**:
   - `selectedTask` synchronized with live TanStack tasks query cache in `PhaseKanbanBoard.tsx`.
   - Gate calculations (`gateInfo`) and phase columns strictly excluding soft-deleted tasks (`!t.deletedAt && !t.deleted_at`).
   - `TaskDetailModal.tsx` bound to live query `useTaskDetail(task?.workRequestId, task?.id)` with fallback.
   - Invalidation of `operationsKeys.taskRelated(task.id)` on closure of linked invoice, disbursement, transmittal, and document modals.

## Feature Inventory
| # | Feature | Description | Milestone | Source | Status |
|---|---------|-------------|-----------|--------|--------|
| 1 | Backend Realtime Publication Expansion | Idempotently register `operations_requests`, `notifications`, `transmittals`, `documents`, and `task_assignees` to `supabase_realtime` in migration 000061 | M1 | SPEC §4 Parcel 1 | DONE |
| 2 | Backend Replica Identity Full | Set `REPLICA IDENTITY FULL` on `work_requests`, `tasks`, `operations_requests`, `notifications`, `disbursements`, `invoices`, `transmittals`, `documents`, `task_assignees` | M1 | SPEC §4 Parcel 1 | DONE |
| 3 | Backend Down Migration Idempotency | Idempotent down migration safely dropping added tables from `supabase_realtime` publication | M1 | SPEC §4 Parcel 1 | DONE |
| 4 | Backend Migration Unit Tests | Author comprehensive migration unit test suite for migration 000061 matching `migrations_realtime.spec.js` | M1 | Backend Test Harness | DONE |
| 5 | Dual-Case Normalization Engine | Implement `normalizeCdcTask`, `normalizeCdcWorkRequest`, `normalizeCdcOperationsRequest`, `normalizeCdcNotification`, `normalizeCdcPayload` producing dual camelCase & snake_case properties | M2 | SPEC §4 Parcel 2 | DONE |
| 6 | Accurate Soft-Delete Eviction | Detect `deleted_at != null || deletedAt != null` as `isDelete = true`, evicting detail cache, filtering list queries, and purging from phase containers | M2 | SPEC §4 Parcel 2 | DONE |
| 7 | Scoped Task List Query Matcher | Enforce `isTaskListOfTargetWr` so `targetWrId` task mutations do not contaminate sibling WR list caches under `listRootKey` | M2 | SPEC §4 Parcel 2 | DONE |
| 8 | Task Mutation Query Co-Invalidations | Patch `tasks` and `taskDetail`, invalidate `operationsKeys.workRequestDetail(targetWrId)`, `operationsKeys.workRequestCounts(activeEntity)`, and `operationsKeys.taskRelated(id)` | M2 | SPEC §4 Parcel 2 | DONE |
| 9 | Cross-Domain Co-Invalidations | `invoices`, `disbursements`, `transmittals`, `documents` invalidate `operationsKeys.taskRelated(taskId)`; `operations_requests` invalidates `requests()`, `requestCounts()`, and `workRequestDetail(wrId)`; `task_assignees` invalidates task queries | M2 | SPEC §4 Parcel 2 | DONE |
| 10 | User-Scoped Realtime Notification Hook | Implement `useNotificationRealtimeSync` hook subscribing to `notifications` filtered by `user_id=eq.${user.id}` | M3 | SPEC §4 Parcel 3 | DONE |
| 11 | Immediate Unread Counter Store Mutation | Increment `unreadCount` in `useSessionStore` and prepend incoming notification to `dashboardKeys.notifications.all` on INSERT | M3 | SPEC §4 Parcel 3 | DONE |
| 12 | Notification Bell Panel Live Mount | Mount `useNotificationRealtimeSync` in `NotificationBellPanel.tsx` ensuring instant badge counter increments | M3 | SPEC §4 Parcel 3 | DONE |
| 13 | Operations Requests Real-Time Subscription | Mount `useEntityRealtimeSync({ table: 'operations_requests' })` in `frontend/src/routes/operations.tsx` | M4 | SPEC §4 Parcel 4 | DONE |
| 14 | Reactive Approvals Inbox & Tab Badge | Ensure pending approvals inbox and `pendingCount` tab badges reactively update on request creation, approval, and rejection | M4 | SPEC §4 Parcel 4 | DONE |
| 15 | Kanban Reactive Task Selection Synchronization | Synchronize `selectedTask` with live TanStack tasks query cache in `PhaseKanbanBoard.tsx` when task attributes change | M5 | SPEC §4 Parcel 5 | DONE |
| 16 | Soft-Deleted Task Filtering in Kanban Board | Exclude soft-deleted tasks (`!t.deletedAt && !t.deleted_at`) from `activeTasks` gate calculations and phase column views | M5 | SPEC §4 Parcel 5 | DONE |
| 17 | Task Detail Modal Live Query Binding | Bind `TaskDetailModal.tsx` to `useTaskDetail(task?.workRequestId, task?.id)` falling back to prop `currentTask = liveTask || task` | M5 | SPEC §4 Parcel 5 | DONE |
| 18 | Modal Close Linked Entity Invalidation | Invalidate `operationsKeys.taskRelated(task.id)` on closure of Invoice, Disbursement, Transmittal, and Document child modals | M5 | SPEC §4 Parcel 5 | DONE |
| 19 | Dual-Track E2E Test Suite & Adversarial Hardening | Comprehensive test coverage across all tiers, 100% pass on backend (48/48 suites) and frontend (`realtime`, `operations`, `dashboard`), clean typecheck, adversarial stress testing | M6 | SPEC §5 Verification | DONE |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend Realtime Publication & Replica Identity | `backend/migrations/000061_enable_collaborative_realtime_publication.js`, unit test in `backend/tests/unit/` | none | DONE |
| M2 | Frontend Core CDC Reconciler Overhaul | `frontend/src/lib/realtime/useEntityRealtimeSync.ts`, unit tests in `frontend/src/lib/realtime/` | none | DONE |
| M3 | Real-Time Notifications Engine | `frontend/src/features/dashboard/api/useNotifications.ts`, `frontend/src/features/dashboard/components/NotificationBellPanel.tsx` | M2 | DONE |
| M4 | Real-Time Operations Requests | `frontend/src/routes/operations.tsx`, `frontend/src/features/operations/components/PendingApprovalsInbox.tsx` | M2 | DONE |
| M5 | Kanban & Task Detail Modal Reactive Binding | `frontend/src/features/operations/components/PhaseKanbanBoard.tsx`, `frontend/src/features/operations/components/TaskDetailModal.tsx` | M2 | DONE |
| M6 | E2E Test Suite Verification & Adversarial Hardening | Full backend test suite (48/48 suites), frontend test suites (`realtime`, `operations`, `dashboard`), type checks, adversarial test coverage | M1, M2, M3, M4, M5 | DONE |

## Interface Contracts

### 1. Backend Realtime Publication Contract
- Publication name: `supabase_realtime`
- Newly registered tables: `operations_requests`, `notifications`, `transmittals`, `documents`, `task_assignees`
- Replica Identity: `FULL` on `work_requests`, `tasks`, `operations_requests`, `notifications`, `disbursements`, `invoices`, `transmittals`, `documents`, `task_assignees`
- Migration file: `backend/migrations/000061_enable_collaborative_realtime_publication.js`

### 2. Normalization Dictionary Contract
- `normalizeCdcTask(record)`:
  - Produces dual keys: `workRequestId` & `work_request_id`, `qaStatus` & `qa_status`, `dueDate` & `due_date`, `displayOrder` & `display_order`, `assigneeId` & `assignee_id`, `assigneeName` & `assignee_name`, `requiredLinkType` & `required_link_type`, `phaseEnteredAt` & `phase_entered_at`, `assignedBy` & `assigned_by`, `assignedAt` & `assigned_at`, `deletedAt` & `deleted_at`.
- `normalizeCdcWorkRequest(record)`:
  - Produces dual keys: `workRequestNo` & `work_request_no`, `clientId` & `client_id`, `clientName` & `client_name`, `onHold` & `on_hold`, `phaseEnteredAt` & `phase_entered_at`, `requestedBy` & `requested_by`, `assignedTo` & `assigned_to`, `coAssignees` & `co_assignees`, `dueDate` & `due_date`, `deletedAt` & `deleted_at`.
- `normalizeCdcOperationsRequest(record)`:
  - Normalizes `request_type` -> `type` & `request_type`, `work_request_id` -> `workRequestId` & `work_request_id`, `linked_task_id` -> `linkedTaskId` & `linked_task_id`, `client_id` -> `clientId` & `client_id`, `rejection_reason` -> `rejectionReason` & `rejection_reason`.
- `normalizeCdcNotification(record)`:
  - Normalizes `user_id` -> `userId` & `user_id`, `read_at` -> `readAt` & `read_at`, `created_at` -> `createdAt` & `created_at`.

### 3. Soft-Delete Contract
- `isSoftDeleted`: `Boolean(incomingRecord.deleted_at) || Boolean(incomingRecord.deletedAt)`
- `isDelete`: `eventType === 'DELETE' || isSoftDeleted || (eventType !== 'UPDATE' && !payloadObj.new && Boolean(payloadObj.old))`
- When `isDelete === true`:
  - Detail query cache: set to `null` or remove
  - List queries: filter out `item.id !== id`
  - Parent WorkRequest phase containers: call `patchTaskInPhases(wr, id, undefined)`

### 4. Query Scope & Co-Invalidation Contract
- Task query targeting: `isTaskListOfTargetWr` checks `Array.isArray(qKey) && qKey.includes('tasks') && qKey.includes(targetWrId)`.
- Task mutations co-invalidate:
  - `operationsKeys.workRequestDetail(targetWrId)`
  - `operationsKeys.workRequestCounts(activeEntity)`
  - `operationsKeys.taskRelated(id)`
- Linked entity co-invalidations:
  - Invoices / Disbursements with `task_id` -> `operationsKeys.taskRelated(taskId)`
  - Transmittals / Documents with `linked_task_id` -> `operationsKeys.taskRelated(taskId)`
  - Operations requests -> `operationsKeys.requests()`, `operationsKeys.requestCounts(activeEntity)`, and `operationsKeys.workRequestDetail(workRequestId)`

### 5. Notification Real-Time Contract
- Channel: `useEntityRealtimeSync<RawNotificationItemApi>` on table `'notifications'`
- Filter: `user_id=eq.${user.id}`
- Root Key: `dashboardKeys.notifications.all`
- On INSERT: Immediately increment `unreadCount` in `useSessionStore` and prepend to notifications list.

### 6. P0-B ↔ P0-G (Notify Service Contract)
- **Signature:** `notify(userIds: string[], type: string, payload: object): Promise<void>`
- **Frozen Types:**
  - `pending_request.resolved`: `{ request_id, table_name, outcome: 'approved'|'rejected', reason?, title }`
  - `wr.transition_request.received`: `{ request_id, work_request_id, wr_title, from_phase, to_phase, requested_by_name }`
  - `wr.transition_request.resolved`: `{ request_id, work_request_id, outcome, reason?, to_phase }`
  - `wr.qa_reroute`: `{ work_request_id, wr_title, to_phase, reason, failed_task_ids: [] }`
- **Error Behavior:** Any DB error inside `notify()` is caught and logged; it resolves cleanly and NEVER throws to the caller. Unknown type throws HTTP 400 AppError.

### 7. P0-C ↔ Downstream (Database Schema)
- `work_requests.phase` is nullable text, constrained to `('intake', 'pre_processing', 'processing', 'review', 'quality_assurance', 'completed')`.
- `work_requests.status` CHECK constraint is a superset containing all 10 legacy values plus `'Quality Assurance'`.
- `tasks.assigned_by` (uuid) and `tasks.assigned_at` (timestamptz) added.
- `task_assignees` join table created: `(task_id uuid, user_id uuid, assigned_by uuid, assigned_at timestamptz)`.

### 8. P0-G ↔ Downstream (Disbursements & Billing)
- `POST /v1/disbursements/:id/approve` (guard: `disbursement:approve`, Admin only).
- `POST /v1/disbursements/:id/reject` (guard: `disbursement:approve`, body: `{ reason: string }`).
- `PATCH /v1/invoices/:id` (field-level security: body with `address` requires `billing:edit_client_address`).

## Code Layout
- Backend:
  - `backend/migrations/000061_enable_collaborative_realtime_publication.js`: Publication & replica identity migration
  - `backend/tests/unit/migrations_realtime_collaborative.spec.js`: Migration 000061 unit tests
  - `backend/src/modules/notifications/`: Notifications module and routes
  - `backend/src/modules/disbursements/`: Disbursement approvals and routing
  - `backend/src/modules/operations/`: Operations, tasks, and phase routes
- Frontend:
  - `frontend/src/lib/realtime/useEntityRealtimeSync.ts`: Core CDC reconciler, normalizers, soft delete, invalidations
  - `frontend/src/features/dashboard/api/useNotifications.ts`: `useNotificationRealtimeSync` hook
  - `frontend/src/features/dashboard/components/NotificationBellPanel.tsx`: Live notification listener mount
  - `frontend/src/routes/operations.tsx`: Operations requests CDC listener mount
  - `frontend/src/features/operations/components/PendingApprovalsInbox.tsx`: Reactive approvals inbox
  - `frontend/src/features/operations/components/PhaseKanbanBoard.tsx`: Reactive task synchronization & soft delete filter
  - `frontend/src/features/operations/components/TaskDetailModal.tsx`: Live `useTaskDetail` binding & modal close invalidation
