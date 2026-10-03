# Time Entries Module (Duration-Canonical)

Part of Enterprise Migration Wave 4 (Parcel P0-F).

## Overview

The Time Entries module provides duration-based time logging against assigned tasks for staff and administrators. Duration entries are canonical truth; any future timer UI merely materializes entries.

## Endpoints

| Method | Path | Guard | Description |
|---|---|---|---|
| `POST` | `/v1/time-entries` | `timelog:create` | Log a time entry on an assigned task (creator forced to `req.user.id`) |
| `GET` | `/v1/time-entries` | `timelog:view` | List time entries (scoped to user; Admin sees all / filters by `user_id`) |
| `PATCH` | `/v1/time-entries/:id` | `timelog:edit_own` / `timelog:edit_all` | Update entry (creator or Admin) |
| `DELETE` | `/v1/time-entries/:id` | `timelog:edit_own` / `timelog:edit_all` | Delete entry (creator or Admin) |
| `GET` | `/v1/time-entries/summary?date=` | `timelog:view` | Dashboard widget summary aggregating total minutes and grouping by task |

## Business Rules

1. **Rule R1**: Entry ownership is strictly enforced by `req.user.id`; client-supplied `user_id` is ignored.
2. **Rule R2**: Assignee scope is verified at creation against `task_assignees` (with fallback to `tasks.assignee_id`). Unassigned workers receive 403 Forbidden.
3. **Rule R3**: Future `entry_date` is rejected (400 Bad Request); `duration_minutes` must be between 1 and 1440 (400 Bad Request); multiple entries on the same day for the same task are permitted.
4. **Rule R4**: Modification and deletion are restricted to the creator, with Admin override (`timelog:edit_all`). Coworkers receive 403 Forbidden.
5. **Rule R5**: Summary endpoint performs a single indexed query over `idx_time_entries_user_date` returning daily total minutes and grouped task breakdown with work request linkage.
6. **Rule R6**: No notification events in v1.
