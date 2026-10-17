---
id: AGENT-DISPATCH
program: enterprise-migration
purpose: Copy-paste dispatch prompts for implementer agents
version: 1.0
date: 2026-10-03
---

# Agent Dispatch Prompts — Enterprise Migration Program

Usage: paste the **Master Dispatch Prompt** + one **Parcel Block** into a fresh implementer-agent session. One parcel per agent. Respect `00-INDEX.md` §3 dependency graph — never dispatch a parcel whose dependencies are unmerged.

Dispatch order: **P0-A + P1 immediately (parallel)** → P0-B, P0-C, P0-G → P0-D → P0-E, P0-F → P0-H → P2 modules in order → P3 is user-run (runbook, not an agent parcel).

---

## MASTER DISPATCH PROMPT (prepend to every parcel block)

```
You are an implementer agent on the ATA & LTA ERP (repo: /home/javvii/FreelanceProject/Project4_Final-Render).

MANDATORY READING, in order, before writing any code:
1. docs/AGENT_SYSTEM_PROMPT.md — house rules, stack, layout.
2. docs/enterprise-migration/00-INDEX.md — §2 Frozen Decisions and §5 Working Rules are BINDING. Do not reopen or improvise around a frozen decision; if you believe one is wrong, STOP and report it instead.
3. Your parcel spec, named in the PARCEL BLOCK below. Follow its 10-section grammar exactly: Mission → Ground Truth (verified facts — trust them, re-verify only if code drifted) → Contract (frozen interfaces) → Rules Rn → Acceptance Criteria → Tests Required → Non-Goals (violating a Non-Goal = failed parcel) → Working Constraints → Handoff.

EXECUTION RULES (summary of INDEX §5):
- Branch off `staging` with the exact branch name in the parcel block. PR targets `staging`. NEVER touch `main`. NEVER push. NEVER self-merge.
- TDD: implement the named tests in §6 of your spec; `npm test` and `npm run lint` must be green in backend before you open the PR.
- Do not modify erp_prototype/ (vanilla freeze) unless your spec explicitly says so.
- Any endpoint/schema you create or change → update docs/api-contracts/ in the same PR.
- End every commit message with: Co-Authored-By: Claude Code <noreply@anthropic.com>
- Ambiguity on a business rule = STOP and put the question in the PR description. Never guess.

DELIVERABLE — a PR with description containing:
1. Rule-by-rule verdicts (R1..Rn: how satisfied + test proving it)
2. Acceptance-criteria checklist with evidence (test names / command output)
3. Ground-truth verification notes (what the spec said vs. what you found — drift flagged)
4. Contract-doc updates list
5. Status-tracker update: flip your parcel's cell in docs/enterprise-migration/00-INDEX.md §4 to ✅ done (PR #…) as part of the PR

REPORT BACK in chat: one paragraph — what shipped, test counts (before/after), anything you stopped on.
```

---

## PARCEL BLOCKS

### P0-A (start NOW — everything depends on it)
```
PARCEL BLOCK: Your parcel is P0-A — docs/enterprise-migration/P0-A-permission-key-manifest.md
Branch: feat/p0-a-permission-keys
Dependencies: none — you are the foundation parcel. Prioritize review-ready speed.
Watch-outs: extension-not-rebuild (requirePermission and /me/permissions already exist); zero existing keys renamed; zero existing tests modified; paste the full role×key matrix into the PR description verbatim.
```

### P1 (start NOW — parallel workstream, different worktree)
```
PARCEL BLOCK: Your parcel is P1 — docs/enterprise-migration/P1-react-scaffold-design-system.md
Branch: feat/p1-react-scaffold in the enterprise-v2 WORKTREE (/home/javvii/FreelanceProject/ata-lta-erp-v2) — create the worktree/branch first if absent; PR targets the enterprise-v2 branch, NOT staging/main.
Watch-outs: zero module features (shell + design system only); port auth/apiClient semantics from erp_prototype/js/apiClient.js; extract design tokens from erp_prototype/css/ and list them in the PR; coordinate token table with the user before finalizing.
```

