---
id: P3
phase: 3
depends_on: [P2]
touches: [render.yaml, Render dashboard (user action), production DB via migrate-remote.js, Cloudflare/Render domain settings (user action)]
status: pending
---

# P3 — Cutover Runbook (Rehearsed Atomic Window)

## 1. Mission

Move production to the new platform in **one rehearsed maintenance window**: prod DB migrations + backfill → prod API redeploy → domain flip to the React static site — with a 60-second rollback. Nothing in this runbook is improvised on the day; every step is verified on staging first.

## 2. Pre-Conditions (Go/No-Go Gates)

- ☐ P2 tracker: all 7 modules ✅ (per-module Manual QA scripts executed on v2 staging preview)
- ☐ Staging rehearsal (§4) completed end-to-end within the last 7 days
- ☐ Backfill dry-run report on a **prod-data copy** reviewed; `On Hold` ambiguous bucket (P0-C §3.3) resolved by Admin
- ☐ Client's new retainer template content signed off by Admin (P0-E R6 seed ready)
- ☐ Render service `ata-lta-erp-spa-v2` exists (created by user at P2 start per §3), healthy on its preview URL with `ERP_API_BASE_URL` pointing at **staging** API
- ☐ Maintenance window scheduled + communicated (template §7)
- ☐ Supabase prod backup/snapshot confirmed recent (see `render-deployment-direction` memory for backup procedure)

## 3. One-Time Infra Steps (user actions, before the window)

1. Render: create static site `ata-lta-erp-spa-v2` from `enterprise-v2` branch, rootDir `frontend`, buildCommand `npm run build`, publish dir `dist`, env `ERP_API_BASE_URL=https://ata-lta-erp-api-staging.onrender.com/v1` (dev value).
2. Verify preview URL serves the shell (login works against staging).
3. **Do not** attach any custom domain yet. No v2 API service exists — by design (D9).
4. Optional (any time): flip backend plan free→paid for dedicated capacity — not required by cutover.

## 4. Staging Rehearsal (mandatory, timed)

Execute on staging exactly as written and record durations:

| # | Step | Verify |
| :-: | :--- | :--- |
| R1 | `node scripts/migrate-remote.js staging` — apply P0-C migrations A+B | constraints list shows superset |
| R2 | `node backend/scripts/backfill-phases.js --env staging --dry-run` | report buckets sane |
| R3 | same with `--apply` | row counts match dry-run |
| R4 | Re-apply (idempotency proof) | 0 mutations |
| R5 | Apply Migration C (NOT NULL) | non-cancelled rows all have phase |
| R6 | Deploy `staging` branch API (auto via Render) | `/health` 200; smoke: login, WR create (both fill modes), transition round-trip, QA reroute, time entry, disbursement approval |
| R7 | Seed client retainer template (Admin-approved content) | generates WR with phase tasks |
| R8 | Full P2 Manual QA scripts against staging v2 preview | 100% pass |
| R9 | Rollback drill: point v2 site at... n/a (staging domain flip drill = flip Render custom domain between two staging static sites) | flip < 60s measured |

## 5. Production Cutover Window (the day)

| T+ | Step | Owner |
| :--- | :--- | :--- |
| 0:00 | Maintenance banner/comms posted (§7); confirm zero in-flight writes (quiet period agreed with client) | user |
| 0:05 | Supabase prod snapshot | user |
| 0:10 | `migrate-remote.js prod` (P0-C A+B; verify superset) | agent/user |
| 0:20 | `backfill-phases.js --env prod --dry-run` → user eyeballs report | both |
| 0:30 | `--apply` + idempotency re-run | both |
| 0:35 | Migration C (NOT NULL) | agent/user |
| 0:40 | Merge `staging → main` → prod API redeploys (new phase model live) | user (merge) |
| 0:50 | Smoke battery via curl against `api.ltabmcorp.com`: login, me (permissions present), create WR (pre-pro only + both phases), transition request + approve, qa-review, reroute, time entry, disbursement create→Pending, admin approve | agent |
| 1:00 | **Domain flip:** Render → `erp.ltabmcorp.com` custom domain moved `ata-lta-erp-spa-main` → `ata-lta-erp-spa-v2`; set v2 `ERP_API_BASE_URL=https://api.ltabmcorp.com/v1` | user |
| 1:05 | Human smoke: login as Admin + one staff; run §4-R6 smoke in the React UI | user |
| 1:20 | Go declaration **or** rollback (§6) | user |

## 6. Rollback Procedure (60-second path)

1. Render: move `erp.ltabmcorp.com` back to `ata-lta-erp-spa-main`. **Done for users.**
2. Prod API: if a defect is backend-side, redeploy previous `main` build — **superset constraints (P0-C) keep the old build runnable against the migrated schema**; `phase` columns remain harmlessly populated.
3. File incident note: defect, blast radius, decision (fix-forward vs. retry window).

## 7. Communications Template

> Scheduled maintenance — [date], [start]–[end] (PHT). The ERP will be unavailable while we upgrade to the new interface. All data is preserved; work requests will return with the new phase workflow (Pre-processing → Processing → QA → Completion), time logging, and notifications. If anything unexpected occurs, service reverts to the current system within minutes.

## 8. Post-Cutover Watch (48h)

- ☐ Error rate on prod API (Render logs) vs. baseline
- ☐ WR creation success rate (first real client WRs through the new pipeline)
- ☐ Notification fan-out spot-check (does the manager-notify flow reach admins?)
- ☐ Backfill spot-audit: 10 random legacy WRs show correct phase
- ☐ First transmittal PDF + first billing print-layout modal render in React

## 9. Explicitly Deferred (post-cutover backlog)

NestJS/Drizzle revisit (D2/D3) · email notification bolt-on · timer-UX v1.1 · time-entry CSV export · Resource Planning / Heatmap features (vault specs) · live multi-entity cross-billing.

## 10. References

Vault master spec (cutover choreography, D6/D9) · memory `render-deployment-direction` (backups, deploy procedure) · P0-C (migrations/backfill) · P2 §2 (readiness rows).
