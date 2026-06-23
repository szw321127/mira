# Mira Image Agent Canvas Design

Date: 2026-06-23

## Goal

Add a dedicated image agent workspace to Mira that can generate images from text, keep generated assets on an infinite canvas, and support local image adjustments such as mask-based edits, prompt refinements, variations, and version comparison.

This document is a design proposal only. It does not implement the feature.

## Current Context

Mira currently has a text-first chat workspace:

- `packages/backend/src/agent/agent.controller.ts` exposes `POST /agent/chat` as an NDJSON streaming endpoint.
- `packages/backend/src/agent/agent.service.ts` builds a model, registry, and GPT harness, then streams normalized chat events.
- `packages/backend/src/agent/agent-runtime.ts` registers `web-search` and `fetch_url`.
- `packages/agent/src/herness/gpt.ts` provides `createGPTAgentHarness`, `ToolRegistry`, streaming loop integration, session context, and compaction.
- `packages/backend/prisma/schema.prisma` stores users, sessions, conversations, and text messages in PostgreSQL.
- `packages/web-frontend/src/app/agent-workspace/types.ts` models text chat events, not canvas objects or image tasks.

That shape is good for general conversation, but it is not enough for image work. A canvas needs durable assets, object positions, task state, image versions, edit masks, and progress events. Those should not be squeezed into `Message.events`.

## Product Decision

Build a separate `Mira Image Workspace`.

The text chat stays a general assistant surface. Image generation gets its own canvas workspace, its own backend module, and its own event protocol. The two can share login, admin-managed runtime secrets, model-provider infrastructure, and the agent harness pattern, but they should not share chat-specific persistence or rendering assumptions.

User-facing behavior:

- Users can create a new image workspace from Mira.
- The center of the page is an infinite canvas.
- The side panel is a compact prompt and task inspector.
- Generated images appear as movable canvas assets.
- Selecting an image exposes actions: edit, variation, upscale, remove background, compare, download, and delete.
- Local edits create a new version, leaving the original asset available.
- Agent/tool activity is shown as task progress near the canvas or inspector, not as raw tool output in the chat transcript.

## Recommended Approach

Use `tldraw` for the first production version of the infinite canvas, wrapped behind a local `ImageCanvasAdapter`.

Reasons:

- It is a React SDK designed around an infinite canvas, shapes, selection, transforms, viewport state, and persistence.
- It gives Mira the object model that image work needs: image shapes, frames, annotations, selection state, and asset references.
- It lowers the amount of custom canvas code needed for pan, zoom, hit testing, resize, multi-select, and keyboard behavior.

Keep the adapter boundary explicit:

```text
ImageWorkspace
  -> ImageCanvasAdapter
       -> TldrawImageCanvas
```

If license, bundle size, or low-level rendering requirements become a problem, the fallback is `React-Konva`. Konva is a good low-level canvas layer, but it makes Mira responsible for more of the infinite canvas behavior, shape model, selection, persistence, and editor ergonomics.

## Architecture

```text
Browser
  ImageWorkspace
    ImageCanvas
    PromptPanel
    TaskInspector
    AssetVersionPanel
       |
       | HTTP + NDJSON/SSE
       v
Backend
  ImageWorkspaceModule
    ImageWorkspaceController
    ImageTaskController
    ImageAssetController
    ImageAgentService
    ImageProviderService
    ImageStorageService
    ImageQueueService
       |
       +-- PostgreSQL: workspaces, canvas objects, assets, versions, tasks
       +-- Redis: queue, locks, progress pub/sub, transient task status
       +-- Object storage: original/generated/edited image binaries
       +-- Provider adapters: OpenAI first, other image providers later
```

The backend owns provider keys, task execution, asset persistence, cost tracking, and auth. The frontend owns interactive canvas state, optimistic task placeholders, selection, and user interaction.

## Frontend Workspace

Create a new feature area, separate from the existing chat workspace:

```text
packages/web-frontend/src/app/image-workspace/
  page.tsx
  components/
    ImageWorkspaceShell.tsx
    ImageCanvas.tsx
    PromptPanel.tsx
    TaskInspector.tsx
    AssetVersionPanel.tsx
    CanvasToolbar.tsx
  hooks/
    useImageWorkspace.ts
    useImageTaskStream.ts
    useCanvasPersistence.ts
  types.ts
```

The page should be a tool UI, not a landing page.

Desktop layout:

- Left: workspace list and search.
- Center: full-height infinite canvas.
- Right: prompt, selected asset controls, task details, and versions.
- Bottom or floating compact toolbar: pan, select, frame, mask, undo, redo, zoom, fit.

Mobile layout:

