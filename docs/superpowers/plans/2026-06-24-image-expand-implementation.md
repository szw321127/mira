# Image Expand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add image expansion tasks to Mira so a selected image can be expanded freely, to a target ratio, or in a specific direction.

**Architecture:** Treat expansion as a first-class async image task named `expand`. The backend stores and processes it through the existing image task queue, using the image edit provider with an expanded source canvas plus mask. The frontend adds version-panel controls and a Leafer overlay that exports validated padding and target dimensions.

**Tech Stack:** NestJS, Prisma, PostgreSQL, Redis queue, Vercel AI SDK image provider, Next.js, React, Tailwind, Leafer.

---

## File Structure

- Modify `packages/backend/prisma/schema.prisma`
  - Adds `expand` to `ImageTaskType`.
- Create `packages/backend/prisma/migrations/<timestamp>_add_image_expand_task/migration.sql`
  - Adds the enum value in PostgreSQL.
- Modify `packages/backend/src/image-workspaces/image-workspaces.types.ts`
  - Extends task request parsing, task serialization, and public input sanitization.
- Modify `packages/backend/src/image-workspaces/image-task-events.ts`
  - Adds `expand` to queue payload type.
- Modify `packages/backend/src/image-workspaces/image-assets.controller.ts`
  - Adds `POST /image-assets/:assetId/expand`.
- Modify `packages/backend/src/image-workspaces/image-assets.service.ts`
  - Parses expansion request, validates dimensions, creates queued `expand` task.
- Modify `packages/backend/src/image-workspaces/image-worker.service.ts`
  - Processes `expand` tasks through edit provider using an expanded source canvas and mask.
- Create `packages/backend/src/image-workspaces/image-expand-canvas.ts`
  - Builds expanded source and mask PNG buffers from a source image.
- Modify backend specs:
  - `packages/backend/src/config/prisma-config.spec.ts`
  - `packages/backend/src/image-workspaces/image-workspaces.types.spec.ts`
  - `packages/backend/src/image-workspaces/image-assets.controller.spec.ts`
  - `packages/backend/src/image-workspaces/image-assets.service.spec.ts`
  - `packages/backend/src/image-workspaces/image-worker-edit.service.spec.ts`
- Modify frontend files:
  - `packages/web-frontend/src/app/image-workspace/types.ts`
  - `packages/web-frontend/src/app/image-workspace/workspace-api.ts`
  - `packages/web-frontend/src/app/image-workspace/use-image-workspace.ts`
  - `packages/web-frontend/src/app/image-workspace/use-image-task-stream.ts`
  - `packages/web-frontend/src/app/image-workspace/page.tsx`
  - `packages/web-frontend/src/app/image-workspace/image-workspace-shell.tsx`
  - `packages/web-frontend/src/app/image-workspace/leafer-canvas-types.ts`
  - `packages/web-frontend/src/app/image-workspace/leafer-canvas-adapter.ts`
  - `packages/web-frontend/src/app/image-workspace/components/asset-version-panel.tsx`
  - `packages/web-frontend/src/app/image-workspace/components/task-inspector.tsx`
  - `packages/web-frontend/src/app/api/image-assets/[assetId]/expand/route.ts`
  - `packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs`

---

## Task 1: Add Shared `expand` Task Type

**Files:**
- Modify: `packages/backend/prisma/schema.prisma`
- Create: `packages/backend/prisma/migrations/<timestamp>_add_image_expand_task/migration.sql`
- Modify: `packages/backend/src/config/prisma-config.spec.ts`
- Modify: `packages/backend/src/image-workspaces/image-task-events.ts`
- Modify: `packages/backend/src/image-workspaces/image-workspaces.types.ts`
- Modify: `packages/backend/src/image-workspaces/image-workspaces.types.spec.ts`
- Modify: `packages/web-frontend/src/app/image-workspace/types.ts`
- Modify: `packages/web-frontend/src/app/image-workspace/use-image-task-stream.ts`
- Modify: `packages/web-frontend/src/app/image-workspace/components/task-inspector.tsx`
- Modify: `packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs`

- [ ] **Step 1: Write failing backend type tests**

Add this test to `packages/backend/src/image-workspaces/image-workspaces.types.spec.ts`:

```ts
it("accepts valid image expand task requests", () => {
  expect(
    parseImageTaskRequest({
      type: "expand",
      prompt: "extend the street",
      assetId: "asset-1",
      versionId: "version-1",
      mode: "direction",
      direction: "right",
      percent: 0.25,
      padding: { left: 0, right: 256, top: 0, bottom: 0 },
      target: { width: 1280, height: 1024 },
      aspectRatio: "16:9"
    })
  ).toEqual({
    type: "expand",
    prompt: "extend the street",
    assetId: "asset-1",
    versionId: "version-1",
    mode: "direction",
    direction: "right",
    percent: 0.25,
    padding: { left: 0, right: 256, top: 0, bottom: 0 },
    target: { width: 1280, height: 1024 },
    aspectRatio: "16:9"
  });
});

it("rejects invalid image expand task payloads", () => {
  expect(
    parseImageTaskRequest({
      type: "expand",
      prompt: "extend",
      assetId: "asset-1",
      versionId: "version-1",
      mode: "free",
      padding: { left: 0, right: 0, top: 0, bottom: 0 },
      target: { width: 1024, height: 1024 }
    })
  ).toBeNull();

  expect(
    parseImageTaskRequest({
      type: "expand",
      prompt: "extend",
      assetId: "asset-1",
      versionId: "version-1",
      mode: "direction",
      direction: "diagonal",
      padding: { left: 0, right: 256, top: 0, bottom: 0 },
      target: { width: 1280, height: 1024 }
    })
  ).toBeNull();
});
```

