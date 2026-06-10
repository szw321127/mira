# XHS Publish Repair Design

Date: 2026-06-10

## Purpose

Turn publish-package audit findings into an executable repair loop. When a
generated Xiaohongshu image-text package is not ready, the backend should use
the configured text model to rewrite the structured package, re-run the audit,
and return the repaired package to the workbench.

## Scope

This increment adds a single repair action for the current workbench package.
It does not change existing files in `packages/agent`, add multi-version draft
history, or build a full model-evaluation platform.

## Backend Design

Add a protected endpoint:

- `POST /xhs-analysis/workflows/repair-publish-package`

Request body:

- `idea`
- `publishPackage`
- optional `repairActions`

The service audits the submitted package first. If it is already ready, it
returns the original package with `repaired: false`. If it is not ready, it
calls the configured text model with a JSON-only prompt that includes the
current package, audit blockers, warnings, and repair actions.

The model must return a full `publishPackage` object. The backend validates the
minimum commercial contract:

- one or more title candidates
- four to seven pages
- every page has page number, role, headline, body, image prompt, and design
  notes
- caption
- hashtags
- image prompt pack matching the page count

The backend then rebuilds copy blocks from the repaired structure and re-runs
`auditXhsImageTextPublishPackage`. The response contains:

- `publishPackage`
- `audit`
- `summary`
- `repaired`

These fields intentionally mirror the current `XhsCommercialWorkflow` fields
that the frontend already maps into a post draft.

## Frontend Design

Keep the workbench layout compact. Store the last workflow audit in state. When
`audit.ready` is false and a post draft exists, show a small `修复发布包` action in
the editor action row. The button calls the repair endpoint with the current
publish package data from the last workflow.

On success:

- map the repaired publish package back into the visible post draft
- replace the stored audit
- clear stale state
- show whether the repaired package is ready or still has repair actions

On failure:

- keep the current draft visible
- show the existing status message error

## Testing

Backend:

- Service test that an unready package triggers the text model and returns a
  re-audited package.
- Controller test for the repair route metadata.

Frontend:

- Static test that the API method exists.
- Static test that the workbench tracks `publishAudit` and calls the repair
  endpoint.
- Existing workbench tests continue to pass.

## Acceptance

- A not-ready publish package can be repaired through the backend.
- The repaired package is audited before returning.
- The workbench offers a clear repair action only when the latest package is not
  ready.
- Existing ready-package generation still behaves as before.
- No existing file under `packages/agent` is modified.
