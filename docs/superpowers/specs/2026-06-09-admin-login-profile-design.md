# Admin Login Profile Design

## Goal

Give the admin project management system a real login boundary, an initial administrator account, and a profile area where the administrator can update their display name and password.

## Current State

The admin frontend calls backend `/admin/*` APIs with an optional `VITE_ADMIN_API_KEY`. That exposes a deployment secret to browser code and does not give operators a normal login or account management flow. Creator-facing users already have JWT auth, but admin access needs a separate scope so creator accounts cannot enter the admin console.

## Design

Add an independent admin auth module:

- Add a Prisma `AdminUser` table with `account`, `displayName`, `passwordHash`, `lastLoginAt`, and timestamps.
- Bootstrap the first admin when no admin exists.
- Use `ADMIN_INITIAL_ACCOUNT` and `ADMIN_INITIAL_PASSWORD` when configured.
- In development, default to `admin / Rednote@123456`.
- In production, require `ADMIN_INITIAL_PASSWORD` if no admin exists.

Expose admin auth APIs:

- `POST /admin/auth/login`: validates password and returns an admin JWT plus public admin profile.
- `GET /admin/auth/me`: returns the current admin profile.
- `PATCH /admin/auth/profile`: updates `displayName`.
- `PATCH /admin/auth/password`: verifies the current password, then stores the new password hash.

Protect admin APIs with a scoped JWT guard:

- Read the Bearer token from `Authorization`.
- Accept only payloads with `scope: 'admin'`.
- Attach the admin identity to the request.
- Replace browser-facing admin controller guards with this admin JWT guard.

Update the admin frontend:

- Show a compact Ant Design login screen before the app shell.
- Store the admin token in local storage and send `Authorization: Bearer <token>`.
- Remove browser usage of `VITE_ADMIN_API_KEY`.
- Add a sidebar item named `管理员信息`.
- Add a profile page with display-name update, password change, and logout.

## Non-Goals

- No multi-admin invitation flow.
- No role matrix or fine-grained RBAC.
- No password reset email flow.
- No changes to creator-facing auth except shared implementation patterns.

## Error Handling

- Login and password failures return `UnauthorizedException`.
- Empty or too-short profile/password inputs are rejected by DTO validation.
- Frontend uses the existing API error helper for unified messages.
- A `401` from an authenticated admin request clears the local admin session.

## Testing

Backend:

- Initial admin bootstrap creates a hashed password.
- Login rejects wrong credentials and returns a token on success.
- `me`, profile update, and password change return public admin profiles.
- Admin JWT guard rejects missing, malformed, and non-admin-scope tokens.
- Admin controllers reference `AdminJwtAuthGuard`.

Frontend:

- API helper exposes admin login/profile/password functions.
- API helper sends Bearer token and does not reference `VITE_ADMIN_API_KEY`.
- App source contains login, logout, and administrator information UI.

Verification:

- Focused backend auth tests.
- Admin frontend static tests.
- Backend build after Prisma generation.
- Admin frontend build.
- Full workspace tests and build when practical.
