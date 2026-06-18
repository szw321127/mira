# XHS Commercial Product Handoff

Date: 2026-06-10

This file is an implementation handoff recorded under `packages/agent` because
the current constraint is to avoid modifying existing agent package content or
product-layer code.

## Current Boundary

Do not change existing `packages/agent` source or existing docs until the user
explicitly re-opens that boundary. Product-layer backend, web, and admin changes
are also not applied in this handoff. This document records the next required
work so the implementation can continue safely later.

## Agent Capabilities Already Available

The agent package now exposes a Xiaohongshu-oriented pure-function layer through
`@rednote/agent`:

- `normalizeXhsImportedPosts`
- `normalizeXhsImportedAccount`
- `analyzeXhsPost`
- `analyzeXhsAccount`
- `buildXhsGenerationBrief`
- `buildXhsOutlineCandidates`
- `buildXhsImageTextPublishPackage`
- `auditXhsImageTextPublishPackage`
- `buildXhsCommercialWorkflow`

These functions intentionally do not fetch Xiaohongshu content, sign requests,
scroll pages, bypass captcha, or automate publishing. They accept already
acquired/imported content and turn it into analysis, outline candidates, a
publish package, and an audit result.

## Current Product Code Observations

From the current workspace inspection:

- `packages/backend/src/generation/generation.service.ts` already generates
  exactly three outlines and a draft through configured text models.
- `packages/backend/src/conversations/conversations.service.ts` already
  persists outline batches, selected outlines, drafts, snapshots, and saved
  drafts.
- `packages/web-frontend/lib/api.ts` already has conversation, outline, and
  draft API client surfaces.
- `packages/web-frontend/app/workbench` already owns the user-facing creation
  workflow and autosave state.
- `packages/admin-frontend` and backend admin model config modules already
  manage model/provider configuration.

Gap: those product layers are not yet wired to the new agent Xiaohongshu
analysis workflow. Current generation can still produce prompt-like draft
content, while the agent workflow can produce a structured Xiaohongshu publish
package with pages, caption, tags, image prompts, and audit state.

## Recommended Backend Integration

Add a dedicated Xiaohongshu workflow module in backend when code changes are
allowed.

Recommended endpoints:

- `POST /xhs/outlines`
  - Input: `idea`, optional `audience`, optional analyzed `brief`.
  - Uses `buildXhsOutlineCandidates`.
  - Returns exactly three editable candidates in `{ code, data, msg }`.

- `POST /xhs/imports/posts/normalize`
  - Input: array of provider/browser/manual raw records.
  - Uses `normalizeXhsImportedPosts`.
  - Returns normalized posts, source records, and dropped records.

- `POST /xhs/imports/account/normalize`
  - Input: one imported account/profile raw record.
  - Uses `normalizeXhsImportedAccount`.
  - Returns normalized account, source records, and dropped records.

- `POST /xhs/workflows/commercial-draft`
  - Input: `idea`, `audience`, selected `outline`, optional account import,
    optional post imports, `pageCount`, and `tone`.
  - Uses `buildXhsCommercialWorkflow`.
  - Persists `publishPackage`, `audit`, `brief`, and normalized source metadata.

The backend should preserve the existing response envelope:

```json
{
  "code": 0,
  "data": {},
  "msg": "ok"
}
```

## Recommended Data Model Additions

When Prisma schema changes are allowed, add storage for structured publish
packages instead of forcing them into the existing draft fields.

Minimum persistent fields:

- selected outline candidate id and editable outline lines
- imported account source metadata
- imported post source metadata
- generation brief JSON
- publish package JSON
- audit JSON
- audit ready flag and score
- generated page list
- image prompt pack
- user edits after generation

The existing conversation snapshot system should include the full structured
publish package so restoring a conversation brings back the exact working state.

## Recommended Web Frontend Integration

When web changes are allowed, adjust the creator workbench flow:

1. User enters one idea.
2. UI calls `/xhs/outlines`.
3. UI shows three outline candidates and allows editing.
4. User selects one outline.
5. UI optionally accepts account/reference imports.
6. UI calls `/xhs/workflows/commercial-draft`.
7. UI renders publish package pages, caption, tags, image prompts, and audit
   status.
8. Copy/export controls operate on `publishPackage.copyBlocks`.

The final output screen should be a publish-ready Xiaohongshu image-text package,
not a model planning structure.

## Recommended Admin Integration

Admin should eventually configure content acquisition providers separately from
model providers:

- provider name
- provider type
- base URL
- multiple API keys
- active key policy
- rate limit
- compliance note
- enabled/disabled status

This should be separate from text/image model configuration because acquisition
providers have different risk, cost, and compliance characteristics.

## Audit And Repair Loop

Use the current audit output as the product quality gate:

1. Run `buildXhsCommercialWorkflow`.
2. If `workflow.audit.ready` is true, show copy/export actions.
3. If false, show `workflow.audit.repairActions`.
4. Later, when model repair is implemented, feed `repairActions`,
   `publishPackage`, and the selected outline into a repair prompt.
5. Re-run `auditXhsImageTextPublishPackage` after repair.

This avoids presenting incomplete or prompt-like output as publish-ready
content.

## Remaining Completion Criteria

The full objective is not complete until all of these are true:

- backend exposes real endpoints that use the agent workflow
- backend persists structured publish packages and audit state
- web frontend calls those endpoints instead of mock/local-only generation
- web frontend renders publish-ready pages, caption, tags, image prompts, and
  audit feedback
- admin can configure content acquisition providers and multiple API keys
- UI changes receive impeccable review
- backend, web, admin, and agent verification commands pass

