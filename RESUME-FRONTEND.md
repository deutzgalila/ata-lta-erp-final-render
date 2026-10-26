# Frontend Worktree Resumption Guide

**Updated:** 2026-10-26
**Worktree:** `/home/javvii/FreelanceProject/worktrees/wr-creation-gate-enterprise-v2`
**Target Branch:** `feat/wr-creation-gate-enterprise-v2` (for Parcel 3), then `feat/task-creation-review-enterprise-v2` (for Parcel 4)
**Baseline Upstream:** `upstream/enterprise-v2` (`f0aadb85`)

---

## 1. Quick Status Summary
- **Grill-me & Spec:** Completed and explicitly confirmed in `/home/javvii/FreelanceProject/worktrees/operations-wr-approval-revalidation/docs/wr-approval-revalidation/CONTRACT.md` and `REVIEW.md`.
- **Baseline Health:**
  - Vitest baseline: 37/37 passed across `taskScopingRules.test.tsx`, `pendingApprovals.test.tsx`, `taskRequestAuthorization.test.tsx`.
  - Typecheck baseline: `npm --prefix frontend run typecheck` passed (exit code 0).
  - Build baseline: `npm --prefix frontend run build` passed (exit code 0).
- **Execution Rules:**
  - Work ONLY in `/home/javvii/FreelanceProject/worktrees/wr-creation-gate-enterprise-v2`.
  - Do NOT modify backend or `erp_prototype`.
  - Do NOT push, merge, deploy, or mutate remote DB.
  - Separate branch per logical change:
    - Parcel 3 on `feat/wr-creation-gate-enterprise-v2`
    - Parcel 4 on `feat/task-creation-review-enterprise-v2`
  - Design Tokens: Follow `.taste-skill/direction.json` (`institutional-finance-ledger`) and preserve existing icon library (`lucide-react`), typography (`Geist Sans`), and palette.

---

## 2. Parcel Breakdown & Checklist

### Parcel 3: WR Creation Gate UI (`feat/wr-creation-gate-enterprise-v2`)
- [x] Add `creationApprovalStatus`, `rejectionReason`, `canReviewCreation`, `canResubmit`, `hasManagerLead`, etc. to `WorkRequest` types.
- [x] Add `useWorkRequestCreationApprovals`, `useWorkRequestCreationApproval` (approve/reject), and `useResubmitWorkRequestCreation` hooks in `useWorkRequests.ts` with correct query keys.
- [x] Enforce explicit Admin/Manager WR creation UI in `WorkRequestModal.tsx`, `WorkRequestList.tsx`, and `operations.tsx`.
- [x] Exclude pending/rejected WRs from regular lists (`WorkRequestList.tsx`) and Kanban switcher (`PhaseKanbanBoard.tsx`).
- [x] Implement Admin creation inbox and Manager own submissions UI in `PendingApprovalsInbox.tsx` (view pending submissions, approve/reject with reason, view rejection reason, edit & resubmit).
- [x] Verify Vitest, typecheck, lint on changed files, and build.
- [x] Commit Parcel 3 to `feat/wr-creation-gate-enterprise-v2`.

### Parcel 4: Task Creation Review UI (`feat/task-creation-review-enterprise-v2`)
- [ ] Create branch `feat/task-creation-review-enterprise-v2` from verified Parcel 3 commit.
- [ ] Add `approvalStatus`, `rejectionReason`, `canReview`, `canResubmit` to `Task` types.
- [ ] Add `useTaskCreationApproval` and `useResubmitTaskCreation` in `useTasks.ts`.
- [ ] Fix cross-WR previous-data leak in `useTasks.ts` (`placeholderData` scoping) and wrong-ID array fallback (`res.data[0]`).
- [ ] Disable employee task creation when `currentWr?.hasManagerLead === false` in `QuickAddCard.tsx` / `PhaseKanbanBoard.tsx`.
- [ ] Add readable independent task approval markers on Kanban cards (`PhaseKanbanBoard.tsx`) and side peek (`WorkRequestSidePeek.tsx`).
- [ ] Add authorized assigned Manager lead-only Approve/Reject actions (strictly NO Admin override) on board cards and side peek.
- [ ] Implement rejection reason modal flow and creator edit/resubmit path.
- [ ] Ensure pending tasks remain fully usable, rejected tasks visibly locked.
- [ ] Verify Vitest, typecheck, lint on changed files, and build.
- [ ] Commit Parcel 4 to `feat/task-creation-review-enterprise-v2`.

---

## 3. Key Reference Commands

```bash
# Run baseline tests
npm --prefix frontend test -- src/features/operations/__tests__/taskScopingRules.test.tsx src/features/operations/__tests__/pendingApprovals.test.tsx src/features/operations/__tests__/taskRequestAuthorization.test.tsx

# Typecheck
npm --prefix frontend run typecheck

# Build
npm --prefix frontend run build

# Targeted test file
npm --prefix frontend test -- <path-to-test-file>

# Lint on specific files
npx eslint <path-to-file>
```
