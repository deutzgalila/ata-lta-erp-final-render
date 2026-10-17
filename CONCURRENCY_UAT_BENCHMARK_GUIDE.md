---
title: Concurrency, Persistence & Real-Time Sync Manual UAT Benchmark Guide (Post-Stage 5 Remediation)
date: 2026-10-09
project: ATA-LTA ERP v2
tags:
  - uat
  - testing
  - concurrency
  - realtime
  - supabase
  - benchmark
  - enterprise-v2
  - stage-5-remediation
status: active
---

# Concurrency, Persistence & Real-Time Sync Manual UAT Benchmark Guide
## ATA & LTA Accounting Firm ERP v2 (Post-Stage 5 Remediation)

---

## 1. Executive Summary & Purpose

Following the implementation of **Stages 1 through 5 (Parcels A through F + Remediation Parcels R1 through R4)**, the ERP features an end-to-end multi-tenant concurrency and synchronization engine:

1. **Strict Zero-Cache Network Transport (Parcel R1)**: All `/v1` operational API endpoints serve strict `no-store, no-cache, must-revalidate` headers, completely eliminating the 30-second browser disk cache collision that caused status updates in `"ALL"` to revert upon immediate page reload.
2. **Persistent Multi-Tenant Session State (Parcel R4)**: The active entity selection (`'ALL'`, `'ATA'`, or `'LTA'`) is now persisted in `localStorage` under `erp_active_entity`. Reloading or hard refreshing (`Ctrl + Shift + R`) preserves the user's selected entity view with 0 accidental resets back to `'ATA'`.
3. **Authoritative Real Supabase Client & Dynamic Config (Parcels R1 & R2)**: Real Supabase WebSocket connectivity is active on Render staging via dynamic runtime config (`GET /v1/config/public`) and environment fallbacks, replacing the previous `MockSupabaseClient`.
4. **Bi-Directional Tenant UUID Resolution (Parcel R2)**: PostgreSQL CDC payloads carrying raw entity UUIDs (`'e83dc90b...'` $\leftrightarrow$ `'ATA'`, `'16749820...'` $\leftrightarrow$ `'LTA'`) are mapped bidirectionally, completely resolving the Tenant Guard issue that previously dropped CDC events when filtered to `'ATA'` or `'LTA'`.
5. **Universal Root-Level Realtime & Kanban Mounting (Parcel R3)**: Realtime CDC subscriptions (`work_requests` and `tasks`) are mounted at the `OperationsPage` root level, and ephemeral presence avatars are mounted in **both** the `WorkRequestSidePeek` drawer and the `PhaseKanbanBoard` header.

This document provides the exact **step-by-step test scenarios, benchmark latencies, and pass/fail criteria** for manual User Acceptance Testing (UAT).

---

## 2. Performance & UX Benchmark Matrix

| Feature / Action | Pre-Remediation Behavior | Post-Stage 5 Target Benchmark | Target Latency | Pass / Fail Cue |
| :--- | :--- | :--- | :--- | :--- |
| **Admin Status Change in "ALL"** | Reverted to previous state on immediate reload; required entity switching | **Changes immediately on click; stays pinned; persists permanently across hard reload (`Ctrl+Shift+R`)** | **< 16ms** (instant 1 frame UI flip) | **PASS**: Stays on new status in "ALL" immediately upon reload. 0 reversion. |
| **Active Entity Filter on Reload** | Involuntarily reset back to `'ATA'` upon page reload | **Preserves selected entity (`'ALL'`, `'ATA'`, or `'LTA'`) across browser reloads** | Instant on mount | **PASS**: Selected entity pill and Topbar dropdown remain identical after reload. |
| **Dual-Tab Sync (Same User)** | Kanban board required manual reload or entity switching | **Both tabs (Table and Kanban Board) update automatically within < 50ms** via `BroadcastChannel` | **< 50ms** | **PASS**: Tab 2 flips live with 0 network HTTP requests. |
| **Multi-User Sync (Different Users)** | User B never received live updates; CDC ran on in-memory Mock | **User B receives live pushes directly from PostgreSQL WAL** via real Supabase WebSocket | **~200ms – 600ms** (WebSocket transit) | **PASS**: Row/badge/Kanban column updates without any manual refresh. |
| **OCC Conflict Interception** | Untested / silent overwrite | **Halted with HTTP 409; `ConflictResolutionModal` surfaces side-by-side comparison** | Immediate on API response | **PASS**: Dialog shows diff; "Refresh & Keep Latest" synchronizes confirmed state. |
| **SidePeek & Kanban Presence** | 0 Presence Avatars detected (running on mock client) | **Overlapping Notion-style avatar badges appear in SidePeek header & Kanban header** | **< 300ms** after colleague opens record | **PASS**: Avatar displays user initials & color; hover tooltip shows *"Viewing now: [Name] ([Role])"*. |
| **Idle Tab Re-focus** | Stale data remained indefinitely | **Silent background revalidation on window focus without UI flashing or layout shift** | Background network check | **PASS**: Data remains fresh without manual page refresh. |

