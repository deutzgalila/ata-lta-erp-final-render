# GAP Note: UAT-FIN3 — Accounts Receivable Aging Report Manager Scoping Audit

**Date**: 2026-10-05  
**Component**: Billing Module (`billing@2.0.0`)  
**Scope**: Server-side Lack of Manager / User Scoping on Accounts Receivable Aging Report  
**Affected Files**:
- `backend/src/modules/billing/routes.js:103`
- `backend/src/modules/billing/controller.js:172–179`
- `backend/src/modules/billing/service.js:791–805`  
**Governing Rules**: R4 / R5 (Strict Backend Contract Freeze — Zero Backend Code Modifications)  
**Author**: Worker Agent (Parcel FIN — Enterprise Migration UAT Fix Wave)

---

## 1. Executive Summary

During the UAT verification of the Financial Modules (Parcel FIN), an investigation was conducted to determine whether the Accounts Receivable Aging Report (`GET /v1/invoices/aging`) enforces data scoping by Manager or client assignment. Specifically, the inquiry evaluated whether Managers should only observe aging balances for clients/work requests under their operational purview, or whether the current global entity view is caused by a missing client-side query parameter vs. a server-side limitation.

Forensic audit of `backend/src/modules/billing/` confirms that:
1. The route `GET /v1/invoices/aging` accepts no client or user scoping query parameters.
2. The controller (`controller.js:172-179`) extracts only `entityId: req.activeEntity`, completely ignoring `req.user` and discarding `req.query`.
3. The underlying service (`service.js:791-805`) queries all non-deleted invoices across the entire entity where `balance > 0`, without any manager, user, or client filtering.
4. In contrast, `listInvoices` in `service.js:83-90` explicitly applies `getUserConcernedWorkRequestIds(user)` when `!isAdmin && !isAccounting`.

This behavior is **100% server-side root cause**. In accordance with Wave 2 Rules R4 and R5 ("ZERO backend modifications"), **ZERO backend code modifications** were made. This formal GAP Note documents the root cause, execution flow, security/operational impact, and proposed backend remediation specification for post-wave execution.

---

## 2. Technical Root Cause & Verbatim Code Citation

### 2.1 Route Guard Definition
In `backend/src/modules/billing/routes.js` (line 103):
```javascript
// backend/src/modules/billing/routes.js:103
router.get('/aging', requirePermission('billing:view'), billingController.getAgingReport);
```
The endpoint is guarded solely by `requirePermission('billing:view')`. Per `docs/api-contracts/rbac-matrix.md`, `billing:view` is held by `Admin`, `Management`, `Accounting`, and `Operations`.

### 2.2 Controller Implementation
In `backend/src/modules/billing/controller.js` (lines 171–179):
```javascript
// backend/src/modules/billing/controller.js:171-179
/** @type {import('express').RequestHandler} */
const getAgingReport = async (req, res, next) => {
  try {
    const data = await service.getAgingReport({ entityId: req.activeEntity });
    res.json({ data });
  } catch (err) {
    next(err);
  }
};
```
Observations:
- `req.query` is uninspected: any frontend filters such as `?clientId=...` or `?managerId=...` are completely discarded.
- `req.user` is not passed to `service.getAgingReport`: the service has zero context regarding the caller's identity, role, or assigned clients/work requests.

### 2.3 Service Implementation
In `backend/src/modules/billing/service.js` (lines 791–805):
```javascript
// backend/src/modules/billing/service.js:791-805
const getAgingReport = async ({ entityId }) => {
  const { data: invoices, error } = await supabaseAdmin
    .from('invoices')
    .select('*, clients(name)')
    .eq('entity_id', entityId)
    .is('deleted_at', null)
    .gt('balance', 0);

  if (error) {
    throw new AppError({
      statusCode: 500,
      title: 'Database Error',
      detail: 'Failed to fetch aging data',
    });
  }
  ...
```
Observations:
- The query filters solely on `entity_id = entityId`, `deleted_at IS NULL`, and `balance > 0`.
- All open receivables belonging to the active entity (`ATA` or `LTA`) are aggregated into the aging buckets (`current`, `1-30`, `31-60`, `61-90`, `90+`).

### 2.4 Contrast with `listInvoices` Scoping
In `backend/src/modules/billing/service.js` (lines 83–90), `listInvoices` implements explicit user scoping:
```javascript
// backend/src/modules/billing/service.js:83-90
if (!isAdmin && !isAccounting) {
  const { getUserConcernedWorkRequestIds } = require('../../lib/userScope');
  const concernedWrIds = await getUserConcernedWorkRequestIds(user);
  if (concernedWrIds.length === 0) return { data: [], count: 0 };
  query = query.in('work_request_id', concernedWrIds);
}
```
This contrast demonstrates that user/manager scoping was implemented for invoice listing, but omitted from accounts receivable aging report calculation.

---

## 3. Behavioral and Architectural Impact

1. **Broad Visibility**:
   - Any user authenticated with `billing:view` (including Operations or Manager accounts) views the complete accounts receivable aging summary for all clients across the entity.
2. **Frontend Inability to Remedy**:
   - The frontend cannot filter the aging buckets client-side because the backend endpoint returns pre-aggregated bucket totals (`summary.current`, `summary.1-30`, etc.) derived from all entity invoices.
   - Even if the frontend attempted to filter the `details` array, the summary card metrics would remain server-authoritative and global.

---

## 4. Proposed Post-Wave Backend Remediation Specification

When backend modifications are unfrozen in a future wave, the following remediation should be implemented:

1. **Update Controller (`controller.js:174`)**:
   Pass `user: req.user` and query params to service:
   ```javascript
   const data = await service.getAgingReport({
     entityId: req.activeEntity,
     user: req.user,
     clientId: req.query.clientId,
   });
   ```

2. **Update Service (`service.js:791`)**:
   Incorporate `userScope` check:
   ```javascript
   const getAgingReport = async ({ entityId, user, clientId }) => {
     let query = supabaseAdmin
       .from('invoices')
       .select('*, clients(name)')
       .eq('entity_id', entityId)
       .is('deleted_at', null)
       .gt('balance', 0);

     if (clientId) {
       query = query.eq('client_id', clientId);
     }

     const isAdmin = user?.role === 'Admin';
     const isAccounting = user?.departments?.includes('Accounting') || user?.role === 'Accounting';
     if (user && !isAdmin && !isAccounting) {
       const { getUserConcernedWorkRequestIds } = require('../../lib/userScope');
       const concernedWrIds = await getUserConcernedWorkRequestIds(user);
       if (concernedWrIds.length === 0) {
         return { summary: emptySummary(), details: [] };
       }
       query = query.in('work_request_id', concernedWrIds);
     }
     ...
   ```

---

## 5. Constraint Compliance & Determination

- **Rule R4 / R5 Compliance**: As mandated by the Enterprise Migration UAT rules, zero lines of backend code were modified.
- **Frontend State**: `frontend/src/features/billing/components/AgingReportTab.tsx` continues to faithfully query `GET /v1/invoices/aging` and render the server-returned aging buckets and details.
- **Determination**: Formal GAP documented; backend remediation queued for future backend release.
