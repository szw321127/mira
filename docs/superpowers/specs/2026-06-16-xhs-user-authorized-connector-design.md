# XHS User Authorized Connector Design

Date: 2026-06-16

## Purpose

The current `/xhs-analysis/research/outlines` flow does not match the intended
product direction. It treats Xiaohongshu research as an external content
provider problem and can fall back to low-confidence local outline generation
when no provider is configured.

The intended flow is:

1. The creator enters one idea.
2. RedNote derives Xiaohongshu search keywords from that idea.
3. RedNote uses the creator's own Xiaohongshu authorization to search relevant
   popular notes.
4. RedNote summarizes hooks, outline structures, angles, and tag patterns with
   the configured text model.
5. RedNote generates three editable outline candidates from the AI research
   summary.

This design follows `docs/xhs-connector-analysis.md`: build a separate
Xiaohongshu connector service instead of putting private Xiaohongshu protocol
code inside the NestJS backend.

## Confirmed MVP

The first version uses user-pasted Xiaohongshu PC Cookie authorization.

In scope:

- Add a separate `packages/xhs-connector` service.
- Use FastAPI for the connector service.
- Store a user's Xiaohongshu PC Cookie in encrypted form.
- Verify whether the Cookie is usable.
- Search Xiaohongshu notes by keyword through the user's Cookie.
- Normalize searched notes into a stable connector response shape.
- Update backend `/xhs-analysis/research/outlines` to use user authorization
  instead of `custom` / `tikhub` content provider lookup.
- Use the existing backend text model configuration to call an AI model for
  research summary and outline generation.
- Keep the creator-facing workflow as one idea -> three outlines.

Out of scope for this MVP:

- QR-code login.
- SMS login.
- Creator platform publishing.
- Proxy pools.
- Anti-risk bypass features.
- High-volume crawling.
- Full content library.
- Background task queue.
- User selection of individual searched notes before outline generation.

## Product Flow

### Authorization Flow

1. The user opens the creator workbench.
2. If no active Xiaohongshu authorization exists, the UI shows a compact
   authorization prompt near the outline generation area.
3. The user pastes a Xiaohongshu PC Cookie and confirms the compliance notice.
4. Backend sends the Cookie to the connector for validation.
5. If valid, backend stores the encrypted Cookie and displays the masked account
   status.
6. The user can delete the authorization at any time.

The UI must not show the full Cookie after submission. Error messages should
explain expiration or invalid authorization without exposing Cookie content.

### Research Outline Flow

1. User enters one idea.
2. User clicks the outline generation action.
3. Backend verifies the conversation belongs to the user.
4. Backend verifies the user has an active Xiaohongshu authorization.
5. Backend derives 3 to 5 keywords in quick mode.
6. Backend asks the connector to search notes for each keyword.
7. Backend deduplicates and trims samples.
8. Backend sends the samples plus idea to the configured text model.
9. AI returns a structured research summary and three outline candidates.
10. Backend validates the AI output shape.
11. Backend persists `XhsResearchRun`, `OutlineBatch`, and three `Outline` rows.
12. Frontend shows compact research evidence and editable outlines.

## Architecture

```text
web-frontend
  -> backend
    -> xhs authorization records
    -> text model config
    -> xhs-connector internal API
      -> encrypted Cookie runtime
      -> Xiaohongshu PC web requests
      -> normalizer
```

The backend owns product state, user ownership, AI prompting, and database
writes.

The connector owns Xiaohongshu-specific request signing, Cookie runtime checks,
search requests, request throttling, and raw payload normalization.

The frontend owns only the creator workflow and authorization input UI. It does
not know Xiaohongshu private request details.

## Connector Service

### Package

Create:

```text
packages/xhs-connector
```

Use Python FastAPI because the researched Xiaohongshu SDK path is Python-first
and relies on local JavaScript signing helpers.

The first implementation can use a local adapter boundary so the service can be
tested without live Xiaohongshu requests:

- `XhsCookieStore`
- `XhsPcApiAdapter`
- `XhsNoteNormalizer`
- `ConnectorAuth`

### Connector Internal Auth

Every backend-to-connector request includes:

```http
Authorization: Bearer <XHS_CONNECTOR_API_KEY>
```

This key is internal to our system. It is not a Xiaohongshu API key.

### Connector Endpoints

#### Health

```http
GET /health
```

Returns service status.

#### Validate Cookie

