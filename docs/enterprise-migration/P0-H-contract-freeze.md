---
id: P0-H
phase: 0
depends_on: [P0-A, P0-B, P0-C, P0-D, P0-E, P0-F, P0-G]
touches: [docs/api-contracts/, docs/enterprise-migration/ (tracker + RBAC matrix)]
status: pending
---

# P0-H — Contract Freeze (Phase-0 Exit Gate)

## 1. Mission

Convert Phase-0's merged reality into **frozen contracts** that P2 module builds are gated against, and ceremonially close Phase 0. Done = every touched module has an up-to-date, version-stamped contract doc; the RBAC matrix is published as data; the INDEX tracker shows P0-A..G done; and a diff-audit proves docs match code.

## 2. Ground Truth

- `docs/api-contracts/` exists with `agent-a-contracts.md`, `agent-b-contracts.md` (agent-scoped, older lineage). This parcel introduces per-module files; keep old files untouched (history).
- Consuming audience: P2 frontend agents who will not read backend code. Contracts must be sufficient to build types + queries from docs alone.

## 3. Contract

### 3.1 Per-module contract files (create/refresh)

`docs/api-contracts/modules/<module>.md` for: `me, notifications, operations, operationsRequests, disbursements, billing, retainer-templates, time-entries` (+ refresh `clients, transmittals, documents, admin, reports` only if touched this phase).

Each module file header:

```yaml
---
module: operations
contract_version: 2.0.0
frozen_at: <date>
frozen_by: P0-H
base_url: /v1/<mount>
---
```

Body sections per endpoint: **Method+Path · Guards (permissions / entity scope) · Request schema (Zod-faithful field table) · Response schema · Error vocabulary (status + code + when) · Events emitted (notification types) · Since-version**.

### 3.2 RBAC matrix — `docs/api-contracts/rbac-matrix.md`

The full role ∪ department × key table rendered from `lib/permissions.js` **by script, not by hand**: add `backend/scripts/print-permission-matrix.js` that prints markdown from the live map; paste output into the doc with a regeneration note. Matrix doc includes wildcard semantics explanation for frontend consumers.

### 3.3 Version stamp

Contracts jump to `2.0.0` collectively (1.x = pre-phase-model). The stamp is what P2 agents cite in their PR descriptions ("built against operations@2.0.0").

## 4. Rules

- R1. **Docs-from-code, not docs-from-memory:** every request/response schema in the docs must be transcribed from the module's Zod `schema.js` / route file, not from the parcel specs. Discrepancy → code wins, fix doc; if code violates its parcel spec → stop and escalate.
- R2. Every endpoint emitting notification events lists them (type + payload) in its entry.
- R3. Error vocabulary is exhaustive: every documented 4xx/409 includes trigger conditions.
- R4. Diff-audit: enumerate all P0 PR diffs for route/schema changes; each maps to a contract-doc entry. PR description contains the mapping table.
- R5. INDEX status tracker (00-INDEX §4) updated to `✅` for P0-A..G in this PR.
- R6. Freeze is announced: INDEX gains "Phase 0 frozen at contract 2.0.0 on <date>" line.

## 5. Acceptance Criteria

- AC-1 (R1): spot-check 3 endpoints per touched module against Zod schemas — zero drift.
- AC-2 (R2,R3): operations module doc includes transition-request type, all four gates, all error codes (`PHASE_PREREQUISITE` et al.), all four notification events.
- AC-3: `node backend/scripts/print-permission-matrix.js` output == `rbac-matrix.md` table (re-run proves parity).
- AC-4 (R4): diff-audit table in PR covers 100% of P0 route/schema diffs.
- AC-5 (R5,R6): tracker + freeze line committed.

## 6. Tests Required

Not behavioral — but `print-permission-matrix.js` gets a snapshot test guarding the generated markdown against the live map (drift alarm).

## 7. Explicit Non-Goals

- ❌ No code behavior changes except the matrix-print script.
- ❌ No deletion of legacy `agent-a/b-contracts.md`.
- ❌ Do not freeze modules outside the touched set (they freeze when their P2 turn comes — incremental freeze doctrine).

## 8. Working Constraints

Branch `feat/p0-h-contract-freeze`. This is the Phase-0 gate: P2 Operations may start the moment this merges.

## 9. Handoff

Produces: the frozen surface every P2 build cites; the RBAC matrix the React `usePermission()` hook is validated against; program checkpoint for staging UAT demo to the client.

## 10. References

Vault master spec §2.2 (contract-freeze doctrine) · `docs/api-contracts/` legacy files · all P0 parcel specs.
