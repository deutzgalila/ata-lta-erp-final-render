# Baseline Verification (Brutalist UI Redesign)

Production frontend baseline `0c61395` (`brutalist-ui`), recorded 2026-10-19 before any redesign edits. Implementation is strictly confined to `frontend/` presentation; `erp_prototype/` and `backend/` are untouched.

| Command (`frontend/`) | Baseline Result |
|---|---|
| `npm ci --no-audit --no-fund` | Locked dependencies installed |
| `npm run typecheck` | PASS, exit 0 |
| `npm run build` | PASS, exit 0; existing >500kB chunk advisory |
| `npm test -- --maxWorkers=2` | PASS, 141 test files, 2,099 tests |
| `npm run lint` | 113 existing errors and 6 warnings |

The Swiss Industrial Brutalist redesign must preserve all 2,099 baseline tests, pass `typecheck` and `build` with exit code 0, and introduce 0 new lint errors or warnings.
