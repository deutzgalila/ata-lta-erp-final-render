# Project: Stage 3 (Parcel E) Concurrency & Persistence Architecture

## Architecture
Stage 3 (Parcel E) introduces Supabase Realtime Change Data Capture (CDC) into the ATA/LTA ERP frontend.
The architecture consists of:
1. **Safe Singleton Supabase Client** (`src/lib/supabase.ts`):
   - Multiplexes all WebSocket channel subscriptions over a single instance.
   - Initialized with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
   - Safe mock fallback (`MockSupabaseClient`) with synchronous channel unregistration when credentials are empty/undefined so test runners, CI, and static builds never throw runtime exceptions.
2. **Generic Guarded CDC Hook** (`src/lib/realtime/useEntityRealtimeSync.ts`):
   - Guarded by `isFeatureEnabled('realtime_sync')`.
   - Subscribes to PostgreSQL changes on `public` schema for the specified table.
   - Module-level reference-counted multiplexer registry (`activeChannelRegistry`) prevents cross-component unmount collision while keeping canonical channel names `cdc_${table}`.
   - Enforces 3 safety guards:
     * Tenant Isolation Guard: Discards cross-tenant payloads when `activeEntity !== 'ALL'`. Handles null entity IDs, RFC 4122 case-insensitive UUID matching, and unassigned sessions. Unpartitioned tables (`tasks`) pass cleanly to parent relational filtering.
     * Stale Version Rejection Guard: Discards payloads where `payload.new.version <= localCachedVersion`.
     * Loop Prevention Guard: Discards payloads originated from current browser tab (`getTabId()` / local mutation registry with 10s TTL).
   - Patches TanStack Query detail cache (`queryClient.setQueryData`) and list caches (`queryClient.getQueriesData`), and invalidates count queries.
   - Clean teardown on unmount via reference count and `supabase.removeChannel`.
3. **Domain Component Mounts**:
   - `src/features/operations/components/WorkRequestList.tsx` (tables: `work_requests`, `tasks`).
   - `src/features/billing/components/InvoiceList.tsx` (table: `invoices`).
   - `src/features/disbursements/components/DisbursementsTable.tsx` (table: `disbursements`).
