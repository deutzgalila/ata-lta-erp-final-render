---
id: P1
phase: 1
depends_on: []
touches: [enterprise-v2 worktree (frontend/ only) — NOT this repo's erp_prototype]
status: done
---

# P1 — React Scaffold + Design System (Parallel Workstream)

## 1. Mission

Stand up the enterprise-v2 frontend **shell**: Vite + React 19 + TypeScript (strict) + Tailwind + Shadcn + TanStack Query + Zustand + React Router, with auth flow, module-route skeleton, and the design system — **zero module features**. Runs in parallel with all of Phase 0 because it depends only on: login, `GET /v1/me` (baseline shape exists today; `permissions`/`unread_notifications` arrive via P0-A/P0-B and are consumed defensively with optional reads).

## 2. Ground Truth

- New code lives in the **`enterprise-v2` git worktree** (`/home/javvii/FreelanceProject/ata-lta-erp-v2`), frontend folder only. Do not create it inside the current repo tree.
- API contract baseline: `/v1` prefix; auth via existing `/v1/auth/*` routes; `GET /v1/me` returns `{ data: { user, … } }` (see `modules/me/routes.js`).
- Current vanilla visual identity lives in `erp_prototype/css/` — extract palette/type tokens from there so v2 reads as the same product (list extracted tokens in PR).
- Render static-site deploy uses build → `dist/`; env `ERP_API_BASE_URL` points at staging API during development.
- Local ports: current stack 8080/3000; v2 dev server **8081**.

## 3. Contract

### 3.1 Scaffold (frozen toolchain)

- Vite 6 + `react@19` + `typescript` strict (`noUncheckedIndexedAccess: true`).
- Tailwind CSS v4 + Shadcn UI (init; components added on demand).
- `@tanstack/react-query@5` — QueryClient: `staleTime 30s`, `retry: 1`, no cacheSharing surprises.
- `zustand@5` — session store only (user, permissions Set, entity selection, unread count).
- `react-router@7` — lazy per-module route chunks.
- ESLint + Prettier configs mirroring backend style; `npm run typecheck` script mandatory in CI-later.

### 3.2 Auth flow

- Login page → existing `/v1/auth/login` → session per current token mechanism (read `erp_prototype/js/apiClient.js` and port its semantics: header name, storage, refresh/401 handling); logout clears store + query cache.
- Route guard component: unauthenticated → `/login`; authenticated but missing required permission key → `<Forbidden/>` screen (never silent blank).

### 3.3 Shell

- App shell: sidebar (module nav, permission-filtered), topbar (entity switcher placeholder reading `/v1/me/team` semantics as today, **notification bell with unread badge reading `/v1/me` `unread_notifications`** — renders 0 today, lights up when P0-B lands), route outlet, error boundary, global 404.
- `usePermission(key)` hook reading the session store. This hook's contract is frozen here: `(key: string) => boolean`, wildcard-aware matching P0-A server semantics.
- Module placeholder pages: Operations, Billing, Disbursements, Transmittals, Documents, Reports, Admin, Dashboard — each a typed lazy route rendering `<ModulePlaceholder name/>`.

### 3.4 Design system

- Tailwind theme tokens extracted from vanilla CSS (colors, radius, spacing scale) — verbatim list committed at `frontend/src/styles/tokens.ts`.
- Shadcn primitives installed+themed: button, input, select, dialog, dropdown-menu, table, badge, toast, card, tabs, skeleton.
- One internal `frontend/src/routes/_kitchen-sink.tsx` (dev-only route `/dev/kitchen-sink`) rendering every themed primitive in both densities — design review artifact.

## 4. Rules

- R1. No business module features, no API writes beyond auth + `/me` reads. Placeholders only.
- R2. TypeScript strict; zero `any` in committed code (ESLint rule).
- R3. All routing permission-gated via `usePermission` against keys from P0-A's catalog (hardcode the catalog as a TS union type in `frontend/src/lib/permissions.ts` — regenerated from `rbac-matrix.md` at each P2 module start).
- R4. Build output ≤ reasonable budget: initial chunk < 250KB gzip (measure in CI-later; record in PR).
- R5. Feature-flag per module route: `const ENABLED_MODULES = [] as const` — P2 flips flags module-by-module; unfinished modules 404-cleanly to placeholder even if routed.
- R6. 401 handling: query-layer interceptor logs out + redirects; never leaves the app spinning.

## 5. Acceptance Criteria

- AC-1: `npm run build` green; `dist/` deployable as static site; dev server on 8081 against staging API.
- AC-2: login → shell renders with permission-filtered nav (verify as Admin vs HR user: nav differs); logout returns to login.
- AC-3: bell badge renders `unread_notifications` (0 acceptable pre-P0-B); forbidden route shows `<Forbidden/>`, not a crash.
- AC-4: kitchen-sink route renders all primitives; token list matches extracted vanilla values.
- AC-5 (R4,R5): chunk-size recorded; flag-off modules unreachable.

## 6. Tests Required

Vitest + Testing Library: `usePermission` wildcard parity tests against P0-A matrix cases · route-guard component tests · session-store unit tests. (Full E2E is P2/P3 territory.)

## 7. Explicit Non-Goals

- ❌ Any module feature work (that's P2).
- ❌ No SSR/meta-framework.
- ❌ No changes to this repo — the worktree only.
- ❌ No Render service creation (infra step is a user action at P2 start; spec'd in P3 §3).

## 8. Working Constraints

Branch `feat/p1-react-scaffold` in the **enterprise-v2 worktree**, PR targets `enterprise-v2` branch (not staging/main). Coordinate the token extraction table with the user before finalizing colors (design sign-off).

## 9. Handoff

Produces: the shell every P2 module plugs into; `usePermission` frozen hook; design tokens; ENABLED_MODULES flag mechanism; dev proxy config.

## 10. References

Vault master spec §2.1 · `erp_prototype/js/apiClient.js` + `erp_prototype/css/` (port sources) · P0-A (key catalog) · P0-B (bell data).