### P0-B (after P0-A merges)
```
PARCEL BLOCK: Your parcel is P0-B — docs/enterprise-migration/P0-B-notifications-module.md
Branch: feat/p0-b-notifications
Watch-outs: mirror modules/operationsRequests file layout; notify() must never throw into the request path; emitters are NOT wired here — P0-D/P0-G do that; verify actual users-table name in migrations before writing DDL.
```

### P0-C (after P0-A merges)
```
PARCEL BLOCK: Your parcel is P0-C — docs/enterprise-migration/P0-C-phase-migrations-backfill.md
Branch: feat/p0-c-phase-migrations
Watch-outs: NEVER run the backfill against staging/prod — it executes in P3 only; superset discipline — the currently-deployed API's test suite must pass against your migrated schema (prove it); Migration C (NOT NULL) is excluded from normal runs — header-comment it; verify real table/join-table names via grep of backend/migrations/ first.
```

### P0-G (after P0-A merges; small parcel — good parallel filler)
```
PARCEL BLOCK: Your parcel is P0-G — docs/enterprise-migration/P0-G-disbursement-billing-permissions.md
Branch: feat/p0-g-financial-permissions
Watch-outs: if approve/reject routes already exist with different semantics, extend + document reconciliation, do not create parallel routes; address edits must never write to the clients master record; wire the pending_request.resolved notification (P0-B may land mid-parcel — if notify() isn't merged yet, isolate the emit behind the helper import and note it in the PR).
```

### P0-D (after P0-A + P0-B + P0-C merge — the flagship)
```
PARCEL BLOCK: Your parcel is P0-D — docs/enterprise-migration/P0-D-operations-phase-routing-rework.md
Branch: feat/p0-d-phase-routing (stacked PRs allowed: 1 create-pipeline+tokenizer+idempotency, 2 guards+gates, 3 transition/QA/reroute+notifications)
Watch-outs: the spec exists to make three known production failure modes impossible — AC-1 reproduces each as a test; single transaction per creation-graph; legacy `status` writes CONTINUE alongside `phase` until cutover; do not resurrect code paths from the July uat fixes — build to the new contract.
```

### P0-E (after P0-A + P0-D)
```
PARCEL BLOCK: Your parcel is P0-E — docs/enterprise-migration/P0-E-retainer-templates-recurrence.md
Branch: feat/p0-e-retainer-templates
Watch-outs: generation MUST reuse P0-D's creation service (no fork/copy of creation logic — if import is impossible cleanly, STOP and report); recurrence is manual-only — no scheduler; do not seed production.
```

### P0-F (after P0-C)
```
PARCEL BLOCK: Your parcel is P0-F — docs/enterprise-migration/P0-F-time-entries.md
Branch: feat/p0-f-time-entries
Watch-outs: duration-canonical only — no timer/session logic; assignee-scope enforced at creation via the P0-C attribution columns; summary endpoint must be a single indexed query.
```

### P0-H (after all P0 parcels merge — the freeze gate)
```
PARCEL BLOCK: Your parcel is P0-H — docs/enterprise-migration/P0-H-contract-freeze.md
Branch: feat/p0-h-contract-freeze
Watch-outs: docs-from-code ONLY — transcribe from Zod schemas/route files, never from parcel specs; any code/spec discrepancy = STOP and escalate; the print-permission-matrix script gets a snapshot drift-alarm test.
```

### P2 module <N> (after P1 + P0-H; repeat per module in frozen order)
```
PARCEL BLOCK: Your parcel is P2 module <N>: <MODULE NAME> — docs/enterprise-migration/P2-module-migration-playbook.md (run the §3 playbook; your per-module spec is §4.<N>)
Branch: feat/p2-<module-name> in the enterprise-v2 worktree; PR targets enterprise-v2.
Watch-outs: contract <module>@2.0.0 is law — drift = STOP; no optimistic writes (blocking-flow doctrine); enable the module flag only after your Manual QA script is executed on the staging preview and pasted into the PR.
(Frozen order: 1 Operations → 2 Dashboard widgets → 3 Billing → 4 Disbursements → 5 Transmittals → 6 Admin/Users → 7 Reports+DMS)
```

---

## HARNESS APPENDIX — Running parcels in Antigravity (IDE or `agy` CLI)

Append this block after the PARCEL BLOCK when dispatching to Antigravity agents:

```
HARNESS APPENDIX (Antigravity):
- At task start, create a TASK ARTIFACT (markdown checklist, ArtifactType: "task")
  enumerating every Contract item (§3), every Rule Rn (§4), every AC (§5), and every
  named test (§6) from your parcel spec. Antigravity has no todo tool — this artifact
  IS your checklist. Keep it current; re-read it before each step as your source of
  truth for what remains.
- manage_task manages BACKGROUND PROCESSES (dev servers, watchers) only — never use
  it for planning or checklists.
- BEFORE writing code: produce an IMPLEMENTATION PLAN artifact whose first section
  reproduces the spec's Rules (Rn) and Non-Goals VERBATIM, followed by your step plan
  mapped rule-by-rule. Wait for my approval comment on the plan artifact before coding.
- AT COMPLETION: produce a WALKTHROUGH artifact mapping every Rn → evidence (test
  names + output; screenshots/recordings for UI work). Paste its summary into the PR
  description as the rule-verdicts and AC-evidence sections the spec demands.
- For UI parcels (P1, all P2 modules): use the browser subagent to execute the spec's
  Manual QA script against the running app and attach recordings to the walkthrough.
```

### Cross-harness coordination protocol

| Role | Owner |
| :--- | :--- |
| Spec authority, drift adjudication, status-tracker sign-off, PR review | Claude Code session (this one) |
| Parcel execution, plan/walkthrough artifacts, browser QA recordings | Antigravity implementer agents |
| Merge / push / deploy / any `main`-touching action / backfill runs | User only (P3 gates) |

- **The repo on disk is the single shared source of truth** — specs, dispatch prompts, and the status tracker are plain markdown any harness reads. (Reminder: `.git/info/exclude` hides `docs/*` from git; files are disk-visible now, `git add -f docs/enterprise-migration/` when you want them versioned.)
- **Parallel waves via Agent Manager:** run wave-by-wave per `00-INDEX.md` §3 — Wave 1 = P0-A + P1 simultaneously (P1 in the separate `ata-lta-erp-v2` worktree, so no disk collisions); Wave 2 = P0-B + P0-C + P0-G; Wave 3 = P0-D; Wave 4 = P0-E + P0-F; Wave 5 = P0-H; then P2 modules serially. Backend agents each get their own Antigravity workspace + their own `feat/` branch — merges serialize through PR review.
- **Drift/ambiguity escalations** come back as PR-description questions (per parcel rules); bring them to this session and the spec gets amended once, for all agents.
- **Antigravity plan-artifact approval is the human gate** that replaces pair-review during execution — never let an agent skip the verbatim Rules/Non-Goals echo; it is the drift detector.

---

## TEAMWORK INVOCATIONS — `/teamwork-preview` (Antigravity multi-agent teams)

Teamwork primer: Sentinel (coordination) → Project Orchestrator (milestones) → Explorers (read-only) → Workers (exclusive file-ownership tracks) → Critic / Challenger / Auditor / Success Auditor (gates). Phase 1 = scoping interview → approvable prompt artifact; Phase 2 = autonomous execution. Paid-plan gated feature.

**Constitution rules for every invocation below:**
- Scoping Phase-1 artifact must ECHO frozen decisions D1–D9 + each involved parcel's Rules/Non-Goals VERBATIM, mapped to tracks — approve it before Phase 2 code.
- `touches:` frontmatter = exclusive worker ownership maps.
- Integrity mode: `development`.
- Universal forbidden list: modify `erp_prototype/`; run `backfill-phases.js` against any remote DB; touch `main`; push; merge; email/websocket notification work.
- Handoff: one PR per parcel with rule-verdicts + AC evidence; Sentinel flips 00-INDEX §4 status cells in the same PRs; ambiguity = STOP + PR question.

### TW-1 — Wave 2 backend trio (first teamwork run; after P0-A merges)