```http
POST /xhs/auth/validate
```

Request:

```json
{
  "cookie": "a1=...; web_session=...;",
  "userId": "backend-user-id"
}
```

Response:

```json
{
  "data": {
    "valid": true,
    "account": {
      "user_id": "xhs-user-id",
      "nickname": "nickname",
      "avatar": "https://..."
    },
    "expires_hint": null
  }
}
```

#### Search Notes

```http
POST /xhs/posts/search
```

Request:

```json
{
  "authorizationId": "backend-authorization-id",
  "cookie": "decrypted runtime cookie",
  "keyword": "通勤穿搭",
  "limit": 5,
  "sort": "popular"
}
```

The connector receives the decrypted Cookie only at runtime. It should not
persist it unless we later move Cookie storage fully into the connector.

Response:

```json
{
  "data": {
    "keyword": "通勤穿搭",
    "posts": [
      {
        "note_id": "xxx",
        "note_url": "https://www.xiaohongshu.com/explore/xxx",
        "title": "标题",
        "content": "正文",
        "author_id": "author-id",
        "author_name": "作者",
        "author_avatar": "https://...",
        "cover_url": "https://...",
        "image_urls": ["https://..."],
        "video_url": "",
        "likes": 1200,
        "collects": 800,
        "comments": 90,
        "shares": 50,
        "tags": ["通勤穿搭"],
        "raw": {}
      }
    ]
  }
}
```

## Backend Data Model

Add `XhsAuthorization`.

Fields:

- `id`
- `userId`
- `platform`: fixed `xhs`
- `subType`: fixed `pc` for this MVP
- `accountId`
- `accountName`
- `avatarUrl`
- `cookieEncrypted`
- `status`: `active | expired | invalid | deleted`
- `lastValidatedAt`
- `createdAt`
- `updatedAt`

Indexes:

- `@@index([userId, status, updatedAt])`
- Only one active PC authorization per user should be used by default. This can
  be enforced in service logic for SQLite compatibility.

Security:

- Use the same AES-256-GCM style already used for model and provider API keys.
- Never return `cookieEncrypted` to the frontend.
- Mask account status in responses.
- Delete marks records as `deleted` and clears active usage. This keeps the
  authorization lifecycle auditable while preventing future connector calls.

## Backend API

### Create / Replace Authorization

```http
POST /xhs-authorizations
```

Request:

```json
{
  "cookie": "a1=...; web_session=...;"
}
```

Behavior:

1. Require user JWT.
2. Trim and validate non-empty Cookie.
3. Call connector `/xhs/auth/validate`.
4. Encrypt and store Cookie if valid.
5. Mark prior active PC authorization inactive or replace it.
6. Return account status without Cookie.

### List Active Authorization

```http
GET /xhs-authorizations/current
```

Returns:

```json
{
  "id": "authorization-id",
  "status": "active",
  "accountName": "nickname",
  "accountId": "xhs-user-id",
  "lastValidatedAt": "2026-06-16T00:00:00.000Z"
}
```

Returns `null` in `data` if no authorization exists.

### Delete Authorization

```http
DELETE /xhs-authorizations/:id
```

Requires ownership. It marks the authorization as `deleted`; it does not return
or log Cookie material.

## `/xhs-analysis/research/outlines` Redesign

The endpoint remains:

```http
POST /xhs-analysis/research/outlines
```

Request remains:

```json
{
  "conversationId": "conversation-id",
  "idea": "给初入职场女生做低预算通勤穿搭",
  "mode": "quick"
}
```

New behavior:

1. Verify conversation ownership.
2. Find the current active `XhsAuthorization` for the user.
3. If missing, return a clear error: `请先授权小红书账号，再生成爆款研究大纲。`
4. Derive keywords from the idea.
5. Decrypt Cookie only for the connector request.
6. Call connector `/xhs/posts/search` for each keyword with controlled
   concurrency.
7. Normalize and deduplicate results in backend.
8. Call the configured text model to generate structured research output.
9. Validate the model response.
10. Persist `XhsResearchRun` and `OutlineBatch`.
11. Return `batch` and `research`.

The endpoint should not use `AdminContentProvidersService` for this flow.
TikHub and custom content providers can remain for older import endpoints.

## AI Generation Contract

Backend uses `AdminModelConfigsService` text runtime config.

Prompt inputs:

- User idea.
- Search mode.
- Keywords.
- Top normalized notes with title, content snippet, metrics, tags, and URL.