---

## 3. Manual UAT Execution Scenarios

### Test Environment & Test Accounts
Open two browser windows side-by-side:
- **Window 1 (Normal Window, e.g. Chrome)**: Log in as **User A (System Administrator)**
  - Email: `lorein@ata-lta.ph`
  - Password: `Password@123`
  - URL: `https://ata-lta-erp-spa-v2.onrender.com/operations`
- **Window 2 (Incognito Window or Firefox / Brave)**: Log in as **User B (Accounting / Operations Staff)**
  - Email: `jen@ata-lta.ph` (Accounting) or `love@ata-lta.ph` (Manager)
  - Password: `Password@123`
  - URL: `https://ata-lta-erp-spa-v2.onrender.com/operations`

---

### 🧪 Scenario 1: Persistence in "ALL" & Hard Reload Resilience
*Objective: Verify that work request status updates made while in "ALL" entity view persist to PostgreSQL and never revert on page reload.*

1. In **Window 1** (Lorein Wong), ensure the active entity is set to **`ALL`** (check both Topbar dropdown and the Operations header pills: `ATA | LTA | ALL`).
2. Open any Work Request (e.g. `Test Document`).
3. In the status dropdown, change the status from `In Progress` to **`For Review`** (or **`For Billing`** / **`Completed`**).
4. **Observe**:
   - Toast notification appears: *"Work request status updated to 'For Review'"*.
   - Badge flips **instantly** without UI flicker.
5. Immediately press **`Ctrl + Shift + R`** (hard reload).
6. **Observe Post-Reload**:
   - The active entity filter **remains `ALL`** (does NOT reset to `ATA`).
   - The Work Request status **renders `For Review` immediately**.
   - It does **NOT** revert to `In Progress`.
7. Switch entity to `ATA`, then switch to `LTA`, then back to `ALL`:
   - Status remains confirmed as `For Review`.
   - **Manual intervention is NO LONGER needed.**

---

### 🧪 Scenario 2: Dual-Tab Local Sync in Kanban Board (Zero Network IPC)
*Objective: Verify that native `BroadcastChannel` synchronizes two tabs of the same user, including the 4-phase Kanban board view.*

1. In **Window 1**, open **Tab A** to `/operations?tab=work-requests&view=board` (Kanban Board view).
2. In **Window 1**, open **Tab B** to `/operations?tab=work-requests&view=board` (Kanban Board view).
3. In both tabs, select the same Work Request from the dropdown (e.g. `Test Document`).
4. In **Tab A**, quick-add a task to `#1 Pre-processing` or complete a task checklist item.
5. In **Tab A**, change the Work Request status.
6. **Observe**:
   - **Tab B's Kanban board updates within < 50ms** without any page reload.
   - The gate progress counter and status badges in Tab B reflect the new state immediately.
   - Open Chrome DevTools &rarr; Network tab in Tab B: **0 HTTP requests sent** (synchronized purely in-memory via `BroadcastChannel`).

---

