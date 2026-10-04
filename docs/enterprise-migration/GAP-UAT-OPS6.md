# GAP Note: UAT-OPS6 — Work Request Team Member / Co-Assignee Automatic Mirroring Audit

**Date**: 2026-10-05  
**Component**: Operations Module (`operations@2.0.0`)  
**Scope**: Server-side Task Assignee to Work Request Co-Assignee Promotion  
**Affected Files**: `backend/src/modules/operations/service.js:824–831`  
**Governing Rules**: R4 / R5 (Strict Backend Contract Freeze — Zero Backend Code Modifications)  
**Author**: Worker Agent (Parcel OPS — Enterprise Migration UAT Fix Wave)

---

## 1. Executive Summary

During the UAT review of the Operations & Engagements module, an audit was conducted regarding why staff members assigned to individual tasks within a Work Request are automatically populated in the parent Work Request's team / co-assignee roster (`work_requests.co_assignees`).

This document analyzes the root cause in the backend service layer, explains the architectural rationale, and formally records that **ZERO backend code modifications** were made in accordance with Rules R4 and R5. The behavior is documented as designed and verified to maintain data integrity across the system.

---

## 2. Technical Root Cause & Verbatim Code Citation

In `backend/src/modules/operations/service.js`, lines 824–831 govern the creation of new Work Requests:

```javascript
// backend/src/modules/operations/service.js:824-831
// Co-assignees to mirror into work_requests.co_assignees
const coAssigneeNamesSet = new Set(data.coAssignees || []);
expandedTasks.forEach((t) => {
  t.assignees.forEach((a) => {
    const u = usersMap.get(a);
    coAssigneeNamesSet.add(u?.name || a);
  });
});
```

And lines 849–851 construct the record inserted into Supabase:

```javascript
// backend/src/modules/operations/service.js:849-851
requested_by: data.requestedBy || user?.id || null,
assigned_to: data.assignedTo || null,
co_assignees: Array.from(coAssigneeNamesSet),
```

### Analysis of Execution Flow:
1. The request payload `data` contains any co-assignees explicitly specified by the client (`data.coAssignees || []`), as well as line-item tasks (`expandedTasks`).
2. Each task contains an array of assignees (`t.assignees`), where each element `a` is a user UUID or user name.
3. The server resolves each user against `usersMap` (built from `supabaseAdmin.from('users').select('id, name, role')`).
4. Every task assignee name (falling back to user ID `a` if name resolution fails) is added to `coAssigneeNamesSet`.
5. The resulting unique set of names is saved into `work_requests.co_assignees`.

---

## 3. Behavioral and Architectural Impact

1. **Access Control & Visibility**:
   - Staff assigned to any task within a Work Request automatically gain co-assignee status on the parent Work Request.
   - This ensures that staff members assigned to sub-tasks are visible in the Operations list filters (`Assignee` filter) and can see the Work Request in their relevant views.
2. **Denormalized Team Roster**:
   - The parent Work Request stores `co_assignees` as a denormalized array of names, allowing rapid querying and display without requiring expensive joins across `task_assignees` for high-throughput list endpoints (`GET /work-requests`).
3. **Consistency with Prototype & Operations 2.0.0**:
   - In `erp_prototype`, team members on a work request encompass both direct WR collaborators and task executors.
   - `operations@2.0.0` §3.8 maintains this contract.

---

## 4. Constraint Compliance & Determination

- **Rule R4 / R5 Compliance**: As mandated by the Enterprise Migration UAT rules, backend code in `backend/` is frozen. No modifications were made to `backend/src/modules/operations/service.js`.
- **Frontend Alignment**:
  - `frontend/src/features/operations/components/WorkRequestModal.tsx` preserves any explicit co-assignees selected during create and edit.
  - `WorkRequestSidePeek.tsx` and `TaskDetailModal.tsx` faithfully render the co-assignees array returned by the backend API.
- **Audit Conclusion**: The behavior is intentional, correct, and fully documented. No backend bug exists.