Add an assertion to the existing Prisma schema test in `packages/backend/src/config/prisma-config.spec.ts`:

```ts
expect(schema).toContain("  expand");
```

- [ ] **Step 2: Write failing frontend source tests**

Add assertions to `packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs`:

```js
test("image workspace supports expand image tasks end to end", () => {
  const typesSource = readImageWorkspaceFile("types.ts");
  const apiSource = readImageWorkspaceFile("workspace-api.ts");
  const hookSource = readImageWorkspaceFile("use-image-workspace.ts");
  const streamSource = readImageWorkspaceFile("use-image-task-stream.ts");
  const taskSource = readImageWorkspaceFile("components/task-inspector.tsx");
  const routeSource = readFileSync(
    join(imageWorkspaceDir, "../api/image-assets/[assetId]/expand/route.ts"),
    "utf8",
  );

  assert.match(typesSource, /"expand"/);
  assert.match(apiSource, /createImageAssetExpandTask/);
  assert.match(apiSource, /\/api\/image-assets\/\$\{encodeURIComponent\(assetId\)\}\/expand/);
  assert.match(hookSource, /createImageAssetExpandTask/);
  assert.match(hookSource, /expandImageAsset/);
  assert.match(streamSource, /value === "expand"/);
  assert.match(taskSource, /expand: "扩展图片"/);
  assert.match(routeSource, /proxyBackendRequest/);
  assert.match(routeSource, /image-assets\/\$\{encodeURIComponent\(assetId\)\}\/expand/);
});
```

- [ ] **Step 3: Run tests to verify RED**

Run:

```bash
pnpm --filter @rednote/backend test -- image-workspaces.types.spec.ts prisma-config.spec.ts
node --test packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs
```

Expected:

- Backend fails because `expand` parsing/schema support does not exist.
- Frontend fails because the route/helper/hook/task label do not exist.

- [ ] **Step 4: Implement shared task type support**

Make these minimal changes:

In `packages/backend/prisma/schema.prisma`:

```prisma
enum ImageTaskType {
  generate
  edit
  variation
  upscale
  background_removal
  expand
}
```

Create a migration:

```sql
ALTER TYPE "ImageTaskType" ADD VALUE IF NOT EXISTS 'expand';
```

In backend unions, add `"expand"` wherever task types are enumerated:

```ts
type ImageTaskType =
  | "generate"
  | "edit"
  | "variation"
  | "upscale"
  | "background_removal"
  | "expand";
```

In `packages/backend/src/image-workspaces/image-workspaces.types.ts`, extend `ImageTaskRequest`:

```ts
export type ImageExpandMode = "free" | "ratio" | "direction";
export type ImageExpandDirection = "left" | "right" | "top" | "bottom" | "around";
export type ImageExpandPadding = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};
export type ImageExpandTarget = {
  width: number;
  height: number;
};
```

Add optional fields to `ImageTaskRequest`:

```ts
mode?: ImageExpandMode;
direction?: ImageExpandDirection;
percent?: number;
padding?: ImageExpandPadding;
expandTarget?: ImageExpandTarget;
```

Use `expandTarget` internally if `target` is already used for `{ x, y }`; when parsing public JSON, accept `target: { width, height }` only for `type === "expand"` and map it to `expandTarget`.

Add parser helpers:

```ts
function parseExpandMode(value: unknown): ImageExpandMode | null {
  return value === "free" || value === "ratio" || value === "direction" ? value : null;
}

function parseExpandDirection(value: unknown): ImageExpandDirection | null {
  return value === "left" ||
    value === "right" ||
    value === "top" ||
    value === "bottom" ||
    value === "around"
    ? value
    : null;
}

function parseExpandPadding(value: unknown): ImageExpandPadding | null {
  if (!isRecord(value)) return null;
  const left = parseNonNegativeInteger(value.left);
  const right = parseNonNegativeInteger(value.right);
  const top = parseNonNegativeInteger(value.top);
  const bottom = parseNonNegativeInteger(value.bottom);
  if (left === null || right === null || top === null || bottom === null) return null;
  if (left + right + top + bottom <= 0) return null;
  return { left, right, top, bottom };
}

function parseExpandTarget(value: unknown): ImageExpandTarget | null {
  if (!isRecord(value)) return null;
  const width = parsePositiveInteger(value.width);
  const height = parsePositiveInteger(value.height);
  return width && height ? { width, height } : null;
}

function parseNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function parsePositiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? value
    : null;
}
```

For `type === "expand"`, require `assetId`, `versionId`, `mode`, `padding`, and `expandTarget`.

In frontend `types.ts`, add `"expand"` to `ImageTask["type"]` and `ImageTaskEvent.taskType`.

In `use-image-task-stream.ts`, add:

```ts
value === "expand"
```

In `task-inspector.tsx`, add:

```ts
expand: "扩展图片"
```

- [ ] **Step 5: Run tests to verify GREEN**

Run:

```bash
pnpm --filter @rednote/backend test -- image-workspaces.types.spec.ts prisma-config.spec.ts
node --test packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs
```