Expected JSON output:

```json
{
  "summary": {
    "hookPatterns": ["..."],
    "outlinePatterns": ["..."],
    "tagPatterns": ["..."],
    "contentAngles": ["..."],
    "avoidPatterns": ["..."],
    "standoutSamples": [
      {
        "sourceId": "note-id",
        "title": "标题",
        "matchedKeyword": "关键词",
        "interactionSummary": "赞藏评...",
        "matchReason": "为什么值得参考",
        "url": "https://..."
      }
    ]
  },
  "outlines": [
    {
      "title": "大纲标题",
      "label": "痛点切入",
      "tone": "story",
      "hook": "选择理由",
      "points": ["P1...", "P2...", "P3..."]
    }
  ],
  "warnings": []
}
```

Validation:

- Exactly three outlines if possible. If the model returns more, keep the first
  three. If fewer than three, fill missing outlines with deterministic fallback
  candidates based on the idea and summary.
- Each outline must have at least three points.
- Drop raw long content from the frontend response.
- Preserve source URLs only in compact sample summaries.

## Error Handling

Missing Cookie authorization:

- Return 400 with a clear action message.
- Frontend should show the authorization prompt.

Invalid or expired Cookie:

- Mark authorization `expired` or `invalid`.
- Return a message asking the user to reauthorize.

Connector unavailable:

- Return a connector unavailable error.
- Do not pretend research succeeded.

Some keyword searches fail:

- Continue if at least one keyword returns usable samples.
- Include warnings in `research.warnings`.

Zero usable samples:

- Return a low-confidence fallback only if connector calls succeeded but the
  platform returned empty results.
- The UI must label this as sample-insufficient, not research-backed.

AI model unavailable:

- Return model configuration or model request error.
- Do not silently use local rule-only outlines for this intended AI flow.

## Compliance And Safety

The product must communicate these limits:

- User provides authorization voluntarily.
- Authorization can be deleted.
- RedNote does not promise official Xiaohongshu API stability.
- RedNote will not provide proxy pools or bypass controls.
- Requests are rate limited.
- Cookies are encrypted and never displayed again.

Operational safeguards:

- Per-user request throttling.
- Connector request timeout.
- Keyword count cap.
- Sample count cap.
- No raw Cookie in logs.
- Mask auth headers in connector logs.

## Frontend Changes

Workbench additions:

- A compact Xiaohongshu authorization state near outline generation.
- Paste Cookie modal or panel.
- Delete authorization action.
- Reauthorization prompt when backend reports expired or invalid Cookie.

The main creation screen stays focused:

- Idea input.
- Generate outlines.
- Edit/select outline.
- Generate publish package.

It should not become a search-console UI.

## Testing

Backend tests:

- Missing authorization blocks `research/outlines`.
- Valid authorization calls connector search.
- Expired authorization marks status and returns reauthorization message.
- Partial keyword failure continues with warnings.
- Connector unavailable returns a clear error.
- AI output is shape validated.
- AI short outline result is filled to three outlines.
- Research run and outline batch are persisted in one transaction.

Connector tests:

- Internal API key is required.
- Cookie validation masks sensitive values in responses.
- Search normalizer maps raw notes into stable fields.
- Search endpoint rejects empty keyword.

Frontend tests:

- Workbench shows authorization prompt when missing.
- Workbench calls authorization API before research flow.
- Research generation does not expose manual reference import UI.
- Expired authorization surfaces reauthorize copy.

## Migration From Current Behavior

Current behavior:

- `research/outlines` chooses `custom` or `tikhub` content provider.
- Missing provider can produce fallback outlines.
- Outline generation is primarily local deterministic analysis.

New behavior:

- `research/outlines` requires user Xiaohongshu authorization.
- Search is handled by self-owned connector.
- Outline generation uses the configured text model.
- Fallback is only for empty successful search results, not missing auth or
  missing model.

This is an intentional product correction.

## Acceptance Criteria

- A user can paste a Xiaohongshu Cookie and see an active authorization status.
- With active authorization, entering an idea and clicking generate produces
  three editable outlines from connector search plus AI generation.
- Without authorization, the user gets a clear reauthorization prompt and no
  fake research output.
- Cookies are encrypted at rest and never returned to the frontend.
- `pnpm test` and `pnpm build` pass.
- The connector can be run locally from the monorepo.