### 🧪 Scenario 3: Real-Time Multi-User CDC Push (Cross-User WebSockets)
*Objective: Verify that PostgreSQL CDC pushes live changes across distinct logged-in users via Supabase WebSockets, with multi-tenant isolation working in ATA and LTA.*

1. In **Window 1** (User A: Lorein Wong), set active entity to **`ATA`**.
2. In **Window 2** (User B: Jen Andonga), set active entity to **`ATA`**.
3. In Window 1, select an ATA Work Request and update its status from `Received` to `In Progress`.
4. **Observe in Window 2**:
   - Within **~200ms – 500ms**, Window 2's list row and Kanban column update live to `In Progress`.
   - **Zero user interaction or page reload required in Window 2.**
5. Now, test Tenant Isolation:
   - In Window 2, switch active entity to **`LTA`**.
   - In Window 1, update an `ATA` Work Request.
   - **Observe**: Window 2 (in LTA) does **NOT** display or corrupt its cache with ATA data (Tenant Guard safely isolates events).
   - In Window 2, switch active entity back to **`ALL`**: the update is visible in the consolidated list.

---

### 🧪 Scenario 4: OCC Conflict Interception (RFC 7807 HTTP 409 & Resolution Modal)
*Objective: Verify that concurrent conflicting writes are intercepted and present the side-by-side comparison modal.*

```mermaid
sequenceDiagram
    autonumber
    actor Alice as User A (Window 1: Lorein)
    actor Bob as User B (Window 2: Jen)
    participant API as Backend (PostgreSQL)

    Note over Alice, Bob: Both Alice and Bob view the same Work Request (Version 4)
    Alice->>API: PUT status="Completed" (expectedVersion: 4)
    API-->>Alice: 200 OK (DB version advances to 5)
    Bob->>API: PUT status="On Hold" (expectedVersion: 4)
    API-->>Bob: 409 Conflict (CONCURRENCY_CONFLICT: current version is 5)
    Note over Bob: ConflictResolutionModal surfaces on Bob's screen
    Bob->>Bob: Clicks "Refresh & Keep Latest"
    Note over Bob: Local optimistic draft discarded; confirmed server version 5 rendered
```

1. In **Window 1** (User A) and **Window 2** (User B), open the exact same Work Request in the **SidePeek drawer**.
2. In Window 1, change the status to **`Completed`** (database version increments $v \to v+1$).
3. In Window 2 (simulating a concurrent edit before CDC refresh), quickly select **`On Hold`**.
4. **Observe in Window 2**:
   - The action is halted with **HTTP 409 Conflict**.
   - Bob's optimistic draft rolls back cleanly.
   - The **`ConflictResolutionModal`** automatically surfaces:
     - ⚠️ Out-of-sync banner: *"Record Out of Sync: Another user modified this record while you were editing."*
     - Side-by-side diff comparing User B's attempted status vs User A's confirmed server status (`Completed`).
     - Action button: **"Refresh & Keep Latest"**.
5. In Window 2, click **"Refresh & Keep Latest"**:
   - Modal dismisses.
   - SidePeek seamlessly updates with the authoritative `Completed` status.

---

### 🧪 Scenario 5: Ephemeral Presence Avatars in SidePeek & Kanban Header
*Objective: Verify Notion-style live collaboration awareness when colleagues view the same record.*

1. In **Window 1** (User A: Lorein Wong), click a Work Request to open the **SidePeek drawer**.
2. In **Window 2** (User B: Jen Andonga), open the **exact same Work Request** in SidePeek.
3. **Observe in Window 1 & Window 2**:
   - At the top-right header of the SidePeek (beside the Board/Edit/Close buttons), an overlapping circular avatar appears.
   - In Window 1, the avatar shows User B's initials (`JA`) with a distinct colored badge.
   - In Window 2, the avatar shows User A's initials (`LW`).
4. **Hover over the Avatar Badge**:
   - Tooltip displays:
     > **Viewing now: Jen Andonga (Accounting)**
5. In Window 2, click `X` or press `Esc` to close the SidePeek:
   - Within **~200ms**, Window 1's presence avatar disappears smoothly.