- Canvas remains the primary surface.
- Workspace list, prompt panel, and asset controls become drawers.
- Toolbar uses icon buttons with tooltips where the platform allows hover and accessible labels everywhere.

Rendering rules:

- Use Tailwind utilities and existing design tokens.
- Avoid custom CSS unless shared variables must be added to `globals.css`.
- Do not show raw tool calls or provider responses on the canvas or in the chat area.
- Show task progress as compact, user-readable states: queued, generating, editing, uploading, failed, complete.

## Backend Modules

Create `packages/backend/src/image-workspaces`:

```text
image-workspaces/
  image-workspaces.module.ts
  image-workspaces.controller.ts
  image-assets.controller.ts
  image-tasks.controller.ts
  image-agent.service.ts
  image-provider.service.ts
  image-storage.service.ts
  image-queue.service.ts
  image-workspaces.types.ts
```

Primary endpoints:

- `GET /image-workspaces`
- `POST /image-workspaces`
- `GET /image-workspaces/:id`
- `PATCH /image-workspaces/:id`
- `DELETE /image-workspaces/:id`
- `PATCH /image-workspaces/:id/canvas`
- `POST /image-workspaces/:id/tasks`
- `GET /image-workspaces/:id/tasks/:taskId/stream`
- `POST /image-assets/:assetId/edit`
- `POST /image-assets/:assetId/variations`
- `GET /image-assets/:assetId/download`
- `DELETE /image-assets/:assetId`

All endpoints require the public user session, not the admin session. Admin can configure providers and inspect aggregate usage, but cannot silently access user workspaces unless a future support/audit workflow explicitly adds that permission.

## Data Model

Add image-specific models instead of overloading `Conversation` and `Message`.

```prisma
enum ImageWorkspaceStatus {
  active
  archived
}

enum ImageTaskStatus {
  queued
  running
  complete
  failed
  canceled
}

enum ImageTaskType {
  generate
  edit
  variation
  upscale
  background_removal
}

model ImageWorkspace {
  id        String               @id @default(cuid())
  userId    String
  title     String
  status    ImageWorkspaceStatus @default(active)
  viewport  Json?
  createdAt DateTime             @default(now())
  updatedAt DateTime             @updatedAt
  deletedAt DateTime?
  user      User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  objects   CanvasObject[]
  assets    ImageAsset[]
  tasks     ImageTask[]

  @@index([userId, updatedAt])
  @@map("image_workspaces")
}

model CanvasObject {
  id          String         @id @default(cuid())
  workspaceId String
  assetId     String?
  type        String
  x           Float
  y           Float
  width       Float
  height      Float
  rotation    Float          @default(0)
  zIndex      Int            @default(0)
  props       Json           @default("{}")
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
  workspace   ImageWorkspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  asset       ImageAsset?    @relation(fields: [assetId], references: [id], onDelete: SetNull)

  @@index([workspaceId, zIndex])
  @@map("canvas_objects")
}

model ImageAsset {
  id          String         @id @default(cuid())
  workspaceId String
  userId      String
  currentId   String?
  title       String?
  prompt      String?
  metadata    Json           @default("{}")
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
  workspace   ImageWorkspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  versions    ImageVersion[]
  objects     CanvasObject[]

  @@index([workspaceId, updatedAt])
  @@index([userId, updatedAt])
  @@map("image_assets")
}

model ImageVersion {
  id          String     @id @default(cuid())
  assetId     String
  parentId    String?
  storageKey  String
  mimeType    String
  width       Int
  height      Int
  sizeBytes   Int
  prompt      String?
  editPrompt  String?
  maskKey     String?
  provider    String
  providerJob String?
  metadata    Json       @default("{}")
  createdAt   DateTime   @default(now())
  asset       ImageAsset @relation(fields: [assetId], references: [id], onDelete: Cascade)

  @@index([assetId, createdAt])
  @@map("image_versions")
}

model ImageTask {
  id          String          @id @default(cuid())
  workspaceId String
  userId      String
  type        ImageTaskType
  status      ImageTaskStatus @default(queued)
  input       Json
  output      Json?
  error       String?
  cost        Json?
  createdAt   DateTime        @default(now())
  startedAt   DateTime?
  finishedAt  DateTime?
  workspace   ImageWorkspace  @relation(fields: [workspaceId], references: [id], onDelete: Cascade)

  @@index([workspaceId, createdAt])
  @@index([userId, createdAt])
  @@index([status, createdAt])
  @@map("image_tasks")
}
```

Implementation detail to resolve before migration: Prisma cannot express all useful graph constraints for version lineage. If parent traversal becomes important in MVP, add explicit relation fields for `ImageVersion.parent` and test deletion behavior.