4. **Dedicated Verification Suite**:
   - `src/lib/realtime/__tests__/useEntityRealtimeSync.test.ts` exercising all 7 scenarios from R4.
   - Full regression verification (`npm test`, `npm run typecheck`, `npm run build`).

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Supabase SDK Dependency | Add `@supabase/supabase-js` to `frontend/package.json` | M1 | ORIGINAL_REQUEST R1 (DONE) |
| 2 | Safe Singleton Supabase Client | `src/lib/supabase.ts` exporting `supabase` singleton with safe mock fallback | M1 | ORIGINAL_REQUEST R1 (DONE) |
| 3 | Environment Variable Types | `src/vite-env.d.ts` typing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` | M1 | Survey 1, 3 (DONE) |
| 4 | Feature Flag Gating | `useEntityRealtimeSync` exits early when `isFeatureEnabled('realtime_sync')` is false | M1 | ORIGINAL_REQUEST R2 (DONE) |
| 5 | Tenant Isolation Guard | Discard cross-tenant CDC events when `activeEntity !== 'ALL'` | M1 | ORIGINAL_REQUEST R2 (DONE) |
| 6 | Stale Version Guard | Discard incoming events where `payload.new.version <= localCachedVersion` | M1 | ORIGINAL_REQUEST R2 (DONE) |
| 7 | Loop Prevention Guard | Discard CDC events originated by current browser tab | M1 | ORIGINAL_REQUEST R2 (DONE) |
| 8 | Query Cache Reconciliation | Patch TanStack Query detail and list caches via `queryClient.setQueryData` | M1 | ORIGINAL_REQUEST R2 (DONE) |
| 9 | Channel Lifecycle Teardown | Call `supabase.removeChannel` cleanly on hook unmount | M1 | ORIGINAL_REQUEST R2 (DONE) |
| 10 | Operations CDC Mount | Mount `useEntityRealtimeSync` on `WorkRequestList.tsx` for `work_requests` and `tasks` | M2 | ORIGINAL_REQUEST R3 (PLANNED) |
| 11 | Billing CDC Mount | Mount `useEntityRealtimeSync` on `InvoiceList.tsx` for `invoices` | M2 | ORIGINAL_REQUEST R3 (PLANNED) |
| 12 | Disbursements CDC Mount | Mount `useEntityRealtimeSync` on `DisbursementsTable.tsx` for `disbursements` | M2 | ORIGINAL_REQUEST R3 (PLANNED) |
| 13 | Dedicated Realtime Test Suite | Author `src/lib/realtime/__tests__/useEntityRealtimeSync.test.ts` (all 7 scenarios) | M2 | ORIGINAL_REQUEST R4 (PLANNED) |
| 14 | Zero Regression Verification | Pass `npm test` (all 87+ suites), `npm run typecheck`, and `npm run build` cleanly | M2 | ORIGINAL_REQUEST R5 (PLANNED) |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Core Realtime Infrastructure & Hook Engine | Features 1-9: `package.json`, `vite-env.d.ts`, `src/lib/supabase.ts`, `src/lib/realtime/useEntityRealtimeSync.ts`, `src/lib/realtime/index.ts` | Survey | DONE |
| M2 | Domain Mounts & Comprehensive Verification | Features 10-14: `WorkRequestList.tsx`, `InvoiceList.tsx`, `DisbursementsTable.tsx`, `useEntityRealtimeSync.test.ts`, full verification | M1 | IN_PROGRESS |

## Interface Contracts
### `src/lib/supabase.ts`
- `export const supabase: SupabaseClient`
- `export const isSupabaseConfigured: () => boolean`
- Safe mock client supports synchronous `removeChannel`, `removeAllChannels`, `getChannels()`.

### `src/lib/realtime/index.ts` (and `useEntityRealtimeSync.ts`)
- Hook signature:
  ```typescript
  export interface UseEntityRealtimeSyncOptions<T = any> {
    table: 'work_requests' | 'tasks' | 'invoices' | 'disbursements';
    detailQueryKey?: (id: string, record?: T) => readonly unknown[];
    listRootKey?: readonly unknown[];
    channelName?: string;
    filter?: string;
    activeEntity?: string | null;
    activeEntityUUID?: string;
    enabled?: boolean;
  }
  export function useEntityRealtimeSync<T = any>(options: UseEntityRealtimeSyncOptions<T>): void
  ```
- Defaults if optional keys omitted:
  - `work_requests`: detail key `operationsKeys.workRequestDetail(id)`, list root `operationsKeys.workRequests()`
  - `tasks`: detail key `(id, rec) => operationsKeys.taskDetail(rec?.work_request_id, id)`, list root `['operations', 'workRequests']`
  - `invoices`: detail key `billingKeys.invoiceDetail(id)`, list root `billingKeys.invoices()`
  - `disbursements`: detail key `disbursementKeys.detail(id)`, list root `disbursementKeys.lists()`

## Code Layout
- `frontend/package.json`: root frontend dependencies (`@supabase/supabase-js: ^2.110.2`)
- `frontend/src/vite-env.d.ts`: Vite environment typing (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
- `frontend/src/lib/supabase.ts`: Supabase singleton client and safe mock fallback
- `frontend/src/lib/realtime/useEntityRealtimeSync.ts`: Guarded CDC hook with reference-counted multiplexer
- `frontend/src/lib/realtime/loopPrevention.ts`: Local mutation tracking & tab origin detection
- `frontend/src/lib/realtime/index.ts`: Realtime barrel export
- `frontend/src/lib/realtime/__tests__/`: Realtime test suites (105+ tests)
- `frontend/src/features/operations/components/WorkRequestList.tsx`: Operations list mount
- `frontend/src/features/billing/components/InvoiceList.tsx`: Billing list mount
- `frontend/src/features/disbursements/components/DisbursementsTable.tsx`: Disbursements table mount
