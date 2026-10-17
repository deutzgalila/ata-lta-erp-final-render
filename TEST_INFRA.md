# Test Infrastructure & Validation Framework (ATA/LTA ERP v2)

**Version**: 2.0.0  
**Target Architecture**: Tier 2 UX Parity, Ephemeral Collaboration & Optimistic Concurrency Control  
**Test Engine**: Vitest 3.2.7 + Testing Library (React 19 / JSDOM)  
**Total Test Files**: 93  
**Total Automated Tests**: 1,331  
**Test Pass Rate**: 100% (0 failures, 0 regressions)  
**TypeScript Diagnostic Errors**: 0 (`tsc -b` clean)  

---

## 1. Architectural Testing Doctrine

The ATA/LTA ERP automated verification framework is governed by five foundational architectural principles:

### 1.1 Zero Optimistic Updates Doctrine
- Data persistence strictly follows the **Zero Optimistic Updates Doctrine**. User actions initiate blocking transitions (`runBlockingAction`) that await authoritative server persistence before mutating client-side caches.
- Speculative local state mutations that risk divergence or phantom records are prohibited across all enterprise domains (Operations, Billing, Disbursements, Documents, Admin, Reports).

### 1.2 Ephemeral Presence Integrity
- Collaborative awareness is established via Supabase Realtime WebSocket presence channels (`presence:${domain}:${roomId}`) with **zero database persistence**.
- User joins and leaves are tracked entirely in-memory.
- Dynamic unmounts and dropdown switches trigger clean untracking and channel teardown (`< 200ms`), preventing orphaned connections, memory leaks, and ghost avatar remnants.
- Gated strictly by the `realtime_sync` feature flag.

### 1.3 Optimistic Concurrency Control (OCC) & RFC 7807 Conflict Handling
- Data writes to shared entities (Invoices, Disbursements, Work Requests) carry `expectedVersion: entity.version` when `strict_occ` is enabled.
- Stale writes trigger RFC 7807 HTTP 409 Concurrency Conflicts (`ERR_CONCURRENCY_CONFLICT` or `CONCURRENCY_CONFLICT`).
- UI error interceptors catch 409 responses, automatically dismiss `BlockingActionModal`, and mount the non-destructive `<ConflictResolutionModal />`.
- Conflict resolution provides clear side-by-side comparison between local draft and server truth, with a dedicated "Refresh & Keep Latest" button that invalidates and refetches appropriate query keys.

### 1.4 Absolute Playwright Prohibition
- In strict adherence to CI/CD and container execution guidelines, **zero Playwright browser plugins or headless browser runners are invoked or configured**.
- All unit, integration, and end-to-end user journeys are verified deterministically via Vitest and Testing Library with mock Supabase Realtime channels and simulated JSDOM pointer/keyboard interactions.

### 1.5 Zero Hardcoded Secrets
- Tests and source files are strictly free of hardcoded credentials (`sb_secret_*`, raw JWTs, or persistent authentication tokens). Mock authentication leverages transient in-memory session stores (`useSessionStore`).

---

## 2. Test Tiers & Methodology

```
┌─────────────────────────────────────────────────────────────┐
│ Tier 4: Concurrency, Adversarial & Boundary Stress Suites   │
│ (Multi-tenant isolation, OCC race conditions, RBAC gates)   │
├─────────────────────────────────────────────────────────────┤
│ Tier 3: Component & User Workflow Integration Suites        │
│ (InvoiceDetailModal, DisbursementDetailDrawer, PhaseKanban) │
├─────────────────────────────────────────────────────────────┤
│ Tier 2: State Hooks, Realtime Sync & Mutation Protocols     │
│ (useBillingMutations, useDisbursements, useEntityRealtime)  │
├─────────────────────────────────────────────────────────────┤
│ Tier 1: Zod Schemas, Type Contracts & Currency Formatters   │
│ (RFC 7807 problem details, currency formatting, validation) │
└─────────────────────────────────────────────────────────────┘
```

### Tier 1: Domain Schemas, Formatter Contracts & Types
- Validates data boundary schemas across all modules:
  - `billing`: Invoice line items, tax computations, payment records.
  - `disbursements`: Voucher creation, rejection justification lengths (1–500 chars), release payments.
  - `operations`: Work requests, task checklists, phase transition gates.
  - `clients`, `documents`, `reports`, `transmittals`.
- Formatter fidelity: Currency rendering (`₱XX,XXX.XX`), date parsing, status badge variants.

### Tier 2: State Hooks, Mutations & Concurrency Guards
- `useBillingMutations.ts`:
  - `updateInvoiceAction` & `updateClientAddressAction` conditionally append `expectedVersion` when `strict_occ` is true.
  - Strips/omits `expectedVersion` when `strict_occ` is false for backwards compatibility.
