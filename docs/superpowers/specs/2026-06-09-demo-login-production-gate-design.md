# Demo Login Production Gate Design

## Goal

Prevent the fixed demo account from being available by default in production while keeping local development and demos convenient.

## Current State

The backend exposes `POST /auth/demo`. `AuthService.loginDemo()` upserts and signs in the fixed account `creator@rednote.local` with a known password. The web frontend has a "演示账号" button that calls this endpoint.

This is useful during local development, but a commercial production deployment should not expose a known shared account unless the operator explicitly opts in.

## Design

Add a backend-only gate inside `AuthService.loginDemo()`:

- Development and non-production environments keep demo login enabled by default.
- Production disables demo login by default.
- Production can opt in by setting `ENABLE_DEMO_LOGIN=true`.
- Disabled demo login throws `UnauthorizedException('Demo login is disabled.')`.

This iteration does not change the web UI. If a deployed frontend still shows the demo button while the backend is disabled, the existing API error flow displays the backend message. A future UI pass can hide the button behind a public env var and should use `impeccable` review.

## Environment Rules

Demo login is enabled when either condition is true:

- `NODE_ENV !== 'production'`
- `ENABLE_DEMO_LOGIN` is exactly `true` after trimming and lowercasing

All other production values, including unset, blank, `false`, `1`, and `yes`, disable demo login.

## Non-Goals

- No UI changes.
- No `packages/agent` changes.
- No database schema changes.
- No removal of the demo endpoint.
- No role or paid-plan system.

## Testing

Backend unit tests should prove:

- Demo login still works by default outside production.
- Production without `ENABLE_DEMO_LOGIN=true` rejects demo login.
- Production with `ENABLE_DEMO_LOGIN=true` allows demo login.

Verification should include the focused auth test and the workspace test/build gates.