```
/teamwork-preview Execute Wave 2 of the ATA-LTA ERP migration — three backend parcels in
parallel, exclusive file ownership. Repo: /home/javvii/FreelanceProject/Project4_Final-Render.

READ ORDER (all agents): docs/AGENT_SYSTEM_PROMPT.md → docs/enterprise-migration/00-INDEX.md
(§2 + §5 binding) → each Worker reads ONLY its parcel spec.

TRACKS (each = one Worker, own branch off `staging`, one PR):
- Worker-NOTIF → parcel P0-B (docs/enterprise-migration/P0-B-notifications-module.md),
  branch feat/p0-b-notifications. Owns: backend/src/modules/notifications/ (new),
  backend/src/services/notify.js, backend/src/modules/me/ (unread count only),
  backend/migrations/000037_*, backend/tests/notifications*.spec.js, notify.service*.spec.js.
- Worker-MIGRATE → parcel P0-C (P0-C-phase-migrations-backfill.md), branch
  feat/p0-c-phase-migrations. Owns: backend/migrations/000038_+*, backend/scripts/backfill-phases.js,
  backend/tests/migrations*.spec.js, backfill*.spec.js. NEVER runs the backfill remotely.
- Worker-FINPERM → parcel P0-G (P0-G-disbursement-billing-permissions.md), branch
  feat/p0-g-financial-permissions. Owns: backend/src/modules/disbursements/,
  backend/src/modules/billing/, backend/tests/disbursements.approval.spec.js,
  billing.address.spec.js. NOTE: if P0-B's notify() helper is unmerged when Worker-FINPERM
  reaches the emission step, isolate the import behind a local helper + TODO per its spec §8 —
  do not block on the other track.

GATES: Critic reviews each PR against §4 Rules. Challenger writes adversarial suites targeting
§5 ACs (disbursement status-forgery, cross-user notification access, double-backfill).
Auditor proves `npm test` + `npm run lint` genuinely green — no mocks, no skips. Success Auditor
executes each parcel's §5 checklist end-to-end before PRs open.
```

### TW-2 — P0-D flagship (after Wave 2 merges; single deep worker + heavy gates)

```
/teamwork-preview Execute parcel P0-D — docs/enterprise-migration/P0-D-operations-phase-routing-rework.md
(repo: /home/javvii/FreelanceProject/Project4_Final-Render, branch feat/p0-d-phase-routing off staging).

SINGLE WORKER TRACK (service/controller files overlap too heavily for safe parallel ownership);
stacked PRs are the parallelism: PR-1 create-pipeline+tokenizer+idempotency → PR-2 guards+gates →
PR-3 transition/QA/reroute+notification wiring.

CHALLENGER'S MANDATORY ADVERSARIAL LIST (from AC-1 — the three known production failure modes
must die as tests): dependency='"0"' → 400; kill-mid-transaction retry with same Idempotency-Key →
exactly one WR with identical task set; co-assignees persist in 201 + DB; PHASE_PREREQUISITE 409;
reroute reopens exactly the failed set. Auditor: full jest suite green, zero existing expectations
altered. Success Auditor: walk the §5 AC table in order, evidence each.
```

### TW-3 — P1 React scaffold (parallel-safe anytime; enterprise-v2 worktree)

```
/teamwork-preview Execute parcel P1 — docs/enterprise-migration/P1-react-scaffold-design-system.md.
Work in the enterprise-v2 worktree (/home/javvii/FreelanceProject/ata-lta-erp-v2, create if absent);
branches target enterprise-v2, never staging/main.

TWO DISJOINT WORKERS:
- Worker-SHELL: branch feat/p1-shell. Owns: router, auth flow, session store, usePermission hook,
  route guards, error boundary, notifications bell (reads /v1/me defensively).
- Worker-DESIGN: branch feat/p1-design. Owns: Tailwind tokens extracted from
  erp_prototype/css/ (list them in the PR — user sign-off gate), Shadcn themed primitives,
  src/routes/_kitchen-sink.tsx.
Merge order: DESIGN → SHELL (shell consumes tokens). Success Auditor boots the dev server on
port 8081 against the staging API and executes the AC-2/AC-3 scripts in the browser subagent,
attaching recordings to the walkthrough artifact.
```

(P2 modules: reuse the single-worker TW-2 shape per module, in frozen order. P3 remains human-run.)

---

## What NOT to dispatch

- P3 (cutover) is a **human-run runbook**, not an agent parcel — agents may assist individual steps under supervision inside the window.
- Anything touching `main`, pushing, deploying, or running `backfill-phases.js` against staging/prod — all reserved to the user / P3.
