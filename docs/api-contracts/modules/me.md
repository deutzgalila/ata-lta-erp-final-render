---
module: me
contract_version: 2.0.0
frozen_at: 2026-10-04
frozen_by: P0-H
base_url: /v1/me
---

# /v1/me — User Profile & Session API Contract

## Overview
Provides the authenticated user's session profile, team visibility, unread notification counts, and effective RBAC permissions. Serves as the single round-trip bootstrap endpoint for frontend application startup.

---

## 1. `GET /v1/me`

Returns the current authenticated user's profile, active entity, unread notifications count, and resolved sorted permissions.

- **Guards:** Authenticated (`Authorization: Bearer <token>`), optional `X-Active-Entity`.
- **Since-version:** `2.0.0` (P0-A sorted permissions array embed, P0-B unread counter).
- **Events Emitted:** None.

### Request
No request body or query parameters.

### Response (200 OK)
```json
{
  "data": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "user@ata-lta.ph",
    "name": "Jane Doe",
    "role": "Manager",
    "departments": ["Management"],
    "entities": ["ATA", "LTA"],
    "activeEntity": "ATA",
    "avatarUrl": "https://...",
    "unread_notifications": 3,
    "permissions": [
      "approve_change:*",
      "billing:edit",
      "billing:view",
      "clients:view",
      "notifications:view",
      "retainers:use",
      "timelog:create",
      "timelog:edit_own",
      "timelog:view",
      "workflow:transition_request",
      "workflow:view"
    ]
  }
}
```

### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `401 Unauthorized` | `UNAUTHORIZED` | Missing, expired, or invalid JWT bearer token |
| `403 Forbidden` | `ACCOUNT_DISABLED` | User account has been deactivated by administrator |

---

## 2. `GET /v1/me/permissions`

Returns the array of effective permission strings for the user.

- **Guards:** Authenticated.
- **Since-version:** `1.0.0` (retained for backward compatibility).
- **Events Emitted:** None.

### Response (200 OK)
```json
{
  "data": [
    "clients:view",
    "workflow:view",
    "notifications:view"
  ]
}
```

---

## 3. `GET /v1/me/team`

Returns team members sharing department/entity assignments with the authenticated user.

- **Guards:** Authenticated.
- **Since-version:** `1.0.0`.
- **Events Emitted:** None.

### Response (200 OK)
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "John Smith",
      "email": "john@ata-lta.ph",
      "role": "Operations",
      "departments": ["Operations"]
    }
  ]
}
```

---

## 4. `PATCH /v1/me`

Updates the authenticated user's profile metadata.

- **Guards:** Authenticated.
- **Since-version:** `1.0.0`.
- **Events Emitted:** None.

### Request Body
| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `name` | string | No | User display name |
| `avatarUrl` | string | No | S3 avatar key or public URL |
| `preferences` | object | No | User UI preferences |

### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `400 Bad Request` | `BAD_REQUEST` | No updatable fields provided in request body |

---

## 5. `PATCH /v1/me/password`

Changes the user's account password.

- **Guards:** Authenticated.
- **Since-version:** `1.0.0`.
- **Events Emitted:** None.

### Request Body
| Field | Type | Required | Description |
| :--- | :--- | :---: | :--- |
| `currentPassword` | string | Yes | Existing password |
| `newPassword` | string | Yes | New password (minimum 8 characters) |

### Response (204 No Content)
Empty body.

### Error Vocabulary
| Status | Code | Trigger Condition |
| :--- | :--- | :--- |
| `400 Bad Request` | `BAD_REQUEST` | `currentPassword` and `newPassword` required, or `newPassword` < 8 characters, or `currentPassword` incorrect |

---

## 6. `POST /v1/me/avatar-upload-url`

Generates an S3 presigned URL for avatar upload.

- **Guards:** Authenticated.
- **Since-version:** `1.0.0`.
- **Events Emitted:** None.

### Response (200 OK)
```json
{
  "data": {
    "uploadUrl": "https://s3.amazonaws.com/...",
    "path": "avatars/123e4567-e89b-12d3-a456-426614174000.jpg"
  }
}
```