- `useDisbursements.ts`:
  - Enforces `expectedVersion` across `useApproveDisbursement`, `useRejectDisbursement`, `useFundDisbursement`, and `useReleaseDisbursement`.
  - Supports both positional parameters and structured object parameter signatures.
  - Verifies cache rollback on mutation failure and cross-tab sync broadcast (`broadcastEntityChange`).

### Tier 3: Component Integration & Collaborative UI
- **`PresenceAvatars.tsx`**:
  - Universal domain routing across `'work_request'`, `'invoice'`, `'disbursement'`, `'document'`.
  - Channel name derivation: `presence:${domain}:${cleanRoomId}` (preserves pre-prefixed IDs).
  - Rapid room teardown and unmount cleanup.
  - Overflow badge rendering (`+N` more) when viewers exceed `maxAvatars`.
- **`ConflictResolutionModal.tsx`**:
  - RFC 7807 error detection via `isConcurrencyConflictError(err)` for status 409 and conflict codes.
  - Renders side-by-side local vs server diffs and attempted status.
  - "Refresh & Keep Latest" refetch triggers and cancel dismissal.
- **`InvoiceDetailModal.tsx`**:
  - Header presence avatars (`domain="invoice"`).
  - Intercepts 409 on address update, notes edit, status transition, archive, and delete.
  - Invalidates `billingKeys.invoiceDetail(effectiveId)` and `billingKeys.invoices()`.
- **`DisbursementDetailDrawer.tsx`**:
  - Header presence avatars (`domain="disbursement"`).
  - Intercepts 409 on approval, rejection, funding, and submission.
  - Invalidates `disbursementKeys.detail(id)` and `disbursementKeys.lists()`.
- **`PhaseKanbanBoard.tsx`**:
  - Header toolbar presence avatars beside work request dropdown.
  - Dynamic dropdown switching between work requests cleanly untracks previous channels, clears viewers, and subscribes to new room channels.

### Tier 4: Adversarial, Concurrency & Boundary Stress
- **Multi-Tenant Isolation**: ATA and LTA tenant barriers enforced with zero data leakage.
- **Role-Based Access Control (RBAC)**: Verification of permissions (`billing:edit`, `disbursement:approve`, `workflow:phase_transition`).
- **Network Outage & Recovery**: Handling of offline events, WebSocket reconnection, and cache hydration.

---

## 3. Milestone 4 Test Deliverables Inventory

| # | Test File Path | Tests | Scope & Key Behaviors Covered |
|---|----------------|-------|-------------------------------|
| 1 | `frontend/src/features/billing/__tests__/invoicePresenceAndOcc.test.tsx` | 12 | Ephemeral presence mounting (`domain="invoice"`); `expectedVersion` propagation in `updateInvoiceAction` & `updateClientAddressAction`; HTTP 409 interception dismissing `BlockingActionModal` and mounting `ConflictResolutionModal`; "Refresh & Keep Latest" query cache invalidation. |
| 2 | `frontend/src/features/disbursements/__tests__/disbursementPresenceAndOcc.test.tsx` | 15 | Ephemeral presence mounting (`domain="disbursement"`); `expectedVersion` parameter propagation in `useApproveDisbursement`, `useRejectDisbursement`, `useFundDisbursement`, `useReleaseDisbursement`; 409 conflict interception on approve/reject/fund/submit; cache invalidation of `disbursementKeys.detail(id)` and `disbursementKeys.lists()`. |
| 3 | `frontend/src/features/operations/__tests__/phaseKanban.test.tsx` | 11 | Phase board gating and column transitions; toolbar presence mounting; **Dynamic dropdown presence switching**: untracking previous channel, removing channel subscription, eager clearing of previous viewers, resubscribing to new work request channel, and zero-DB-write verification. |

---

## 4. Verification & Execution Guide

### 4.1 Prerequisites
- Node.js 18+ (tested on Node.js 20+).
- Dependencies installed in `frontend/`.

### 4.2 TypeScript Typecheck
Execute TypeScript project-reference compilation to ensure zero diagnostic errors:
```bash
cd frontend
npm run typecheck
```
*Expected Output*: Exit code 0, 0 diagnostic errors (`tsc -b`).

### 4.3 Running the Full Test Suite
Execute all automated test suites across the repository:
```bash
cd frontend
npm test
```
*Expected Output*:
- **Test Files**: 93 passed (93)
- **Tests**: 1,331 passed (1,331)
- **Duration**: ~23 seconds

### 4.4 Running Milestone 4 Specific Test Suites
To run only the test suites authored/enhanced for Milestone 4:
```bash
cd frontend
npx vitest run \
  src/features/billing/__tests__/invoicePresenceAndOcc.test.tsx \
  src/features/disbursements/__tests__/disbursementPresenceAndOcc.test.tsx \
  src/features/operations/__tests__/phaseKanban.test.tsx
```
*Expected Output*:
- **Test Files**: 3 passed (3)
- **Tests**: 38 passed (38)
- **Status**: 100% pass rate
