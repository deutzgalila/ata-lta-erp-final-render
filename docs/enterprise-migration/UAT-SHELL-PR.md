# UAT Fix Wave: Parcel SHELL (Shell, Dashboard, Documents & Flake Fix)

## Summary of Changes

### UAT-SH1: Login Password Visibility Toggle
- Added interactive eye / eye-off toggle icon button to password field in `frontend/src/routes/login.tsx` matching `erp_prototype` design.
- Includes `aria-label`, tooltip `title`, `tabIndex={-1}`, and `data-testid="password-toggle-btn"`.

### UAT-SH2: SPA Deep-Link Boot & Rewrite Rule
- Added Render static site rewrite rule `/* -> /index.html` to `render.yaml` so direct URL navigation and hard refresh on deep routes (e.g. `/operations`, `/dashboard`) resolve via client-side React Router.

### UAT-SH3: Styled Boot / Loading State
- Injected design-system styled loading skeleton/spinner directly inside `frontend/index.html#root` with `#f4f6fb` background, firm logo badge, and animated CSS shimmer loader, eliminating white/black flash before React hydration.

### UAT-SH4: Dashboard Pending Tasks Widget
- Implemented `PendingTasksCard.tsx` under `features/dashboard/components/` reading incomplete tasks assigned to the authenticated user via `operations@2.0.0` list semantics.
- Displays entity badge (`ATA` / `LTA`), work request title, task title, phase badge (`Pre-Processing` / `Processing`), and direct deep-link navigation button to `/operations?highlight={wrId}&tab=active`.
- Mounted directly into `frontend/src/routes/dashboard.tsx` above Log Time Widget.
- Added comprehensive unit tests in `dashboardWidgets.test.tsx` verifying assigned task filtering and empty state.

### UAT-SH5: Documents Design System Tokens Standardized
- Replaced off-palette/dark mode ad-hoc tokens (`zinc-*`, `gray-*`) with design-system standard `slate-*` tokens across `DocumentFilterBar.tsx`, `DocumentTable.tsx`, and `constants.ts`.

### UAT-SH6: Stabilized `disbursementsUI.test.tsx` Flake
- Isolated `useSessionStore` and safely mocked `global.fetch` within `disbursementsUI.test.tsx` to prevent cross-suite session state leakage and unmocked fallback to live staging network.
- Automated cleanup of `activeQueryClients` on teardown to eliminate in-flight query pollution across test files.
- Verified green across 3 consecutive full-suite test runs (56 test files, 755 tests).

---

## Verification Gates (Rule R10)

- `tsc --noEmit`: Exit code 0
- `npm run lint`: Exit code 0
- `npm test`: Exit code 0 (Run 1: 755/755, Run 2: 755/755, Run 3: 755/755 green)
- `npm run build`: Exit code 0

---

## Staging Manual QA

Tested on staging environment (`https://ata-lta-erp-spa-v2.onrender.com` / `localhost:8081`):
1. **UAT-SH1**: Visited `/login`, entered password, clicked eye toggle. Verified plaintext reveals and hides upon toggle.
2. **UAT-SH2**: Navigated directly to `/dashboard` and `/operations` via address bar; verified page boots without 404.
3. **UAT-SH3**: Performed hard reload (Ctrl+Shift+R); verified styled branding spinner renders immediately before React mounts.
4. **UAT-SH4**: Logged in as operations user with assigned tasks; verified Pending Tasks card lists only assigned tasks with appropriate entity and phase badges.
5. **UAT-SH5**: Visited `/documents`; verified slate design-system tokens match prototype aesthetic without off-palette dark classes.
