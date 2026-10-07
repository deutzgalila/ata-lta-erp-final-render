# PR: Clients Module — Form Validation, Input Locks, Point of Contact & Affiliates Hardening

> **Source Branch:** `fix/clients-validation-and-relations`  
> **Target Branch:** `enterprise-v2`  
> **PR URL:** [Open Pull Request on GitHub](https://github.com/jevvii/ata-lta-erp-final-render/compare/enterprise-v2...fix/clients-validation-and-relations?expand=1)  
> **Status:** Ready for Review / Merge  
> **Verification Gates:** All 4 Gates Passed (Exit Code 0: Typecheck, Lint, Test, Build)  

---

## 1. Executive Summary & Deliverables

This pull request reviews and hardens the React frontend **Clients Module** (`frontend/src/features/clients` and `frontend/src/routes/clients.tsx`), implementing accurate Philippine BIR tax format compliance, strict input locks, registered user Point of Contact assignment, and robust affiliate selection.

| Area | Issue / Requirement | Implementation Details |
|---|---|---|
| **TIN Placeholder** | Placeholder was missing 2 branch digits (`000-000-000-000`) | Updated placeholder to the BIR 14-digit standard: `000-000-000-00000` (9 registration digits + 5 branch code digits, formatted to 17 characters). |
| **TIN Input Lock** | Unlimited character entry allowed | Implemented `formatTin()` with an input lock strictly capped at 14 numeric digits (formatted to 17 chars `###-###-###-#####`). Discards any further input once 14 digits are entered. Seamlessly handles backspaces across hyphens. |
| **RDO Code Lock** | Unconstrained RDO format and length | Implemented `formatRdoCode()` with an input lock capped at 4 characters (`maxLength={4}`), enforcing uppercase alphanumeric characters (e.g. `044`, `047`, `034A`). |
| **Contact Input Locks & Format** | Freeform text entry without type validation | Implemented channel-specific character restraints via `formatContactValue()`: Mobile locked at 11 digits (`09XXXXXXXXX`), Phone/Landline locked at 10 digits (`maxLength={10}`), Email validated against RFC email pattern, with dynamic placeholders and max lengths. |
| **Point of Contact Dropdown** | Raw text input for contact person | Replaced text input with a `<Select>` dropdown populated with registered users using `useRegisteredUsers()` (querying `/v1/admin/users` and `/v1/me/team`). Automatically synchronizes `contactUserId` (UUID) and `contactPerson` (name). Removed the redundant optional contact person text field. |
| **Related Companies Fix** | Adding affiliates caused unexpected server errors | Replaced raw UUID string inputs (`placeholder="Related Client UUID"`) with a `<Select>` dropdown of registered clients (`name (entity)`). Excludes current client (preventing self-reference) and disables already chosen affiliates (preventing unique constraint violation `23505`). Filters out unselected rows prior to payload dispatch. Formats affiliate names in `ClientDetailModal`. |
| **RBAC Preservation** | Maintain strict RBAC matrix | Preserved `clients:view` for directory browsing, search/filter, and detail inspection. Maintained `clients:edit` gating on New Client, Edit, Archive, and Restore mutations. |

---

## 2. File Ownership & Boundary Verification

The following files were modified or added:

```
frontend/src/features/clients/lib/formatters.ts                                (new)
frontend/src/features/clients/api/types.ts                                     (modified)
frontend/src/features/clients/api/useClients.ts                                (modified)
frontend/src/features/clients/components/ClientModal.tsx                       (modified)
frontend/src/features/clients/components/ClientDetailModal.tsx                 (modified)
frontend/src/features/clients/__tests__/formatters.test.ts                      (new)
frontend/src/features/clients/__tests__/clientsFormValidationAndAffiliates.test.tsx (new)
```

- **Backend Integrity**: ZERO backend files touched (`backend/` remains strictly frozen).
- **Attribution**: Commits are clean and free of unauthorized trailers.

---

## 3. Automated Verification Gates

All quality verification gates executed cleanly with exit code 0:

### 3.1 TypeScript Typecheck (`npm run typecheck`)
```bash
npm run typecheck
# tsc --noEmit
# Exit Code: 0 (0 errors)
```

### 3.2 ESLint Validation (`npm run lint`)
```bash
npm run lint
# eslint src
# Exit Code: 0 (0 errors, 0 warnings)
```

### 3.3 Vitest Test Suites (`npm test`)
```bash
npm test
# Test Files: 73 passed (73)
# Tests:      987 passed (987)
# Duration:   34.14s
# Exit Code: 0
```
- Includes 15 tests in `formatters.test.ts` verifying TIN, RDO, and contact details input locks and formatters.
- Includes 6 comprehensive UAT tests in `clientsFormValidationAndAffiliates.test.tsx` verifying TIN placeholder (`000-000-000-00000`), locks, POC dropdown, and affiliate picker.

### 3.4 Production Vite Build (`npm run build`)
```bash
npm run build
# tsc -b && vite build
# built in 7.65s
# Exit Code: 0
```
