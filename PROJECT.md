# Project: Tier 2 UX Parity, Ephemeral Presence & Optimistic Concurrency Control

## Architecture
The Tier 2 UX Parity and Concurrency architecture delivers real-time collaboration awareness and data-loss prevention across high-traffic ERP domains (Operations, Billing, Disbursements, DMS):
1. **Ephemeral Presence Subsystem**:
   - Pure in-memory Supabase WebSockets (`presence:${domain}:${roomId}`) with zero database persistence.
   - Guarded by `isFeatureEnabled('realtime_sync')`.
   - Rapid lifecycle transitions (< 200ms untrack cleanup upon unmount or dynamic dropdown switching).
2. **Optimistic Concurrency Control (OCC) Subsystem**:
   - RFC 7807 HTTP 409 conflict detection via `isConcurrencyConflictError(err)` for stale entity writes.
   - Guarded by `isFeatureEnabled('strict_occ')` passing `expectedVersion`.
   - Non-destructive `ConflictResolutionModal` surfaces side-by-side comparison and "Refresh & Keep Latest" query invalidation.
3. **Cross-Surface Collaboration Protocol**:
   - Work Request presence synchronization between List View (`WorkRequestSidePeek.tsx`) and Board View (`PhaseKanbanBoard.tsx`).
   - Dynamic untrack/re-track on dropdown change in Kanban toolbar.

## Feature Inventory
| # | Feature | Description | Milestone | Source | Status |
|---|---------|-------------|-----------|--------|--------|
| 1 | Universal Domain Routing in PresenceAvatars | Support optional `domain` prop defaulting to `'work_request'`, format channel name as `presence:${domain}:${roomId}` with prefix protection | M1 | ORIGINAL_REQUEST §R1 | DONE |
| 2 | Dynamic Untrack and Room Teardown | Cleanly untrack previous channel and reset viewers within ~200ms when `roomId` or `domain` prop changes | M1 | Spec §3 Parcel 2A | DONE |
| 3 | Realtime Sync Feature Flag Gating | Strictly bypass WebSocket connections and return null when `realtime_sync` flag is false | M1 | ORIGINAL_REQUEST §R1 | DONE |
| 4 | Kanban Board Toolbar Presence Integration | Mount `<PresenceAvatars roomId={effectiveWrId} />` in PhaseKanbanBoard toolbar beside dropdown | M1 | ORIGINAL_REQUEST §R1 | DONE |
| 5 | Cross-Surface Work Request Collaboration | Synchronize viewers between WorkRequestSidePeek and PhaseKanbanBoard on identical `work_request` channel | M1 | ORIGINAL_REQUEST §R1 | DONE |
| 6 | Document Viewer Presence Mount | Mount `<PresenceAvatars domain="document" roomId={doc.id} maxAvatars={4} />` in DocumentViewerModal header | M1 | ORIGINAL_REQUEST §R1 | DONE |
| 7 | Strict OCC in Billing Mutations | Pass `expectedVersion` in `updateInvoiceAction` and `updateClientAddressAction` when `strict_occ` is enabled | M2 | ORIGINAL_REQUEST §R2 | DONE |
| 8 | Invoice Presence Avatar Mount | Mount `<PresenceAvatars domain="invoice" roomId={effectiveId} maxAvatars={4} />` in InvoiceDetailModal header | M2 | ORIGINAL_REQUEST §R1 | DONE |
| 9 | Invoice OCC Conflict Modal | Intercept 409 errors in InvoiceDetailModal and present `<ConflictResolutionModal />` | M2 | ORIGINAL_REQUEST §R2 | DONE |
| 10 | Invoice Cache Revalidation | Invalidate/refetch `billingKeys.invoiceDetail(effectiveId)` and `billingKeys.invoices()` on conflict refresh | M2 | ORIGINAL_REQUEST §R2 | DONE |
| 11 | Strict OCC in Disbursement Mutations | Enforce `expectedVersion: item.version` in `useApproveDisbursement`, `useRejectDisbursement`, and `useFundDisbursement` | M3 | ORIGINAL_REQUEST §R3 | DONE |
| 12 | Disbursement Presence Avatar Mount | Mount `<PresenceAvatars domain="disbursement" roomId={id} maxAvatars={4} />` in DisbursementDetailDrawer header | M3 | ORIGINAL_REQUEST §R1 | DONE |
| 13 | Disbursement OCC Conflict Modal | Intercept 409 errors on approve/reject/fund in DisbursementDetailDrawer and mount `<ConflictResolutionModal />` | M3 | ORIGINAL_REQUEST §R3 | DONE |
| 14 | Disbursement Cache Revalidation | Invalidate/refetch `disbursementKeys.detail(id)` and `disbursementKeys.lists()` on conflict refresh | M3 | ORIGINAL_REQUEST §R3 | DONE |
| 15 | Billing Presence & OCC Test Suite | Unit tests in `frontend/src/features/billing/__tests__/invoicePresenceAndOcc.test.tsx` | M4 | ORIGINAL_REQUEST §R4 | DONE |
| 16 | Disbursements Presence & OCC Test Suite | Unit tests in `frontend/src/features/disbursements/__tests__/disbursementPresenceAndOcc.test.tsx` | M4 | ORIGINAL_REQUEST §R4 | DONE |
| 17 | Phase Kanban Dynamic Teardown Test Suite | Enhanced unit tests in `frontend/src/features/operations/__tests__/phaseKanban.test.tsx` verifying dropdown switching | M4 | ORIGINAL_REQUEST §R4 | DONE |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Foundation & Presence Core | `PresenceAvatars.tsx`, `PhaseKanbanBoard.tsx`, `DocumentViewerModal.tsx`, `WorkRequestSidePeek.tsx` | none | DONE |
| M2 | Billing Presence & OCC Guard | `frontend/src/features/billing/api/useBillingMutations.ts`, `frontend/src/features/billing/components/InvoiceDetailModal.tsx` | M1 | DONE |
| M3 | Disbursements Presence & OCC Guard | `frontend/src/features/disbursements/api/useDisbursements.ts`, `frontend/src/features/disbursements/components/DisbursementDetailDrawer.tsx` | M1 | DONE |
| M4 | E2E & Unit Test Suites | `invoicePresenceAndOcc.test.tsx`, `disbursementPresenceAndOcc.test.tsx`, `phaseKanban.test.tsx`, `TEST_INFRA.md`, `TEST_READY.md` | M1, M2, M3 | DONE |
| M5 | Final Verification & Forensic Audit | Full test suite execution (1,376 tests, 100% pass), typecheck (0 errors), build (clean), Reviewers (APPROVE), Challengers (APPROVE), Forensic Auditor (CLEAN) | M4 | DONE |

