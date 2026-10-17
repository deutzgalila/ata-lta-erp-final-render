# PR: Parcel OPS (Operations & Entity Filter) — Enterprise Migration UAT Fix Wave

**Branch**: `fix/uat-operations`  
**Base Commit**: `45580147` (`origin/enterprise-v2`)  
**Status**: Ready for Review / Merge  
**Verification Gates**: All 4 Gates Passed (Exit Code 0)

---

## 1. Summary of Changes

This pull request resolves all 8 user acceptance testing (UAT) defect and enhancement items assigned to the **Parcel OPS (Operations & Entity Filter)** stream:

| Ref | Requirement | Implementation Summary |
|---|---|---|
| **UAT-GEN1** | Entity "ALL" filter in `lib/api.ts` & `Topbar.tsx` default | Updated `lib/api.ts` to omit `X-Active-Entity` when `activeEntity === 'ALL'`, and ensure any literal `'ALL'` header is stripped. In `Topbar.tsx`, updated active entity default fallback to `user?.entities?.[0] || 'ATA'` rather than a hardcoded string. |
| **UAT-OPS1** | Draft auto-save pause in `WorkRequestModal.tsx` | Added `isDirty` state tracking to `WorkRequestModal.tsx`. Auto-save debounce effect only executes when `isDirty === true`, `!hasDraftBanner`, and `!isEditMode`, preventing auto-save from overwriting valid `localStorage` drafts with blank form data upon modal mount. |
| **UAT-OPS2** | Archive restore in `OperationsArchiveTab.tsx` with entity header | Updated `useWorkRequests.ts` (`archiveMutation`, `restoreMutation`, `cancelMutation`) to accept `{ id, entity }` and supply `X-Active-Entity: entity` in request headers. Updated `ArchiveConfirmModal.tsx` and `OperationsArchiveTab.tsx` to pass the resource's entity and trigger `refetch()` and modal dismiss upon restore success. |
| **UAT-OPS3** | Work Request edit persistence in `WorkRequestModal.tsx` | Enhanced `WorkRequestModal.tsx` `handleSubmit` in edit mode to invoke `updateWorkRequest` with resource entity headers, synchronize task line items (add new tasks, update modified tasks, remove deleted tasks per `operations@2.0.0` §3.8), and synchronously invalidate `workRequestDetail(id)`, `tasks(id)`, `workRequests()`, and count queries. |
| **UAT-OPS4** | Clickable task cards in `PhaseKanbanBoard.tsx` & `TaskDetailModal.tsx` | Built `TaskDetailModal.tsx` displaying task attributes, phase badge, assignees, description, checklist items, linked documents (with `DocumentViewerModal` trigger), time logged summary, and inline duration recording form via `useCreateTimeEntry()`. Connected task cards in `PhaseKanbanBoard.tsx` to open `TaskDetailModal` on click, including deep link support via URL query `?taskId=xxx`. |
| **UAT-OPS5** | Remove task-card drag from `PhaseKanbanBoard.tsx` | Removed `draggable={canEdit}` (set `draggable={false}`), removed `GripVertical` icon and grab cursors, removed drag event handlers, and strictly blocked/prohibited drag actions on column drop targets in `PhaseKanbanBoard.tsx`. |
| **UAT-OPS6** | Audit WR team member automatic mirroring | Audited `backend/src/modules/operations/service.js:824–831`. Authored formal GAP note at `docs/enterprise-migration/GAP-UAT-OPS6.md` documenting server-side task-assignee to WR `co_assignees` promotion. ZERO backend modifications performed in strict compliance with Rules R4 and R5. |
| **UAT-GEN2** | Operations list side-peek panel matching `erp_prototype` | Created `WorkRequestSidePeek.tsx` slide-out drawer matching `erp_prototype/js/utils.js:1760–1840` with dark backdrop, keyboard Escape support, WR properties, gate blocker warnings, task list breakdown with QA statuses, and quick action buttons ("View in Board", "Edit"). Integrated into `WorkRequestList.tsx` row title click and action view button. |

---

## 2. File Ownership & Boundary Verification (Rule R7)

Only files within the exclusive file boundaries were touched:

```
frontend/src/components/layout/Topbar.tsx
frontend/src/lib/api.ts
frontend/src/features/operations/api/useWorkRequests.ts
frontend/src/features/operations/components/ArchiveConfirmModal.tsx
frontend/src/features/operations/components/OperationsArchiveTab.tsx
frontend/src/features/operations/components/PhaseKanbanBoard.tsx
frontend/src/features/operations/components/TaskDetailModal.tsx (new)
frontend/src/features/operations/components/WorkRequestList.tsx
frontend/src/features/operations/components/WorkRequestModal.tsx
frontend/src/features/operations/components/WorkRequestSidePeek.tsx (new)
frontend/src/features/operations/__tests__/uatOpsFixes.test.tsx (new)
docs/enterprise-migration/GAP-UAT-OPS6.md (new)
docs/enterprise-migration/UAT-OPS-PR.md (new)
```

- **Rule R4 / R5 (Backend Freeze)**: ZERO files in `backend/` were touched.
- **Rule R6 (Git Attribution)**: ZERO `Co-Authored-By` trailers on any git commit.

---

## 3. Automated Test & Build Verification Results

All automated gates were executed and verified cleanly:

### 1. TypeScript Compiler Check
```bash
npm run typecheck
```
**Result**: Exit code `0`. Clean compilation across all files.

### 2. ESLint Check
```bash
npm run lint
```
**Result**: Exit code `0`. Clean lint run with 0 errors and 0 warnings.

### 3. Operations Unit & Integration Tests (Vitest)
```bash
npx vitest run src/features/operations
```
**Result**: Exit code `0`.
- **Test Files**: 20 passed (20 total)
- **Tests**: 391 passed (391 total)
- Includes dedicated 7-test verification suite in `src/features/operations/__tests__/uatOpsFixes.test.tsx`:
  - `omits X-Active-Entity header when activeEntity is ALL` (Passed)
  - `includes X-Active-Entity header when activeEntity is ATA or LTA` (Passed)
  - `UAT-OPS5: renders task cards without drag attributes and without GripVertical` (Passed)
  - `UAT-OPS4: clicking task card opens TaskDetailModal with description, documents, and time logged summary` (Passed)
  - `TaskDetailModal submits new time entry via useCreateTimeEntry` (Passed)
  - `WorkRequestSidePeek renders WR attributes, blocker warning, and tasks list` (Passed)
  - `WorkRequestList opens WorkRequestSidePeek on title or view button click` (Passed)

### 4. Production Build (Vite)
```bash
npm run build
```
**Result**: Exit code `0`. Production bundle compiled in 5.28s without errors.
