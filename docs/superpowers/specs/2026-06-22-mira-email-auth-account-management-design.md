# Mira Email Auth And Account Management Design

## Goal

Add user login and registration to Mira using email verification codes, make the chat workspace require a signed-in user, persist conversations per user in PostgreSQL, and give the admin console a basic account management area.

## Confirmed Product Decisions

- Public users authenticate with an email verification code. The same flow logs in an existing user or creates a new user when the email has not been seen before.
- The chat workspace requires login. There is no anonymous production chat mode.
- Conversations are saved by `userId` in PostgreSQL. Browser `localStorage` becomes a legacy import/fallback path, not the source of truth.
- Admin can list, search, enable, and disable user accounts. User deletion is out of scope for this version to avoid accidental data loss.
- Email provider configuration is managed from the admin Key 管理 area and stored in the existing database-backed admin store, not in environment variables.

## Architecture

### Backend Modules

Create an `AuthModule` in `packages/backend/src/auth` with:

- `AuthController` for `/auth/code`, `/auth/login`, `/auth/session`, and `/auth/logout`.
- `AuthService` for email normalization, code generation, code verification, user creation, session creation, and logout.
- `EmailCodeService` for storing and validating one-time verification codes.
- `MailerService` for sending verification codes through SMTP settings read from the admin store.
- `UserSessionService` for issuing and validating httpOnly user sessions.

Add a `ConversationsModule` in `packages/backend/src/conversations` with:

- `ConversationsController` for listing, creating, renaming, deleting, and saving conversation messages for the current user.
- `ConversationsService` for enforcing user ownership and translating between Prisma records and the frontend conversation shape.

Keep admin authentication separate from public user authentication. Admin continues to use `mira_admin_session`; public users use a new `mira_user_session` cookie.

### Database Models

Add Prisma models:

- `User`: email, status, created time, updated time, last login time.
- `EmailVerificationCode`: hashed code, email, expiry, used time, attempt count, and request metadata.
- `UserSession`: session token hash, user relation, expiry, revoked time.
- `Conversation`: user relation, title, created time, updated time, soft-deleted time.
- `Message`: conversation relation, role, content, status, event JSON, created time.

Use soft deletion for conversations and disabled status for users. Do not hard delete users in the admin UI.

### User Auth Flow

1. User opens Mira.
2. Frontend calls `/api/auth/session`.
3. If there is no valid session, show the email login panel.
4. User submits an email to `/api/auth/code`.
5. Backend normalizes the email, rate-limits recent requests, stores a hashed six-digit code with a short expiry, and sends the code by SMTP.
6. User submits email plus code to `/api/auth/login`.
7. Backend validates the latest unused code, creates the user if needed, rejects disabled users, creates a session, sets `mira_user_session`, and returns the user profile.
8. Frontend loads conversations from `/api/conversations`.

Verification codes expire after 10 minutes. A code allows at most 5 failed attempts. Requests are throttled to one send per email per 60 seconds, five sends per email per hour, and twenty sends per IP per hour.

### Conversation Persistence

The backend becomes the source of truth for conversations:

- List conversations after login.
- Create a conversation on "new chat".
- Rename and delete through backend endpoints.
- Save user messages before agent streaming starts.
- Save assistant message content, status, and events after streaming finishes or fails.

For the first version, the frontend keeps optimistic local state while streaming and reconciles with the backend after a send completes. If the user has old `localStorage` conversations, the frontend imports them once after login and then marks them as migrated locally.

### Admin Account Management

Extend admin backend endpoints under `/admin/users`:

- `GET /admin/users?query=&status=&page=` returns paginated users.
- `PATCH /admin/users/:id/status` enables or disables a user.

The admin UI adds an "账号管理" panel separate from Key 管理:

- Search by email.
- Filter all/enabled/disabled.
- Show email, status, created time, last login time, and conversation count.
- Toggle enable/disable with a clear confirmation state.

Disabling a user prevents new logins and invalidates current user sessions by revoking matching `UserSession` rows.

### SMTP Configuration

Extend managed secrets with:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM`

Sensitive values are masked in admin UI like existing API keys. In development, if SMTP is not configured, the backend logs the verification code and returns success. In production, missing SMTP configuration returns a clear user-facing error before creating a usable code.

### Frontend Structure

Add modular frontend areas instead of expanding one file:

- `src/app/auth/*` for auth UI components and hooks.
- `src/app/api/auth/*` proxy routes.
- `src/app/api/conversations/*` proxy routes.
- `src/app/admin/*` split admin shell, password panel, secrets panel, and user management panel into focused files.
- `src/app/agent-workspace/*` updates the existing conversation hook to use backend persistence after auth.

Use Tailwind utility classes and existing CSS variables. Avoid custom CSS files unless a shared variable already exists in `globals.css`.

## Error Handling

- Invalid or expired verification code: show "验证码不正确或已过期".
- Disabled user: show "账号已被禁用，请联系管理员".
- SMTP not configured: show "邮件服务未配置，请联系管理员".
- Backend unavailable: keep the existing backend unavailable message style.
- Conversation save failure: show a compact warning but keep the current in-memory conversation visible until retry or refresh.

## Security

- Store verification codes and session tokens as hashes, never plaintext.
- Use httpOnly, SameSite=Lax cookies. Use `secure` cookies in production.
- Normalize emails before storage and enforce a unique email index.
- Do not expose SMTP password or code values through admin or public APIs.
- Rate-limit verification code sends per email and per IP using Redis when available, with database timestamps as a fallback.

## Testing

Backend tests:

- Email normalization and invalid email rejection.
- Code request stores a hashed code and enforces expiry.
- Login creates a user for a new email and updates `lastLoginAt`.
- Login rejects disabled users.
- Logout revokes the active session.
- Admin user list/search/status endpoints require admin session and revoke user sessions on disable.
- Conversation endpoints enforce ownership.

Frontend tests:

- Auth proxy forwards cookies and set-cookie headers.
- Login panel handles code request, login success, invalid code, and disabled user messages.
- Admin account management renders search/filter/status actions.
- Conversation storage no longer uses the global old `rednote.agent-workspace.v1` as the main source of truth after login.

Manual verification:

- Login/register from a clean browser.
- Refresh keeps the user signed in.
- Disable a user in admin, then verify the user cannot continue using chat.
- Create, rename, delete, and reload conversations.
- Existing local conversations import once after login.

## Out Of Scope

- Password-based public login.
- Social login.
- Hard deleting users.
- Organization/team accounts.
- Email templates beyond a plain verification code message.
- Billing, quotas, or per-user model key settings.
