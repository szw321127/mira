# XHS Reference Library Design

Date: 2026-06-10

## Purpose

Turn imported Xiaohongshu account and post references into durable
conversation assets. A creator should be able to import references, refresh the
page, reopen a history item, and keep using the same account positioning and
post signals for outline and publish-package generation.

## Scope

This increment is conversation-scoped. It does not add a global team material
library, search import, browser automation, signed Xiaohongshu requests, or
changes to existing files in `packages/agent`.

## Existing Ground

The backend already persists imports in `XhsReference` with:

- `conversationId`
- `kind`
- provider metadata
- source id and source url
- serialized `imported` normalization payload
- serialized `analysis` result

The web workbench already has a `referenceImport` state shape and renders
imported account/post signals. Today that state is restored mainly from
workspace snapshots, so the new backend records are not yet a reliable restore
source.

## Backend Design

Add protected reference APIs:

- `GET /conversations/:conversationId/xhs-references`
- `DELETE /xhs-references/:referenceId`

Both endpoints use the current authenticated user. Listing checks that the
conversation belongs to the user before returning references. Deleting checks
ownership through the reference's conversation before removing it.

The list response returns records sorted by newest first:

- `id`
- `conversationId`
- `kind`
- `providerType`
- `providerEndpoint`
- `sourceId`
- `sourceUrl`
- `title`
- parsed `imported`
- parsed `analysis`
- `createdAt`
- `updatedAt`

If a stored JSON payload is malformed, the service returns a bad request error
instead of silently dropping the record. This makes data corruption visible in
development and prevents generation from using partial references.

## Frontend Design

Add API methods:

- `api.xhs.listReferences(token, conversationId)`
- `api.xhs.deleteReference(token, referenceId)`

Map listed backend records back into the existing `ImportedXhsPostAnalysis` and
`ImportedXhsAccountAnalysis` shapes so the current importer and generation
pipeline can continue to consume one state type.

When a conversation is opened or restored, the workbench loads references from
the backend and merges them into `referenceImport`. Backend references are the
durable source; snapshot references remain useful while offline or before a
conversation has been created.

Removing a reference updates local state immediately and then calls the delete
endpoint when the reference has a backend id. If delete fails, the error is
shown in the existing status channel and the user can re-import or refresh.

## Generation Flow

Outline generation and publish-package generation continue to read from
`referenceImport`. Because restored backend references are mapped into that
state, no new generation endpoint is required in this increment.

This keeps the user flow intact:

1. Enter one idea.
2. Import account or post references.
3. Generate three outline candidates.
4. Edit/select an outline.
5. Generate a copy-ready image-text publish package.
6. Reopen the conversation later and keep the same references available.

## UI Behavior

The visible UI stays quiet and compact. The reference area keeps the current
account/post chips and remove buttons, with no new explanatory panel. Restored
references should look the same as newly imported references so users do not
need to understand storage mechanics.

Because this touches the workbench UI, run an `impeccable` review after
implementation.

## Testing

Backend:

- Service test for listing references owned by the current user.
- Service test for deleting a reference owned by the current user.
- Controller test for the protected list route shape.

Frontend:

- Workbench design/static test that reference list/delete API methods exist.
- Workbench design/static test that conversation restore loads backend
  references.
- Existing workbench tests must continue to pass.

Verification commands:

- `pnpm --filter @rednote/backend test -- xhs-analysis`
- `cd packages/backend && pnpm exec eslint src/xhs-analysis/**/*.ts`
- `pnpm --filter @rednote/backend build`
- `pnpm --filter @rednote/web-frontend test`
- `pnpm --filter @rednote/web-frontend lint`
- `pnpm --filter @rednote/web-frontend build`
- `git diff --check`
- `git diff --name-only packages/agent`

## Acceptance

- Imported references survive page refresh through backend records.
- Opening/restoring a conversation repopulates account and post reference
  signals from the backend.
- Removing a backend reference deletes it server-side and excludes it from later
  generation.
- Existing snapshot restore still works when no backend reference records are
  available.
- No existing file under `packages/agent` is modified.
