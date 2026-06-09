# Publish-Ready Package And Admin Keyring Design

## Goal

Make the creator-facing publish package read like directly publishable RedNote content, and mature the admin surface with a clearer shell plus multi-key model configuration.

## Scope

This design covers three user requests:

- `web-frontend`: the publish package should not look like an AI prompt handoff. It should look like final copy a creator can publish.
- `admin-frontend`: move the literal "后台项目管理系统" identity into the document head, and make the sidebar collapsible to an icon-only navigation.
- Admin model configuration: each model type can store multiple API keys.

No `packages/agent` code changes are required.

## Creator Publish Package

The right-side post editor becomes a publishing surface:

- Primary heading remains `发布包`.
- A `最终笔记` section shows the actual title, caption, body paragraphs, and tags in publishing order.
- Editing controls remain available, but labels move from prompt/structure language to publishing language:
  - `正文结构` becomes `正文段落`.
  - `封面提示` moves into a `封面生成参数` disclosure.
- The copy action continues to call `getFullPostText(postDraft)`, which already returns title, body, sections, and hashtag-prefixed tags.

Backend generation prompt language should reinforce the same output contract:

- `sections` are publishable body paragraphs or image-text page copy.
- The model must not return outline notes or instructions for another AI step.

## Admin Shell

The browser tab title becomes `后台项目管理系统 | RedNote`.

The visible page header should avoid repeating that phrase as a large heading. It should show the current module, starting with `项目总览`.

The desktop sidebar supports collapse:

- Expanded: brand text and menu labels are visible.
- Collapsed: icon-only rail.
- Hover still reveals menu item purpose through Ant Design Menu title behavior.
- Mobile drawer behavior stays unchanged.

## Multi API Key Configuration

Model base URL and model name remain one config per model type (`text`, `image`).

API keys become a keyring per model type:

- Operators can add multiple API keys.
- Each key has a display name, masked preview, enabled state, and timestamps.
- Operators can enable/disable or delete keys.
- Runtime provider calls use the first enabled key for the model type.
- If no enabled key exists, runtime config fails with the existing clear model configuration error.

The database adds `AdminModelApiKey` instead of storing multiple keys inside JSON. Existing `AdminModelConfig.apiKeyEncrypted` stays for compatibility and migration. A migration copies old single keys into the new keyring as `默认 Key`.

## API Shape

Existing:

- `GET /admin/model-configs`
- `PUT /admin/model-configs/:type`
- `POST /admin/model-configs/:type/test`

New:

- `POST /admin/model-configs/:type/api-keys`
- `PATCH /admin/model-configs/:type/api-keys/:keyId`
- `DELETE /admin/model-configs/:type/api-keys/:keyId`

The list endpoint returns each model config with `apiKeys`.

## Testing

Backend:

- Service tests cover adding multiple keys, listing masked keys, runtime selection of first enabled key, disabled key rejection, and deletion.
- Generation tests assert prompt language asks for publishable content, not an AI handoff.

Admin frontend:

- Static design tests assert head title, collapsible sidebar, and multi-key API helpers/UI.

Web frontend:

- Static design tests assert the publish package has `最终笔记`, `正文段落`, `封面生成参数`, and no visible `正文结构`.

Verification:

- Focused backend/admin/web tests.
- Prisma generate/build.
- Full workspace test/build.
- Browser/impeccable review after UI changes.