## Agent And Event Protocol

Create a new event type family for image tasks.

```ts
type ImageAgentEvent =
  | { type: "task-created"; taskId: string; taskType: ImageTaskType }
  | { type: "task-progress"; taskId: string; status: ImageTaskStatus; message: string }
  | { type: "asset-placeholder"; taskId: string; objectId: string; x: number; y: number }
  | { type: "asset-created"; taskId: string; assetId: string; versionId: string; objectId: string }
  | { type: "asset-version-created"; taskId: string; assetId: string; versionId: string }
  | { type: "canvas-updated"; workspaceId: string; objectIds: string[] }
  | { type: "usage"; taskId: string; provider: string; cost?: string }
  | { type: "error"; taskId?: string; message: string };
```

The image agent can still use the existing GPT harness pattern for planning and tool choice, but the stream sent to the image UI should be purpose-built. The UI should not need to understand generic tool-call or tool-result events.

Recommended split:

- `ImageAgentService` accepts the user prompt, selected asset ids, optional mask, workspace context, and target canvas placement.
- It may use `createGPTAgentHarness` for prompt expansion, intent classification, and multi-step planning.
- It calls image provider adapters through typed service methods, not through untyped chat tool output.
- It persists task and asset state before emitting events that the frontend relies on.

## Local Image Editing Flow

Partial image edits should be versioned and reversible.

Flow:

1. User selects an image on the canvas.
2. User chooses edit mode.
3. Frontend lets the user paint a mask or select a region.
4. Frontend uploads the mask as a temporary object-storage item.
5. Frontend sends `POST /image-assets/:assetId/edit` with `versionId`, `maskKey`, edit prompt, and desired output settings.
6. Backend creates an `ImageTask` with status `queued`.
7. Worker fetches the source version and mask, calls the provider adapter, stores the generated result, and creates a new `ImageVersion`.
8. Backend updates `ImageAsset.currentId` if the user chose "replace current"; otherwise it keeps the new version available in the version panel.
9. Frontend receives `asset-version-created` and updates the selected image preview.

Important product rule: never mutate the original image binary. Every edit creates a new version.

OpenAI image editing is prompt-guided. Masks are useful, but they should not be marketed as pixel-perfect local replacement. The UI should phrase this as "edit selected area" rather than "guaranteed exact mask fill".

## Provider Layer

Start with OpenAI, but keep the provider contract adapter-based.

```ts
type ImageGenerateInput = {
  prompt: string;
  size: "1024x1024" | "1024x1536" | "1536x1024" | "auto";
  quality?: "low" | "medium" | "high" | "auto";
  background?: "transparent" | "opaque" | "auto";
};

type ImageEditInput = {
  prompt: string;
  image: StoredImageRef;
  mask?: StoredImageRef;
  size?: ImageGenerateInput["size"];
};

interface ImageProviderAdapter {
  generate(input: ImageGenerateInput): Promise<ImageProviderResult>;
  edit(input: ImageEditInput): Promise<ImageProviderResult>;
  variations?(input: ImageVariationInput): Promise<ImageProviderResult>;
}
```

OpenAI can be used through the Images API or the Responses API. For Mira, prefer Responses API when the operation benefits from conversational context, multi-turn edits, or agent reasoning around the image. Use direct image endpoints for simple generate/edit calls where a typed service call is clearer.

Future providers can include Replicate, Stability, or a self-hosted ComfyUI workflow. They should implement the same adapter and return stored binary references plus metadata.

## Storage And Queueing

PostgreSQL should store metadata, not image binaries.

Use object storage for:

- Uploaded source images.
- Generated results.
- Edited versions.
- Masks.
- Thumbnails.

Provider choice:

- Local development: local filesystem or MinIO.
- Production in China: Alibaba Cloud OSS is the most natural match if deployment stays on Alibaba Cloud.
- Alternative production providers: S3-compatible storage or Tencent COS.

Use Redis for:

- Image task queue.
- Task locks.
- Short-lived progress state.
- Rate-limit counters.
- Pub/sub or stream fanout for task updates.

For the first version, a NestJS worker process can live in the backend image. If image tasks become heavy or scale separately from API traffic, split it into a dedicated `worker` service in `docker-compose.yml`.

## Admin Configuration

Do not put image provider keys in `.env`.

Extend the existing database-backed admin runtime settings with:

- `OPENAI_IMAGE_API_KEY`
- `OPENAI_IMAGE_MODEL`
- `IMAGE_PROVIDER`
- `IMAGE_STORAGE_PROVIDER`
- `IMAGE_STORAGE_BUCKET`
- `IMAGE_STORAGE_REGION`
- `IMAGE_STORAGE_ENDPOINT`
- `IMAGE_STORAGE_ACCESS_KEY`
- `IMAGE_STORAGE_SECRET_KEY`
- `IMAGE_MAX_DAILY_TASKS_PER_USER`
- `IMAGE_MAX_IMAGE_SIZE_MB`
- `IMAGE_DEFAULT_QUALITY`

The admin UI should mask sensitive values, validate required fields, and offer a "test image provider" action that runs a cheap validation request. Secret values should not be returned to public frontend routes.

## Security And Cost Controls

Minimum controls for MVP:

- Require login for all image workspace APIs.
- Enforce workspace ownership on every asset, canvas object, task, and download.
- Validate MIME type and size for uploads and generated downloads.
- Strip unsafe filenames and never expose raw storage keys directly to users.
- Use short-lived signed URLs for downloads and previews if object storage is private.
- Rate-limit task creation per user and per IP.
- Store provider request and response metadata without storing raw secrets.
- Track provider, model, size, quality, and cost per task.
- Add an admin kill switch for image generation.
- Show user-facing errors below the prompt/task area, since raw tool output is hidden.

## Implementation Phases

### Phase 1: Workspace Skeleton

- Add image workspace route and shell.
- Add tldraw-backed canvas adapter.
- Add workspace CRUD in backend.
- Persist canvas objects and viewport.
- No provider calls yet.

### Phase 2: Generate Images

- Add provider adapter and OpenAI generate support.
- Add object storage abstraction.
- Add image tasks and streaming progress.
- Place generated image assets on the canvas.
- Add admin runtime settings for image provider and storage.

### Phase 3: Local Edits And Versions

- Add mask drawing/upload.
- Add image edit endpoint.
- Add asset version panel.
- Add compare/revert behavior.
- Ensure edits never mutate originals.

### Phase 4: Production Hardening

- Move heavy work to a worker service if needed.
- Add task retry/cancel behavior.
- Add thumbnails and lazy loading.
- Add quota and cost dashboards.
- Add stronger moderation or policy checks if provider does not already cover the required use cases.

## Testing Strategy

Backend tests:

- Workspace endpoints require user sessions and enforce ownership.
- Canvas updates reject objects from another workspace.
- Task creation validates prompt, selected assets, mask ownership, and quotas.
- Provider adapter handles success, provider error, invalid response, and timeout.
- Storage service writes, reads, signs, and deletes image objects.
- Image edits create a new version and keep the original version intact.
- Failed tasks persist a safe user-facing error.

Frontend tests:

- Workspace shell renders desktop and mobile layouts.
- Canvas adapter maps backend objects to rendered image shapes.
- Prompt panel creates a task and renders progress.
- Asset selection shows version controls.
- Mask edit flow uploads a mask and starts an edit task.
- Hidden tool/provider details do not appear in the conversation area.

Manual verification:

- Generate an image, refresh, and confirm canvas state restores.
- Pan and zoom a large canvas with several images.
- Edit a selected region and compare versions.
- Delete an asset and confirm related canvas objects are removed or detached intentionally.
- Test missing provider config and quota exceeded states.

## Risks And Open Questions

- Canvas library fit: tldraw is the preferred default, but confirm license, bundle size, theming control, and persistence model before implementation.
- Provider behavior: image edit masks are provider-guided, not exact deterministic operations.
- Storage migration: local filesystem is fine for development, but production should start on object storage to avoid later data migration.
- Worker topology: API-only execution is simpler, but long image tasks may need a dedicated worker once traffic grows.
- Cost exposure: image generation can become expensive quickly. Quotas and admin visibility should ship with the first provider-backed release.
- Collaboration: this design is single-user. Multi-user realtime canvas editing is out of scope.

## References

- OpenAI image generation and editing guide: https://developers.openai.com/api/docs/guides/image-generation
- tldraw React SDK and infinite canvas documentation: https://tldraw.dev/
- Konva large canvas scrolling guidance: https://konvajs.org/docs/sandbox/Canvas_Scrolling.html

## Out Of Scope

- Implementing the feature in this change.
- Replacing the existing text chat workspace.
- Realtime multi-user collaboration.
- Public image gallery or sharing links.
- Billing and payment.
- Advanced layer-based editor features like Photoshop-compatible blend modes.
- Full ComfyUI workflow editor.

## Self-Review

- The design keeps image work separate from text chat persistence.
- The design reuses the existing agent harness pattern without exposing generic tool events to the UI.
- The design stores keys in admin-managed database settings, matching current Mira direction.
- The design stores image binaries outside PostgreSQL.
- The design includes local edit versioning, queueing, storage, cost controls, and test coverage.