Expected: Tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/prisma/schema.prisma packages/backend/prisma/migrations packages/backend/src/config/prisma-config.spec.ts packages/backend/src/image-workspaces/image-workspaces.types.ts packages/backend/src/image-workspaces/image-workspaces.types.spec.ts packages/backend/src/image-workspaces/image-task-events.ts packages/web-frontend/src/app/image-workspace/types.ts packages/web-frontend/src/app/image-workspace/use-image-task-stream.ts packages/web-frontend/src/app/image-workspace/components/task-inspector.tsx packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs
git commit -m "feat: add image expand task type"
```

---

## Task 2: Backend Expand API And Task Creation

**Files:**
- Modify: `packages/backend/src/image-workspaces/image-assets.controller.ts`
- Modify: `packages/backend/src/image-workspaces/image-assets.controller.spec.ts`
- Modify: `packages/backend/src/image-workspaces/image-assets.service.ts`
- Modify: `packages/backend/src/image-workspaces/image-assets.service.spec.ts`

- [ ] **Step 1: Write failing controller test**

Add to `image-assets.controller.spec.ts`:

```ts
it("creates expand tasks for the authenticated user with request IP", async () => {
  await expect(
    controller.expand(createRequest({ "x-forwarded-for": "203.0.113.12" }), "asset-1", {
      prompt: "extend right side",
      versionId: "version-1",
      mode: "direction",
      direction: "right",
      percent: 0.25,
      padding: { left: 0, right: 256, top: 0, bottom: 0 },
      target: { width: 1280, height: 1024 }
    })
  ).resolves.toEqual({ task: { id: "task-expand" } });

  expect(assets.createExpandTask).toHaveBeenCalledWith(
    "user-1",
    "asset-1",
    {
      prompt: "extend right side",
      versionId: "version-1",
      mode: "direction",
      direction: "right",
      percent: 0.25,
      padding: { left: 0, right: 256, top: 0, bottom: 0 },
      target: { width: 1280, height: 1024 }
    },
    "203.0.113.12"
  );
});
```

Update the mock service shape with:

```ts
createExpandTask: jest.fn(() => Promise.resolve({ task: { id: "task-expand" } })),
```

- [ ] **Step 2: Write failing service tests**

Add to `image-assets.service.spec.ts`:

```ts
it("creates expand tasks from the requested image version", async () => {
  const context = createServiceContext();
  const service = context.service;
  await seedImageAsset(context, {
    assetId: "asset-1",
    versionId: "version-1",
    width: 1024,
    height: 1024
  });

  await expect(
    service.createExpandTask(
      "user-1",
      "asset-1",
      {
        prompt: "extend the right side",
        versionId: "version-1",
        mode: "direction",
        direction: "right",
        percent: 0.25,
        padding: { left: 0, right: 256, top: 0, bottom: 0 },
        target: { width: 1280, height: 1024 }
      },
      "203.0.113.12"
    )
  ).resolves.toMatchObject({
    task: {
      type: "expand",
      input: {
        prompt: "extend the right side",
        assetId: "asset-1",
        versionId: "version-1",
        mode: "direction",
        direction: "right",
        percent: 0.25,
        padding: { left: 0, right: 256, top: 0, bottom: 0 },
        target: { width: 1280, height: 1024 }
      }
    }
  });

  expect(context.queue.enqueue).toHaveBeenCalledWith({
    taskId: expect.any(String),
    workspaceId: "workspace-1",
    userId: "user-1",
    type: "expand"
  });
});

it("rejects expand tasks when target dimensions do not match source plus padding", async () => {
  const context = createServiceContext();
  await seedImageAsset(context, {
    assetId: "asset-1",
    versionId: "version-1",
    width: 1024,
    height: 1024
  });

  await expect(
    context.service.createExpandTask("user-1", "asset-1", {
      prompt: "extend",
      versionId: "version-1",
      mode: "free",
      padding: { left: 0, right: 256, top: 0, bottom: 0 },
      target: { width: 1400, height: 1024 }
    })
  ).rejects.toThrow("扩展尺寸与源图尺寸不匹配");
});
```

Use existing test helpers where available. If helper names differ, adapt the exact setup while preserving the assertions.

- [ ] **Step 3: Run tests to verify RED**

Run:

```bash
pnpm --filter @rednote/backend test -- image-assets.controller.spec.ts image-assets.service.spec.ts
```

Expected: Tests fail because controller/service methods do not exist.

- [ ] **Step 4: Implement controller and service**

In `image-assets.service.ts`, export:

```ts
export type ImageAssetExpandRequest = {
  prompt?: string;
  versionId?: string;
  mode?: "free" | "ratio" | "direction";
  direction?: "left" | "right" | "top" | "bottom" | "around";
  percent?: number;
  padding?: { left: number; right: number; top: number; bottom: number };
  target?: { width: number; height: number };
  aspectRatio?: ImageAspectRatio;
};
```

Add:

```ts
const DEFAULT_EXPAND_PROMPT =
  "自然扩展图片画面，保持原图主体、风格和光照一致";
