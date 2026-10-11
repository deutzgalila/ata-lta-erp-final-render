# Time logging audit — 2026-10-11

Scope: assignment creation/reassignment, canonical `/v1/time-entries` CRUD and summary, legacy operations `/time-logs`, task/checklist updates, task projections, and frontend discovery/forms/cache/timer (frontend changes delivered separately to enterprise-v2).

## Findings and fixes

- Task picker omitted `includeTasks=true` and stopped at 100 work requests. Frontend now requests embedded tasks and follows pagination.
- Picker fabricated a staging fixture and offered unassigned admin tasks rejected by the API. All creators now select actual assigned tasks; edit-all remains an administrative correction permission.
- Assignment aliases differed between views. Frontend now handles primary, co-assignee, and both join-table response aliases.
- Primary reassignment retained the former lead's join row. Explicit primary replacement now removes that stale authorization; explicit team edits retain the primary and supplied co-assignees.
- Time-entry routes resolved but did not enforce entity scope. List, summary, create, move, edit, and delete now enforce the selected entity through the parent work request. Deleted tasks/requests reject new entries.
- Legacy logging accepted another user's identity and unrelated checklist IDs. Logging now requires timelog:create plus assignment, forces caller attribution, and validates checklist ownership, date, hours, timestamps, and note length.
- Legacy hours were absent from canonical lists/summaries. Both stores are read with pagination, with legacy hours converted to minutes; legacy records retain their IDs and support owner/admin edits and deletes. Canonical entries also appear in operations task projections. No dual writes, backfill, or migration is required.
- Task snapshots could replace employee-owned time history. Embedded timeLogs are now read-only; writes use the dedicated logging endpoints.
- Checklist replacement could cascade-delete time logs. Retained checklist rows update in place; removed checklist rows first detach their logs to preserve task-level history.
- UTC/server-local dates could reject Manila's current date. Backend and frontend now use Asia/Manila, reject impossible dates and reversed date ranges, and validate integer-minute bounds.
- Frontend cache keys omitted viewer/entity. They now isolate both, without showing old entity rows during refetch. Personal dashboard rows and summaries explicitly target the same user.
- Timer counted interval ticks and could submit stale duration while running. It now derives elapsed time from timestamps and requires stopping before submission.

## Validation

- Backend full suite: 719 passed; 20 failures in three suites reproduced on unmodified origin/staging in a separate baseline worktree. Backfill and phase migration suites require local PostgreSQL; public-config test requires a configured Supabase anonymous key.
- Final focused backend run: 68 passed (time entries and operations integration); ESLint passed on changed backend modules/tests.
- Frontend: 126 tests passed across dashboard and task logging/scoping suites; TypeScript and production build passed.
- Regression coverage includes join/legacy assignment, reassignment, forged identities, entity isolation, deleted tasks, Manila midnight, impossible dates, legacy CRUD, combined totals, over-1000 entries, checklist preservation, canonical task projection, and picker pagination/cache isolation.

## Operational limits

No live staging database writes or authenticated browser smoke test were performed. Legacy records without a user/date or with zero hours remain untouched and are excluded from employee summaries because ownership cannot be established. Legacy numeric hours retain their existing two-decimal storage precision; displayed minutes are rounded. Identical work manually entered into both stores is counted twice because there is no reliable historical linkage for automatic deduplication. Checklist/assignment writes use multiple existing database calls rather than a transactional RPC; a database failure may leave a partial metadata change, but failures are surfaced rather than silently ignored.