## Interface Contracts
### Presence Channel Contract
- Room ID format: `presence:${domain}:${cleanRoomId}`
- If `cleanRoomId.startsWith('presence:')`, use `cleanRoomId` directly.
- Default domain: `'work_request'`
- Supported domains: `'work_request' | 'invoice' | 'disbursement' | 'document' | string`
- User presence payload: `{ id, name, email, role, avatarUrl, onlineAt }`

### Conflict Resolution Contract
- Error detection: `isConcurrencyConflictError(err)` returns true for `status === 409 || code === 'CONCURRENCY_CONFLICT' || code === 'ERR_CONCURRENCY_CONFLICT'`
- Modal properties: `<ConflictResolutionModal isOpen={...} onClose={...} error={...} entityTitle={...} entityType={...} expectedVersion={...} onRefreshAndKeepLatest={...} />`
- Refetch invalidation:
  - Billing: `billingKeys.invoiceDetail(effectiveId)` and `billingKeys.invoices()`
  - Disbursements: `disbursementKeys.detail(id)` and `disbursementKeys.lists()`

## Code Layout
- Common Components:
  - `frontend/src/components/common/PresenceAvatars.tsx`: Universal presence avatar stack
  - `frontend/src/components/common/ConflictResolutionModal.tsx`: Shared OCC conflict modal
- Operations Domain:
  - `frontend/src/features/operations/components/PhaseKanbanBoard.tsx`: Board toolbar presence & dropdown switcher
  - `frontend/src/features/operations/components/WorkRequestSidePeek.tsx`: Side peek drawer presence
  - `frontend/src/features/operations/__tests__/phaseKanban.test.tsx`: Kanban presence tests
- Billing Domain:
  - `frontend/src/features/billing/api/useBillingMutations.ts`: OCC version parameter handling
  - `frontend/src/features/billing/components/InvoiceDetailModal.tsx`: Presence mounting & OCC conflict handling
  - `frontend/src/features/billing/__tests__/invoicePresenceAndOcc.test.tsx`: Billing presence & OCC tests
- Disbursements Domain:
  - `frontend/src/features/disbursements/api/useDisbursements.ts`: Disbursement mutation hooks OCC version handling
  - `frontend/src/features/disbursements/components/DisbursementDetailDrawer.tsx`: Presence mounting & OCC conflict handling
  - `frontend/src/features/disbursements/__tests__/disbursementPresenceAndOcc.test.tsx`: Disbursement presence & OCC tests
- Documents Domain:
  - `frontend/src/features/documents/components/DocumentViewerModal.tsx`: DMS presence mounting