```

Add `createExpandTask`:

```ts
async createExpandTask(
  userId: string,
  assetId: string,
  request: ImageAssetExpandRequest,
  requestIp?: string
) {
  const asset = await this.findOwnedAsset(userId, assetId);
  const sourceVersion =
    typeof request.versionId === "string" && request.versionId.trim()
      ? asset.versions.find((version) => version.id === request.versionId?.trim())
      : this.currentVersion(asset);
  if (!sourceVersion) {
    throw new BadRequestException("当前图片没有可扩展的源版本");
  }

  const expand = parseAssetExpandRequest(request, sourceVersion);
  const prompt = parseOptionalPrompt(request.prompt) ?? DEFAULT_EXPAND_PROMPT;
  const normalizedRequestIp = requestIp?.trim() || undefined;

  await this.usage?.assertCanCreateTask(userId, {
    workspaceId: asset.workspaceId,
    ...(normalizedRequestIp ? { requestIp: normalizedRequestIp } : {}),
    request: {
      type: "expand",
      prompt,
      assetId: asset.id,
      versionId: sourceVersion.id,
      mode: expand.mode,
      ...(expand.direction ? { direction: expand.direction } : {}),
      ...(expand.percent ? { percent: expand.percent } : {}),
      padding: expand.padding,
      target: expand.target,
      ...(expand.aspectRatio ? { aspectRatio: expand.aspectRatio } : {})
    }
  });

  const task = await this.prisma.imageTask.create({
    data: {
      workspaceId: asset.workspaceId,
      userId,
      type: "expand",
      input: toInputJson({
        prompt,
        assetId: asset.id,
        versionId: sourceVersion.id,
        mode: expand.mode,
        ...(expand.direction ? { direction: expand.direction } : {}),
        ...(expand.percent ? { percent: expand.percent } : {}),
        padding: expand.padding,
        target: expand.target,
        ...(expand.aspectRatio ? { aspectRatio: expand.aspectRatio } : {})
      })
    }
  });
  await pruneImageTaskHistory(this.prisma, asset.workspaceId);

  await this.queue.enqueue({
    taskId: task.id,
    workspaceId: asset.workspaceId,
    userId,
    type: "expand"
  });

  return { task: serializeImageTask(task) };
}
```

Implement `parseAssetExpandRequest` near existing parse helpers. It must:

- require mode `free | ratio | direction`
- require target width and height
- require non-negative integer padding with at least one side greater than zero
- validate `target.width === sourceVersion.width + left + right`
- validate `target.height === sourceVersion.height + top + bottom`
- reject target dimensions above a conservative limit, initially `4096`
- validate direction only when mode is `direction`
- validate percent only when mode is `direction`, between `0.1` and `1`
- validate aspectRatio only when mode is `ratio`

In `image-assets.controller.ts`, import `ImageAssetExpandRequest` and add:

```ts
@Post(":assetId/expand")
async expand(
  @Req() request: Request,
  @Param("assetId") assetId: string,
  @Body() body: ImageAssetExpandRequest
) {
  const user = await this.requireUser(request);
  return this.assets.createExpandTask(
    user.id,
    assetId,
    body,
    readRequestIp(request)
  );
}
```

- [ ] **Step 5: Run tests to verify GREEN**

Run:

```bash
pnpm --filter @rednote/backend test -- image-assets.controller.spec.ts image-assets.service.spec.ts
```

Expected: Tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/image-workspaces/image-assets.controller.ts packages/backend/src/image-workspaces/image-assets.controller.spec.ts packages/backend/src/image-workspaces/image-assets.service.ts packages/backend/src/image-workspaces/image-assets.service.spec.ts
git commit -m "feat: create image expand tasks"
```

---

## Task 3: Worker Expand Processing

**Files:**
- Create: `packages/backend/src/image-workspaces/image-expand-canvas.ts`
- Modify: `packages/backend/src/image-workspaces/image-worker.service.ts`
- Modify: `packages/backend/src/image-workspaces/image-worker-edit.service.spec.ts`

- [ ] **Step 1: Write failing worker tests**

Add to `image-worker-edit.service.spec.ts`:

```ts
it("runs expand tasks with an expanded source image and mask", async () => {
  const context = createWorkerContext();
  const task = seedTask(context, {
    type: "expand",
    input: {
      prompt: "extend the right side",
      assetId: "asset-1",
      versionId: "version-source",
      mode: "direction",
      direction: "right",
      percent: 0.25,
      padding: { left: 0, right: 256, top: 0, bottom: 0 },
      target: { width: 1280, height: 1024 }
    }
  });

  await context.worker.processTask(task.id);

  expect(context.provider.edit).toHaveBeenCalledWith(
    expect.objectContaining({
      prompt: expect.stringContaining("extend the right side"),
      image: expect.objectContaining({
        width: 1280,
        height: 1024,
        mimeType: "image/png"
      }),
      mask: expect.objectContaining({
        width: 1280,
        height: 1024,
        mimeType: "image/png"
      }),
      size: "1536x1024"
    })
  );
  expect(context.prisma.imageVersion.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        parentId: "version-source",
        editPrompt: "extend the right side",
        metadata: expect.objectContaining({
          operation: "expand"
        })
      })
    })
  );
});

it("uses expand-specific task progress copy", async () => {
  const context = createWorkerContext();
  const task = seedTask(context, {
    type: "expand",
    input: {
      prompt: "extend",
      assetId: "asset-1",
      versionId: "version-source",
      mode: "free",
      padding: { left: 128, right: 0, top: 0, bottom: 0 },
      target: { width: 1152, height: 1024 }
    }
  });

  await context.worker.processTask(task.id);

  expect(context.queue.emitEvent).toHaveBeenCalledWith(task.id, {
    type: "task-progress",
    taskId: task.id,
    status: "running",
    message: "正在扩展图片"
  });
});
```

