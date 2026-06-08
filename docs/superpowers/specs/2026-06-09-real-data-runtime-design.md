# Real Data Runtime Design

## Goal

Replace business-path mock data with persisted data and configured model providers:

- Admin project management reads and writes Prisma records instead of static arrays.
- Outline and post draft generation call the configured text model.
- Cover image generation calls the configured image model.
- Missing provider configuration returns a clear API error instead of falling back to mock output.

Tests may still use mocks for isolation. The `packages/agent` package should not be changed except for import/export surface additions if they become necessary.

## Current State

The project already persists users, conversations, outline batches, outlines, post drafts, saved drafts, snapshots, and admin model configs. The remaining business-path mock sources are:

- `packages/backend/src/admin-projects/admin-projects.service.ts`: hardcoded projects, tasks, notifications.
- `packages/backend/src/generation/generation.service.ts`: template-based outlines and post draft copy.
- `packages/backend/src/image-generation/mock-image.provider.ts`: local SVG data URL provider.
- `packages/web-frontend` and `packages/admin-frontend` consume backend APIs and should remain client-side shells around real backend data.

## Architecture

### Model Configuration Runtime

`AdminModelConfigsService` keeps the public list/save API but also exposes a runtime-only resolver:

```ts
getRuntimeConfig(type: 'text' | 'image'): Promise<{
  apiKey: string;
  baseUrl: string;
  modelName: string;
  type: 'text' | 'image';
}>;
```

The resolver decrypts `apiKeyEncrypted` server-side, validates `baseUrl`, `modelName`, and `apiKey`, and throws a `BadRequestException` with a user-facing message if the config is incomplete. The plaintext API key never leaves backend service code.

### Text Generation

`GenerationService` becomes asynchronous and uses an OpenAI-compatible chat-completions request:

- `POST {baseUrl}/chat/completions`
- `Authorization: Bearer {apiKey}`
- JSON mode requested in the prompt, with strict backend validation after parsing.

The service has two methods:

- `createOutlines(topic, batchNo)` returns exactly three outlines.
- `createPostDraft(topic, outline)` returns a publishable post draft with title, cover line, caption, sections, tags, and image prompt.

If the model returns malformed JSON, backend returns a clear error instead of silently manufacturing fallback content.

### Image Generation

`ImageGenerationService` uses an OpenAI-compatible image endpoint:

- `POST {baseUrl}/images/generations`
- `Authorization: Bearer {apiKey}`
- Body contains `model`, composed prompt, image size, and response format preference.

The response parser accepts either `b64_json` or `url`. Base64 data is returned as `data:image/png;base64,...`; URLs are passed through as-is. Provider is reported as the configured image model name.

### Admin Project Management

Add Prisma models:

- `AdminProject`: key, name, owner, status, priority, budget, dueDate, progress, team JSON, optional risk fields.
- `AdminTask`: key, project relation, name, assignee, dueDate, status.
- `AdminNotification`: title, description, createdAt.

`AdminProjectsService.getDashboard()` reads from Prisma, computes metrics from stored rows, and returns empty arrays/zero metrics when no data exists.

Add project creation so the admin UI can produce real records:

- `POST /admin/projects`
- Required: name, owner.
- Optional: key, status, priority, budget, dueDate, progress, team, risk fields.

The admin frontend's existing "新建项目" modal becomes a real form that calls the backend, refreshes dashboard data, and keeps the current Ant Design visual system.

## Error Handling

- All backend responses remain wrapped by the global `{ code, data, msg }` interceptor/filter.
- Missing text/image model config: `400` with "请先在后台配置文本模型。" or "请先在后台配置图片模型。"
- Provider HTTP failure: `400` with the provider's error message when available.
- Invalid model JSON: `400` with a message that the model response format is invalid.
- Admin project creation validation uses DTO rules and returns existing validation envelope messages.

## Testing

Backend tests:

- Runtime model config decrypts and validates complete configs without exposing plaintext in public views.
- Generation service sends text-model HTTP requests and parses valid JSON.
- Generation service rejects malformed model JSON.
- Image generation sends image-model HTTP requests and accepts `b64_json` and URL responses.
- Admin project dashboard returns metrics from Prisma data, and returns zeros for empty DB.
- Admin project creation creates a real Prisma row and appears in dashboard.

Frontend tests:

- Admin frontend exposes real project creation API and no longer treats project creation as a disabled placeholder.
- Admin frontend still loads model configs and avoids API key plaintext.
- Admin frontend avoids deprecated Ant Design props.

Manual verification:

- Configure text/image models in admin.
- Generate outlines and post draft from the workbench.
- Generate a cover image.
- Create a project in admin and see dashboard metrics update.

