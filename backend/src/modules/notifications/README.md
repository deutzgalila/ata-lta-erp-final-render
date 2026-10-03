# Notifications Module

Owner: Worker-NOTIF (Parcel P0-B)  
Status: Wave 2 Complete

## Purpose

Provides persistence, queries, and read-state management for in-app notifications.

## Endpoints

| Method | Path | Guard | Description |
|---|---|---|---|
| GET | `/v1/notifications?limit=&cursor=` | `notifications:view` | List own notifications, newest first, cursor-paginated |
| POST | `/v1/notifications/read-all` | `notifications:view` | Mark all own unread notifications as read |
| POST | `/v1/notifications/:id/read` | `notifications:view` | Mark a specific notification as read (idempotent) |

## User Profile Integration

`GET /v1/me` includes `unread_notifications: <int>` reflecting the count of unread notifications for the authenticated user.

## Dispatch Service Helper

`backend/src/services/notify.js` provides `notify(userIds, type, payload)`:
- Supports the 4 frozen notification types:
  - `pending_request.resolved`
  - `wr.transition_request.received`
  - `wr.transition_request.resolved`
  - `wr.qa_reroute`
- Unknown types reject with HTTP 400 `AppError`.
- Database write errors are caught and logged, guaranteeing triggering business operations succeed.

## Rules Enforced

- **R1:** Strict user-scoping by `req.user.id`. Users can never query or mutate other users' notifications.
- **R2:** All 4 types pass CHECK constraints; unknown types reject with 400 `AppError`.
- **R3:** `notify()` DB failure does not fail the caller's business transaction.
- **R4:** Idempotent read-marking: multiple `POST /:id/read` calls return 200 without duplicate mutations.
- **R5:** In-app rows only (no email, websockets, SSE, or push).