Adapt helper names to the existing spec structure. Preserve provider/edit assertions.

- [ ] **Step 2: Write failing canvas helper test**

If backend test infrastructure supports importing helper modules, create `packages/backend/src/image-workspaces/image-expand-canvas.spec.ts`:

```ts
import { describe, expect, it } from "@jest/globals";
import { buildImageExpandEditInput } from "./image-expand-canvas.js";

describe("buildImageExpandEditInput", () => {
  it("builds expanded source and mask refs with target dimensions", async () => {
    const result = await buildImageExpandEditInput({
      source: {
        storageKey: "source.png",
        mimeType: "image/png",
        width: 1024,
        height: 1024,
        sizeBytes: 100
      },
      sourceBytes: Buffer.from("source"),
      padding: { left: 0, right: 256, top: 0, bottom: 0 },
      target: { width: 1280, height: 1024 }
    });

    expect(result.image.width).toBe(1280);
    expect(result.image.height).toBe(1024);
    expect(result.mask.width).toBe(1280);
    expect(result.mask.height).toBe(1024);
    expect(result.image.mimeType).toBe("image/png");
    expect(result.mask.mimeType).toBe("image/png");
  });
});
```

If native image composition is not available in tests, design the helper so it can accept an injected renderer and test the renderer call contract instead.

- [ ] **Step 3: Run tests to verify RED**

Run:

```bash
pnpm --filter @rednote/backend test -- image-worker-edit.service.spec.ts image-expand-canvas.spec.ts
```

Expected: Tests fail because expand processing/helper does not exist.

- [ ] **Step 4: Implement expand processing**

In `image-worker.service.ts`:

- Add `"expand"` to `ImageTaskRow["type"]`.
- Route `task.type === "expand"` to a new `processImageExpandTask`.
- Add `parseExpandTaskInput`.
- Add progress copy:

```ts
case "expand":
  return {
    running: "正在扩展图片",
    complete: "图片扩展已完成",
    failed: "图片扩展失败，请稍后再试"
  };
```

Implement:

```ts
private async processImageExpandTask(task: ImageTaskRow): Promise<void> {
  const input = parseExpandTaskInput(task.input);
  const sourceVersion = await this.findTaskVersion(task, input);
  const sourceBytes = await this.storage.getImage(toStoredImageRef(sourceVersion));
  const expanded = await buildImageExpandEditInput({
    source: toStoredImageRef(sourceVersion),
    sourceBytes,
    padding: input.padding,
    target: input.target
  });
  const generated = await this.provider.edit({
    prompt: createExpandPrompt(input),
    image: expanded.image,
    mask: expanded.mask,
    size: sizeForTarget(input.target)
  });
  if (await this.isTaskCanceled(task.id)) return;

  const stored = await this.storage.putImage({
    userId: task.userId,
    workspaceId: task.workspaceId,
    taskId: task.id,
    filename: `${task.id}.png`,
    bytes: generated.bytes,
    mimeType: generated.mimeType
  });
  if (await this.cleanupStoredImageIfCanceled(task.id, stored)) return;

  const version = await this.createEditedVersion(task, input, sourceVersion, {
    ...generated,
    metadata: {
      ...generated.metadata,
      operation: "expand",
      mode: input.mode,
      padding: input.padding,
      target: input.target,
      ...(input.direction ? { direction: input.direction } : {}),
      ...(input.percent ? { percent: input.percent } : {}),
      ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {})
    }
  }, stored);

  await this.updateCanvasObjectsForExpandedVersion(task, input, version.versionId);
  await this.queue.emitEvent(task.id, {
    type: "asset-version-created",
    taskId: task.id,
    assetId: input.assetId,
    versionId: version.versionId
  });
  await this.queue.emitEvent(task.id, {
    type: "asset-updated",
    taskId: task.id,
    assetId: input.assetId,
    versionId: version.versionId
  });
  await this.emitUsageEvent(task, generated, { quality: null, size: sizeForTarget(input.target) });
  await this.queue.emitEvent(task.id, {
    type: "task-progress",
    taskId: task.id,
    status: "complete",
    message: getImageTaskProgressCopy(task.type).complete
  });
}
```

Add `updateCanvasObjectsForExpandedVersion`:

```ts
private async updateCanvasObjectsForExpandedVersion(
  task: ImageTaskRow,
  input: ExpandTaskInput,
  versionId: string
) {
  await this.prisma.canvasObject.updateMany({
    where: {
      workspaceId: task.workspaceId,
      assetId: input.assetId
    },
    data: {
      x: { decrement: input.padding.left },
      y: { decrement: input.padding.top },
      width: input.target.width,
      height: input.target.height,
      props: toInputJson({ versionId })
    }
  });
}
```

If Prisma does not allow `{ decrement }` in `updateMany` for the typed mock, first query matching objects and update them individually in a transaction.

In `image-expand-canvas.ts`, implement `buildImageExpandEditInput`. Prefer a Node image library already present in the workspace if available. If none is present, use the `sharp` package only if it already exists in lockfile. Do not add a new image library without checking with the user. If no library exists, implement a conservative first version that passes an expanded transparent PNG generated by an existing canvas runtime if available.

The returned object must satisfy provider edit refs:

```ts
type ExpandEditInput = {
  image: StoredImageRef & { bytes?: Buffer };
  mask: StoredImageRef & { bytes?: Buffer };
};
```

If `ImageProviderAdapter.edit` only accepts `StoredImageRef`, extend it to accept inline bytes:

```ts
export type ImageEditSource = StoredImageRef | (StoredImageRef & { bytes: Buffer });
```

Then update `OpenAIImageProviderService.edit` to use inline bytes when present before reading storage.

- [ ] **Step 5: Run tests to verify GREEN**

Run:

```bash
pnpm --filter @rednote/backend test -- image-worker-edit.service.spec.ts image-expand-canvas.spec.ts image-provider.types.spec.ts openai-image-provider.service.spec.ts
```

Expected: Tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/backend/src/image-workspaces/image-worker.service.ts packages/backend/src/image-workspaces/image-worker-edit.service.spec.ts packages/backend/src/image-workspaces/image-expand-canvas.ts packages/backend/src/image-workspaces/image-expand-canvas.spec.ts packages/backend/src/image-workspaces/image-provider.types.ts packages/backend/src/image-workspaces/image-provider.types.spec.ts packages/backend/src/image-workspaces/openai-image-provider.service.ts packages/backend/src/image-workspaces/openai-image-provider.service.spec.ts
git commit -m "feat: process image expand tasks"
```

---

## Task 4: Frontend API And Hook

**Files:**
- Create: `packages/web-frontend/src/app/api/image-assets/[assetId]/expand/route.ts`
- Modify: `packages/web-frontend/src/app/image-workspace/workspace-api.ts`
- Modify: `packages/web-frontend/src/app/image-workspace/use-image-workspace.ts`
- Modify: `packages/web-frontend/src/app/image-workspace/page.tsx`
- Modify: `packages/web-frontend/src/app/image-workspace/image-workspace-shell.tsx`
- Modify: `packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs`

- [ ] **Step 1: Write failing frontend tests**

Extend `image-workspace.test.mjs` with:

```js
test("image workspace hook can create expand tasks for selected assets", () => {
  const hookSource = readImageWorkspaceFile("use-image-workspace.ts");
  const shellSource = readImageWorkspaceFile("image-workspace-shell.tsx");
  const pageSource = readFileSync(join(imageWorkspaceDir, "page.tsx"), "utf8");

  assert.match(hookSource, /async function expandImageAsset/);
  assert.match(hookSource, /createImageAssetExpandTask\(assetId/);
  assert.match(hookSource, /appendTask\(activeWorkspace\.id,\s*task\)/);
  assert.match(hookSource, /setStreamTaskId\(task\.id\)/);
  assert.match(shellSource, /onExpandAsset/);
  assert.match(pageSource, /onExpandAsset=\{workspace\.expandImageAsset\}/);
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
node --test packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs
```

Expected: Fails because API/hook/props are missing.

- [ ] **Step 3: Implement frontend API and hook**

Create route:

```ts
import { NextRequest } from "next/server";
import { proxyBackendRequest } from "../../../shared/backend-proxy";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const { assetId } = await params;
  return proxyBackendRequest(
    request,
    `image-assets/${encodeURIComponent(assetId)}/expand`,
  );
}
```

In `workspace-api.ts`, add:

```ts
export type ImageExpandRequest = {
  prompt?: string;
  versionId: string;
  mode: "free" | "ratio" | "direction";
  direction?: "left" | "right" | "top" | "bottom" | "around";
  percent?: number;
  padding: { left: number; right: number; top: number; bottom: number };
  target: { width: number; height: number };
  aspectRatio?: ImageGenerationSettings["aspectRatio"];
};

export async function createImageAssetExpandTask(
  assetId: string,
  input: ImageExpandRequest,
) {
  const response = await fetch(`/api/image-assets/${encodeURIComponent(assetId)}/expand`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await assertOk(response, "图片扩展任务创建失败");
  const data = await readJson<{ task: ImageTask }>(response);
  return data.task;
}
```

In `use-image-workspace.ts`, import the helper and add:

```ts
async function expandImageAsset(assetId: string, input: ImageExpandRequest) {
  if (!activeWorkspace || creatingTask) return;
  setCreatingTask(true);
  setError(null);
  try {
    const task = await createImageAssetExpandTask(assetId, input);
    appendTask(activeWorkspace.id, task);
    setStreamTaskId(task.id);
  } catch (taskError) {
    setError(taskError instanceof Error ? taskError.message : "图片扩展任务创建失败");
  } finally {
    setCreatingTask(false);
  }
}
```

Return `expandImageAsset`.

Thread prop through `page.tsx` and `image-workspace-shell.tsx`:

```tsx
onExpandAsset={workspace.expandImageAsset}
```

- [ ] **Step 4: Run test to verify GREEN**

Run:

```bash
node --test packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs
```

Expected: Tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/web-frontend/src/app/api/image-assets/[assetId]/expand/route.ts packages/web-frontend/src/app/image-workspace/workspace-api.ts packages/web-frontend/src/app/image-workspace/use-image-workspace.ts packages/web-frontend/src/app/image-workspace/page.tsx packages/web-frontend/src/app/image-workspace/image-workspace-shell.tsx packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs
git commit -m "feat: wire image expand task api"
```

---

## Task 5: Leafer Expansion Overlay

**Files:**
- Modify: `packages/web-frontend/src/app/image-workspace/leafer-canvas-types.ts`
- Modify: `packages/web-frontend/src/app/image-workspace/leafer-canvas-adapter.ts`
- Modify: `packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs`

- [ ] **Step 1: Write failing tests**

Add to `image-workspace.test.mjs`:

```js
test("leafer canvas exposes local image expansion overlay controls", () => {
  const typesSource = readImageWorkspaceFile("leafer-canvas-types.ts");
  const adapterSource = readImageWorkspaceFile("leafer-canvas-adapter.ts");

  assert.match(typesSource, /LocalExpandOverlayState/);
  assert.match(typesSource, /getLocalExpandState/);
  assert.match(typesSource, /setLocalExpandMode/);
  assert.match(typesSource, /setLocalExpandAspectRatio/);
  assert.match(typesSource, /setLocalExpandDirection/);
  assert.match(typesSource, /setLocalExpandPercent/);
  assert.match(typesSource, /setLocalExpandPadding/);
  assert.match(typesSource, /clearLocalExpandOverlay/);
  assert.match(typesSource, /exportLocalExpandInput/);
  assert.match(adapterSource, /expandLayer/);
  assert.match(adapterSource, /renderExpandOverlay/);
  assert.match(adapterSource, /calculateRatioExpandPadding/);
  assert.match(adapterSource, /calculateDirectionalExpandPadding/);
  assert.match(adapterSource, /dragExpandHandle/);
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
node --test packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs
```

Expected: Fails because expansion controller methods do not exist.

- [ ] **Step 3: Implement controller types**

In `leafer-canvas-types.ts`, add:

```ts
export type LocalExpandMode = "free" | "ratio" | "direction";
export type LocalExpandDirection = "left" | "right" | "top" | "bottom" | "around";
export type LocalExpandPadding = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};
export type LocalExpandOverlayState = {
  active: boolean;
  assetId: string | null;
  versionId: string | null;
  mode: LocalExpandMode;
  aspectRatio: "1:1" | "2:1" | "4:3" | "16:9" | "1:2" | "3:4" | "9:16";
  direction: LocalExpandDirection;
  percent: number;
  padding: LocalExpandPadding;
  target: { width: number; height: number } | null;
};
export type LocalExpandExportInput = {
  assetId: string;
  versionId: string;
  width: number;
  height: number;
};
export type LocalExpandExportResult = {
  promptDefaults: string;
  versionId: string;
  mode: LocalExpandMode;
  aspectRatio?: LocalExpandOverlayState["aspectRatio"];
  direction?: LocalExpandDirection;
  percent?: number;
  padding: LocalExpandPadding;
  target: { width: number; height: number };
};
```

Add methods to `CanvasController`.

- [ ] **Step 4: Implement adapter overlay**

In `leafer-canvas-adapter.ts`:

- Create `expandLayer = new Group(...)`.
- Add it to `app.tree`.
- Track `localExpandState`.
- Render dashed expanded rectangle with handles.
- In free mode, drag handles update padding.
- In ratio mode, calculate padding from source dimensions and selected ratio.
- In direction mode, calculate padding from selected direction and percent.
- Clear overlay on node change and when leaving expansion UI.

Use a simple first visual:

```ts
new Rect({
  x,
  y,
  width,
  height,
  stroke: "rgba(225, 29, 72, 0.82)",
  strokeWidth: 2,
  dashPattern: [8, 6],
  fill: "rgba(225, 29, 72, 0.08)",
  hittable: false
})
```

Use small draggable `Rect` or `Ellipse` handles for edges/corners. Each handle carries an internal direction string. Pointer move updates padding with integer clamping.

Export:

```ts
exportLocalExpandInput({ assetId, versionId, width, height }) {
  const selectedNode = readSelectedNode();
  if (!selectedNode || selectedNode.__mira?.miraAssetId !== assetId) {
    throw new Error("请先选择要扩展的图片");
  }
  const padding = normalizeExpandPadding(localExpandState.padding);
  const target = {
    width: width + padding.left + padding.right,
    height: height + padding.top + padding.bottom,
  };
  return {
    promptDefaults: "自然扩展图片画面，保持原图主体、风格和光照一致",
    versionId,
    mode: localExpandState.mode,
    ...(localExpandState.mode === "ratio" ? { aspectRatio: localExpandState.aspectRatio } : {}),
    ...(localExpandState.mode === "direction" ? {
      direction: localExpandState.direction,
      percent: localExpandState.percent,
    } : {}),
    padding,
    target,
  };
}
```

- [ ] **Step 5: Run test to verify GREEN**

Run:

```bash
node --test packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs
pnpm --filter @mira/web-frontend exec tsc --noEmit
```

Expected: Tests and typecheck pass.

- [ ] **Step 6: Commit**

```bash
git add packages/web-frontend/src/app/image-workspace/leafer-canvas-types.ts packages/web-frontend/src/app/image-workspace/leafer-canvas-adapter.ts packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs
git commit -m "feat: add image expand canvas overlay"
```

---

## Task 6: Version Panel Expansion UI

**Files:**
- Modify: `packages/web-frontend/src/app/image-workspace/components/asset-version-panel.tsx`
- Modify: `packages/web-frontend/src/app/image-workspace/components/inspector-panel.tsx`
- Modify: `packages/web-frontend/src/app/image-workspace/image-workspace-shell.tsx`
- Modify: `packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs`

- [ ] **Step 1: Write failing tests**

Add to `image-workspace.test.mjs`:

```js
test("asset version panel exposes image expansion controls", () => {
  const panelSource = readImageWorkspaceFile("components/asset-version-panel.tsx");
  const inspectorSource = readImageWorkspaceFile("components/inspector-panel.tsx");
  const shellSource = readImageWorkspaceFile("image-workspace-shell.tsx");

  assert.match(panelSource, /扩展图片/);
  assert.match(panelSource, /expandMode/);
  assert.match(panelSource, /自由/);
  assert.match(panelSource, /比例/);
  assert.match(panelSource, /方向/);
  assert.match(panelSource, /onExpand/);
  assert.match(panelSource, /onLocalExpandModeChange/);
  assert.match(panelSource, /onLocalExpandAspectRatioChange/);
  assert.match(panelSource, /onLocalExpandDirectionChange/);
  assert.match(panelSource, /onLocalExpandPercentChange/);
  assert.match(inspectorSource, /onExpand/);
  assert.match(shellSource, /submitExpand/);
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
node --test packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs
```

Expected: Fails because UI controls do not exist.

- [ ] **Step 3: Implement panel controls**

In `asset-version-panel.tsx`:

- Add an `Expand` icon button using an existing lucide icon such as `ScanLine` or `PanelTopOpen`.
- Add local state:

```ts
const [expandOpen, setExpandOpen] = useState(false);
const [expandPrompt, setExpandPrompt] = useState("");
```

- Render a compact section when `expandOpen` is true:
  - segmented buttons for `自由`, `比例`, `方向`
  - ratio swatches for ratio mode
  - direction icon grid and percent range for direction mode
  - read-only padding/target summary from `localExpandOverlayState`
  - prompt textarea
  - submit button

The submit handler:

```ts
async function submitExpand(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (!selectedAsset || !currentVersion) return;
  await runAction(() =>
    onSubmitExpand(selectedAsset.id, currentVersion, expandPrompt)
  );
}
```

In `image-workspace-shell.tsx`:

- Track `localExpandState` from controller subscription, similar to local edit overlay.
- Implement `submitExpand`:

```ts
const submitExpand = useCallback(
  async (assetId: string, version: ImageVersion, prompt: string) => {
    const controller = canvasControllerRef.current;
    if (!controller) throw new Error("图像画布还在加载，请稍后再试");
    const expand = controller.exportLocalExpandInput({
      assetId,
      versionId: version.id,
      width: version.width,
      height: version.height,
    });
    await onExpandAsset(assetId, {
      ...expand,
      prompt: prompt.trim() || expand.promptDefaults,
    });
    controller.clearLocalExpandOverlay();
  },
  [onExpandAsset],
);
```

Pass controller setters to the panel.

- [ ] **Step 4: Run tests to verify GREEN**

Run:

```bash
node --test packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs
pnpm --filter @mira/web-frontend exec tsc --noEmit
```

Expected: Tests and typecheck pass.

- [ ] **Step 5: Commit**

```bash
git add packages/web-frontend/src/app/image-workspace/components/asset-version-panel.tsx packages/web-frontend/src/app/image-workspace/components/inspector-panel.tsx packages/web-frontend/src/app/image-workspace/image-workspace-shell.tsx packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs
git commit -m "feat: add image expand controls"
```

---

## Task 7: Verification, Build, And Deployment Readiness

**Files:**
- No new files unless tests reveal issues.

- [ ] **Step 1: Run backend tests**

```bash
pnpm --filter @rednote/backend test
```

Expected: All backend tests pass.

- [ ] **Step 2: Run frontend tests**

```bash
pnpm --filter @mira/web-frontend test
```

Expected: All frontend tests pass.

- [ ] **Step 3: Run typechecks**

```bash
pnpm --filter @rednote/backend build
pnpm --filter @mira/web-frontend exec tsc --noEmit
```

Expected: Both pass.

- [ ] **Step 4: Run frontend lint**

```bash
pnpm --filter @mira/web-frontend lint
```

Expected: No errors. Existing `<img>` warnings in `asset-version-panel.tsx` may remain if unrelated to the implementation.

- [ ] **Step 5: Run production frontend build**

```bash
pnpm --filter @mira/web-frontend build
```

Expected: Build completes.

- [ ] **Step 6: Check diff hygiene**

```bash
git diff --check
git status --short
```

Expected: No whitespace errors. Only intentional files are modified.

- [ ] **Step 7: Commit verification fixes if needed**

If verification required fixes:

```bash
git add <fixed-files>
git commit -m "fix: stabilize image expand workflow"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review

Spec coverage:

- Free expansion is covered by Task 5 and Task 6.
- Ratio expansion is covered by Task 5 and Task 6.
- Direction expansion is covered by Task 2, Task 5, and Task 6.
- Backend `expand` task type is covered by Task 1 and Task 2.
- Provider edit/outpaint strategy is covered by Task 3.
- Frontend API/hook/task stream support is covered by Task 4.
- Testing and build verification are covered by Task 7.

Placeholder scan:

- No task uses `TBD`, `TODO`, or "implement later".
- Where helper names might differ in current tests, the plan states how to preserve assertions while adapting setup.

Type consistency:

- The plan uses `expandTarget` only internally in backend parser notes to avoid colliding with existing generation placement `target`.
- Public request bodies keep `target: { width, height }`, matching the approved spec.
- Frontend `ImageExpandRequest` matches the public API body.