6. Open the Work Request in the **Kanban Board** (`view=board`):
   - Notice `<PresenceAvatars />` is mounted directly in the Kanban header beside the `Edit Work Request` button, showing live presence in Board view as well.
7. **0 rows written to database** (runs 100% in-memory over Supabase WebSocket Presence).

---

### 🧪 Scenario 6: Smart Window Focus & Reconnect Recovery
*Objective: Verify silent background re-synchronization when refocusing an idle browser tab.*

1. In **Window 1**, open a Work Request in Tab A.
2. Switch away from Window 1 to another app or tab for **45 seconds** (exceeding the 30-second TanStack `staleTime`).
3. In **Window 2**, update a task or add a note to that Work Request.
4. Click back to **Window 1** to focus the tab.
5. **Observe**:
   - Tab A automatically triggers a silent background refetch on window focus.
   - The updated data appears smoothly without skeleton loaders, flashing, or layout shift.

---

## 4. Browser DevTools Inspection Guide

Open DevTools (`F12`) to verify the underlying transport channels:

| DevTools Tab | Filter | Expected Observation |
| :--- | :--- | :--- |
| **Network &rarr; WS** | Filter: `realtime` | Exactly **1 active WebSocket connection** to `wss://tqtwkmozvhttvbdatrbc.supabase.co/realtime/v1/websocket`.<br>Frames tab shows heartbeats (`phx_heartbeat`) and presence messages. |
| **Network &rarr; Fetch/XHR** | Filter: `config/public` | `GET https://ata-lta-erp-api-staging.onrender.com/v1/config/public` returns `200 OK` with `{ supabaseUrl, supabaseAnonKey, entities }`. |
| **Network &rarr; Fetch/XHR** | Filter: `work-requests` | Response headers show `Cache-Control: no-store, no-cache, must-revalidate`. Zero disk caching. |
| **Application &rarr; Local Storage** | Key: `erp_active_entity` | Value matches current selection: `"ALL"`, `"ATA"`, or `"LTA"`. |
| **Console** | Filter: `[tabSync]` or `[realtime]` | Clean connection logs: `BroadcastChannel connected: ata_lta_erp_tab_sync`. Clean teardown on unmount. |

---

## 5. Emergency Diagnostic & Killswitch Commands

If WebSockets or cross-tab sync ever need to be bypassed for troubleshooting:

```javascript
// 1. Force REST Polling (Disables Realtime WebSockets):
localStorage.setItem('erp_feature_override_realtime_sync', 'false');
window.location.reload();

// 2. Disable Cross-Tab BroadcastChannel:
localStorage.setItem('erp_feature_override_tab_sync', 'false');
window.location.reload();

// 3. Restore Standard Realtime Architecture (Clear all overrides):
localStorage.removeItem('erp_feature_override_realtime_sync');
localStorage.removeItem('erp_feature_override_tab_sync');
window.location.reload();
```

---

## 6. UAT Execution Sign-Off Checklist

- [ ] **Scenario 1**: Status update in `"ALL"` persists across hard reload (`Ctrl+Shift+R`) with 0 reversion.
- [ ] **Scenario 1**: Active entity filter in Topbar and Operations header preserves selection on reload.
- [ ] **Scenario 2**: Dual-tab updates in Kanban board synchronize in < 50ms with 0 network HTTP requests.
- [ ] **Scenario 3**: Multi-user updates push live in < 500ms via Supabase WebSocket CDC.
- [ ] **Scenario 3**: Tenant isolation preserves entity privacy between `ATA` and `LTA` filters.
- [ ] **Scenario 4**: Concurrent conflicting edits trigger `ConflictResolutionModal` with side-by-side diff.
- [ ] **Scenario 5**: SidePeek and Kanban header display ephemeral presence avatars with hover tooltips.
- [ ] **Scenario 5**: Closing SidePeek removes presence avatar from colleague's screen within ~200ms.
- [ ] **Scenario 6**: Re-focusing an idle tab automatically revalidates without layout shift.
