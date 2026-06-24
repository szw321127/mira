# Mira Leafer Canvas Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the image workspace's tldraw canvas with a MIT-licensed Leafer canvas while preserving Mira's existing image placement, selection, transform, viewport, and persistence behavior.

**Architecture:** Keep backend `CanvasSnapshot` unchanged and isolate Leafer behind a local frontend adapter. React owns workspace state, inspector state, toolbar chrome, and persistence timing; Leafer owns rendering and transform interaction for image objects.

**Tech Stack:** Next 16 App Router, React 19, Tailwind 4, Leafer UI 2.1.8, Leafer Editor 2.1.8, lucide-react, Node test runner.

---

## Source Documents

- Frontend design: `docs/gstack/2026-06-24-mira-leafer-canvas-frontend-design.md`
- Engineering review: `docs/gstack/2026-06-24-mira-leafer-canvas-eng-review.md`
- Impeccable review: `docs/gstack/2026-06-24-mira-leafer-canvas-impeccable-review.md`

## Current State

The current working tree is intentionally dirty from an earlier task:

- `packages/web-frontend/src/app/image-workspace/components/task-inspector.tsx`
- `packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs`

Do not revert those changes. When implementing this plan, work with the existing dirty tree and avoid mixing unrelated task-inspector edits into the canvas migration commit unless the user asks to commit everything together.

Current tldraw dependencies:

- `packages/web-frontend/package.json` has `"tldraw": "^5.1.1"`.
- `packages/web-frontend/src/app/image-workspace/image-canvas.tsx` imports `Tldraw`, tldraw types, and `tldraw/tldraw.css`.
- `packages/web-frontend/src/app/image-workspace/use-canvas-persistence.ts` imports tldraw `Editor` and `TLShape`.
- `packages/web-frontend/src/app/image-workspace/components/canvas-toolbar.tsx` imports tldraw `Editor`.

## Task 1: Dependency And Test Guardrails

**Files:**

- Modify: `packages/web-frontend/package.json`
- Modify: `packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs`

- [ ] **Step 1: Write failing tests for Leafer migration guardrails**

Add source-level tests that require the package dependency change and forbid tldraw imports in image workspace files:

```js
test("image canvas uses Leafer instead of tldraw", () => {
  const packageSource = readFileSync(
    join(workspaceDir, "..", "..", "package.json"),
    "utf8",
  );
  const canvasSource = readImageWorkspaceFile("image-canvas.tsx");
  const persistenceSource = readImageWorkspaceFile("use-canvas-persistence.ts");
  const toolbarSource = readImageWorkspaceFile("components/canvas-toolbar.tsx");

  assert.match(packageSource, /"leafer-ui"/);
  assert.match(packageSource, /"leafer-editor"/);
  assert.doesNotMatch(packageSource, /"tldraw"/);
  assert.doesNotMatch(`${canvasSource}\n${persistenceSource}\n${toolbarSource}`, /from "tldraw"|tldraw\/tldraw\.css/);
  assert.match(canvasSource, /createLeaferCanvasController/);
});
```

Rewrite the existing tldraw-specific tests to expect Leafer terms:

```js
test("image canvas is backed by Leafer and keeps an explicit canvas size", () => {
  const canvasSource = readImageWorkspaceFile("image-canvas.tsx");

  assert.match(canvasSource, /createLeaferCanvasController/);
  assert.match(canvasSource, /className="[^"]*h-full[^"]*w-full/);
  assert.match(canvasSource, /useEffect/);
  assert.match(canvasSource, /canvasReady/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
pnpm --filter @mira/web-frontend test -- src/app/image-workspace/image-workspace.test.mjs
```

Expected: FAIL because `tldraw` is still installed and the Leafer controller does not exist.

- [ ] **Step 3: Update package dependencies**

Modify `packages/web-frontend/package.json` dependencies:

```json
{
  "dependencies": {
    "@ant-design/x": "2.8.0",
    "@ant-design/x-markdown": "^2.8.0",
    "antd": "^6.1.1",
    "leafer-editor": "^2.1.8",
    "leafer-ui": "^2.1.8",
    "lucide-react": "^0.468.0",
    "next": "16.2.9",
    "react": "19.2.4",
    "react-dom": "19.2.4"
  }
}
```

Then run:

```bash
pnpm install
```

- [ ] **Step 4: Run dependency guard test again**

Run:

```bash
pnpm --filter @mira/web-frontend test -- src/app/image-workspace/image-workspace.test.mjs
```

Expected: still FAIL because implementation files still import tldraw.

- [ ] **Step 5: Commit dependency/test guardrails when green later**

Do not commit yet if tests are still red. This task becomes commit-ready only after Tasks 2-5 make the test suite green.

## Task 2: Create App-Owned Canvas Controller Types

**Files:**

- Create: `packages/web-frontend/src/app/image-workspace/leafer-canvas-types.ts`
- Modify: `packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs`

- [ ] **Step 1: Write failing source test for controller boundary**

Add:

```js
test("image canvas exposes an app-owned canvas controller boundary", () => {
  const typeSource = readImageWorkspaceFile("leafer-canvas-types.ts");
  const toolbarSource = readImageWorkspaceFile("components/canvas-toolbar.tsx");
  const persistenceSource = readImageWorkspaceFile("use-canvas-persistence.ts");

  assert.match(typeSource, /export type CanvasTool = "select" \| "pan"/);
  assert.match(typeSource, /export type CanvasController/);
  assert.match(typeSource, /serializeSnapshot:\s*\(\)\s*=>\s*CanvasSnapshot/);
  assert.match(typeSource, /hydrateWorkspace:\s*\(workspace:\s*ImageWorkspace\s*\|\s*null\)\s*=>\s*void/);
  assert.match(toolbarSource, /CanvasController/);
  assert.match(persistenceSource, /CanvasController/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @mira/web-frontend test -- src/app/image-workspace/image-workspace.test.mjs
```

Expected: FAIL because `leafer-canvas-types.ts` does not exist.

- [ ] **Step 3: Create controller types**

Create `leafer-canvas-types.ts`:

```ts
import type { CanvasSnapshot, ImageWorkspace } from "./types";

export type CanvasTool = "select" | "pan";

export type CanvasController = {
  clearSelection: () => void;
  destroy: () => void;
  fitView: () => void;
  getActiveTool: () => CanvasTool;
  getCanRedo: () => boolean;
  getCanUndo: () => boolean;
  hydrateWorkspace: (workspace: ImageWorkspace | null) => void;
  redo: () => void;
  selectAsset: (assetId: string | null) => void;
  serializeSnapshot: () => CanvasSnapshot;
  setTool: (tool: CanvasTool) => void;
  undo: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

export type CanvasControllerEvents = {
  onChange: () => void;
  onError: (message: string) => void;
  onReady: () => void;
  onSelectAsset: (assetId: string | null) => void;
};
```

- [ ] **Step 4: Run test**

Run:

```bash
pnpm --filter @mira/web-frontend test -- src/app/image-workspace/image-workspace.test.mjs
```

Expected: still FAIL until toolbar and persistence use `CanvasController`.

## Task 3: Build Leafer Adapter Skeleton

**Files:**

- Create: `packages/web-frontend/src/app/image-workspace/leafer-canvas-adapter.ts`
- Modify: `packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs`

- [ ] **Step 1: Write failing test for adapter skeleton**

Add:

```js
test("Leafer adapter owns engine-specific image canvas behavior", () => {
  const adapterSource = readImageWorkspaceFile("leafer-canvas-adapter.ts");

  assert.match(adapterSource, /from "leafer-ui"/);
  assert.match(adapterSource, /from "leafer-editor"/);
  assert.match(adapterSource, /export function createLeaferCanvasController/);
  assert.match(adapterSource, /createImageAssetPreviewUrl/);
  assert.match(adapterSource, /miraObjectId/);
  assert.match(adapterSource, /miraAssetId/);
  assert.match(adapterSource, /removeStaleMiraImageNodes/);
  assert.match(adapterSource, /serializeSnapshot/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @mira/web-frontend test -- src/app/image-workspace/image-workspace.test.mjs
```

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Create minimal adapter**

Implement `createLeaferCanvasController` with:

- A Leafer root bound to a provided HTML container.
- A dedicated image layer/group.
- Placeholder controller methods that are wired and type-correct.
- Real `destroy`, `hydrateWorkspace`, `selectAsset`, and `serializeSnapshot` stubs that return the existing `CanvasSnapshot` shape.

Use this signature:

```ts
export function createLeaferCanvasController({
  container,
  events,
}: {
  container: HTMLDivElement;
  events: CanvasControllerEvents;
}): CanvasController
```

The first implementation must compile before behavior is filled in.

- [ ] **Step 4: Run tests**

Run:

```bash
pnpm --filter @mira/web-frontend test -- src/app/image-workspace/image-workspace.test.mjs
```

Expected: adapter skeleton assertions pass, old behavior assertions may still fail.

## Task 4: Wire `ImageCanvas` To Leafer

**Files:**

- Modify: `packages/web-frontend/src/app/image-workspace/image-canvas.tsx`
- Modify: `packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs`

- [ ] **Step 1: Write failing test for React wiring**

Update existing canvas tests to require:

```js
assert.match(canvasSource, /canvasHostRef/);
assert.match(canvasSource, /createLeaferCanvasController/);
assert.match(canvasSource, /setController/);
assert.match(canvasSource, /onSelectAsset\(assetId\)/);
assert.match(canvasSource, /controller\.hydrateWorkspace\(workspace\)/);
assert.match(canvasSource, /controller\.selectAsset\(selectedAssetId\)/);
assert.match(canvasSource, /aria-label="图像画布"/);
assert.match(canvasSource, /tabIndex=\{0\}/);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @mira/web-frontend test -- src/app/image-workspace/image-workspace.test.mjs
```

Expected: FAIL because `ImageCanvas` still renders `<Tldraw>`.

- [ ] **Step 3: Replace tldraw React wiring**

In `image-canvas.tsx`:

- Remove all `tldraw` imports and `tldraw/tldraw.css`.
- Add `useRef<HTMLDivElement | null>`.
- Keep `canvasReady` delayed mount and timeout fallback.
- Create controller when `canvasReady`, `workspace`, and `canvasHostRef.current` exist.
- Dispose controller on cleanup.
- Call `controller.hydrateWorkspace(workspace)` when workspace changes.
- Call `controller.selectAsset(selectedAssetId)` when selection changes.
- Render:

```tsx
<div
  aria-label="图像画布"
  className="h-full w-full"
  onKeyDown={handleCanvasKeyDown}
  ref={canvasHostRef}
  tabIndex={0}
/>
```

Keep the outer container classes:

```tsx
className="relative h-full w-full overflow-hidden bg-[var(--surface-muted)]"
```

- [ ] **Step 4: Run test**

Run:

```bash
pnpm --filter @mira/web-frontend test -- src/app/image-workspace/image-workspace.test.mjs
```

Expected: `ImageCanvas` wiring assertions pass after the controller is integrated.

## Task 5: Hydrate Images, Selection, Viewport, And Persistence

**Files:**

- Modify: `packages/web-frontend/src/app/image-workspace/leafer-canvas-adapter.ts`
- Modify: `packages/web-frontend/src/app/image-workspace/use-canvas-persistence.ts`
- Modify: `packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs`

- [ ] **Step 1: Write failing behavior-source tests**

Update existing tests to look for Leafer equivalents:

```js
assert.match(adapterSource, /new Image/);
assert.match(adapterSource, /createImageAssetPreviewUrl\(asset\.id\)/);
assert.match(adapterSource, /node\.draggable\s*=\s*true|draggable:\s*true/);
assert.match(adapterSource, /rotation:\s*object\.rotation/);
assert.match(adapterSource, /width:\s*object\.width/);
assert.match(adapterSource, /height:\s*object\.height/);
assert.match(adapterSource, /removeStaleMiraImageNodes/);
assert.match(adapterSource, /serializeSnapshot/);
assert.match(adapterSource, /viewport/);
assert.match(persistenceSource, /CANVAS_SAVE_DEBOUNCE_MS\s*=\s*700/);
assert.match(persistenceSource, /controller\.serializeSnapshot\(\)/);
assert.match(persistenceSource, /JSON\.stringify\(snapshot\)/);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @mira/web-frontend test -- src/app/image-workspace/image-workspace.test.mjs
```

Expected: FAIL until adapter behavior is implemented.

- [ ] **Step 3: Implement hydration**

In `leafer-canvas-adapter.ts`:

- Build `assetsById`.
- Filter `workspace.objects` to image objects with valid assets.
- Create or update one Leafer image node per `CanvasObject`.
- Store metadata on the node:

```ts
{
  miraObjectId: object.id,
  miraAssetId: asset.id,
  miraVersionId: version.id
}
```

- Use `createImageAssetPreviewUrl(asset.id)` for image source.
- Apply `x`, `y`, `width`, `height`, `rotation`, and `zIndex`.
- Remove nodes whose `miraObjectId` no longer exists.

- [ ] **Step 4: Implement selection sync**

Adapter must:

- Emit `events.onSelectAsset(assetId)` when the selected image changes.
- Clear selection when the selected node disappears.
- Select a matching node in `selectAsset(assetId)`.
- Clear selection for `selectAsset(null)`.

- [ ] **Step 5: Implement snapshot serialization**

Adapter `serializeSnapshot()` returns:

```ts
{
  viewport: {
    x,
    y,
    zoom,
  },
  objects: imageNodes.map((node, index) => ({
    id: node.meta.miraObjectId,
    assetId: node.meta.miraAssetId,
    type: "image",
    x: finite(node.x, 0),
    y: finite(node.y, 0),
    width: finite(node.width, 320),
    height: finite(node.height, 320),
    rotation: finite(node.rotation, 0),
    zIndex: index,
    props: {},
  })),
}
```

Use helper functions to normalize finite numbers.

- [ ] **Step 6: Implement persistence hook over controller**

Change `use-canvas-persistence.ts` input to:

```ts
type UseCanvasPersistenceInput = {
  controller: CanvasController | null;
  workspace: ImageWorkspace | null;
  onPersistCanvas: (snapshot: CanvasSnapshot) => Promise<void> | void;
};
```

Use adapter/controller change events from `ImageCanvas` to trigger schedule saves, or expose a subscribe method if implementation prefers that. Keep:

- 700ms debounce.
- JSON snapshot dedupe.
- Cleanup timer on unmount.

- [ ] **Step 7: Run tests**

Run:

```bash
pnpm --filter @mira/web-frontend test -- src/app/image-workspace/image-workspace.test.mjs
```

Expected: hydration, selection, and persistence source tests pass.

## Task 6: Toolbar And Keyboard Controls

**Files:**

- Modify: `packages/web-frontend/src/app/image-workspace/components/canvas-toolbar.tsx`
- Modify: `packages/web-frontend/src/app/image-workspace/image-canvas.tsx`
- Modify: `packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs`

- [ ] **Step 1: Write failing toolbar test**

Update toolbar test:

```js
assert.match(toolbarSource, /CanvasController/);
assert.match(toolbarSource, /aria-pressed=\{button\.active/);
assert.match(toolbarSource, /controller\.setTool\("select"\)/);
assert.match(toolbarSource, /controller\.setTool\("pan"\)/);
assert.match(toolbarSource, /controller\.undo\(\)/);
assert.match(toolbarSource, /controller\.redo\(\)/);
assert.match(toolbarSource, /controller\.zoomIn\(\)/);
assert.match(toolbarSource, /controller\.zoomOut\(\)/);
assert.match(toolbarSource, /controller\.fitView\(\)/);
assert.doesNotMatch(toolbarSource, /Frame/);
assert.doesNotMatch(toolbarSource, /setCurrentTool\("frame"\)/);
assert.doesNotMatch(toolbarSource, /from "tldraw"/);
```

Add keyboard assertions:

```js
assert.match(canvasSource, /handleCanvasKeyDown/);
assert.match(canvasSource, /event\.key === "Escape"/);
assert.match(canvasSource, /event\.key === "Delete"/);
assert.match(canvasSource, /event\.key === "Backspace"/);
assert.match(canvasSource, /controller\.clearSelection\(\)/);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --filter @mira/web-frontend test -- src/app/image-workspace/image-workspace.test.mjs
```

Expected: FAIL until toolbar and keyboard handling are rewritten.

- [ ] **Step 3: Rewrite toolbar**

Change prop:

```ts
type CanvasToolbarProps = {
  controller: CanvasController | null;
};
```

Buttons:

- Select -> `controller.setTool("select")`.
- Pan -> `controller.setTool("pan")`.
- Undo -> `controller.undo()`, disabled by `!controller.getCanUndo()`.
- Redo -> `controller.redo()`, disabled by `!controller.getCanRedo()`.
- Zoom out -> `controller.zoomOut()`.
- Zoom in -> `controller.zoomIn()`.
- Fit view -> `controller.fitView()`.

Remove the frame button.

- [ ] **Step 4: Add keyboard controls**

In `ImageCanvas`:

- `Escape`: `controller.clearSelection()`.
- `Delete` and `Backspace`: call a controller delete method if implemented. If delete is not in the original controller type, add `deleteSelection: () => void`.
- `+` or `=`: `controller.zoomIn()`.
- `-`: `controller.zoomOut()`.

If adding `deleteSelection`, update `leafer-canvas-types.ts`, adapter, and tests.

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm --filter @mira/web-frontend test -- src/app/image-workspace/image-workspace.test.mjs
```

Expected: toolbar and keyboard tests pass.

## Task 7: Full Frontend Verification

**Files:**

- Verify only unless failures require targeted fixes.

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm --filter @mira/web-frontend test -- src/app/image-workspace/image-workspace.test.mjs
```

Expected: all image workspace source tests pass.

- [ ] **Step 2: Run frontend build**

Run:

```bash
pnpm --filter @mira/web-frontend build
```

Expected: Next build completes successfully and `/image-workspace` appears in the route summary.

- [ ] **Step 3: Run whitespace check**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 4: Run lint and record status**

Run:

```bash
pnpm --filter @mira/web-frontend lint
```

Expected: either passes, or fails only on pre-existing unrelated lint errors. Do not hide failures.

## Task 8: Browser QA And Impeccable Audit

**Files:**

- Verify local app behavior through browser.
- Update docs only if QA discovers plan changes.

- [ ] **Step 1: Start or reuse local frontend**

Run:

```bash
pnpm --filter @mira/web-frontend dev
```

Use an available port if 3000 is busy.

- [ ] **Step 2: Open `/image-workspace`**

Use the in-app browser or Playwright-backed browser tool.

Expected:

- If local auth/backend blocks the page, record that and use a mockable environment or deployed test environment.
- If the page opens, continue interactive checks.

- [ ] **Step 3: Desktop checks**

Verify:

- Canvas is nonblank.
- Toolbar is visible and not clipped.
- Existing or newly uploaded image renders.
- Select, move, scale, rotate, deselect.
- Inspector selection syncs with canvas selection.
- Refresh preserves geometry and viewport.

- [ ] **Step 4: Mobile checks**

Use a mobile viewport and verify:

- Header controls are reachable.
- Canvas stays usable.
- Toolbar does not force page-level horizontal scroll.
- Inspector drawer opens and closes.
- Selected asset controls remain reachable.

- [ ] **Step 5: Impeccable audit pass**

Run detector:

```bash
node /Users/szw/.agents/skills/impeccable/scripts/detect.mjs --json \
  packages/web-frontend/src/app/image-workspace/image-canvas.tsx \
  packages/web-frontend/src/app/image-workspace/components/canvas-toolbar.tsx \
  packages/web-frontend/src/app/image-workspace/leafer-canvas-adapter.ts \
  packages/web-frontend/src/app/globals.css
```

Expected: `[]` or only actionable non-blocking findings documented in final response.

## Task 9: Cleanup And Commit

**Files:**

- Modify: lockfile from `pnpm install`.
- Verify all changed files.

- [ ] **Step 1: Inspect diff**

Run:

```bash
git status --short
git diff -- packages/web-frontend/package.json packages/web-frontend/src/app/image-workspace packages/web-frontend/src/app/globals.css
```

Expected:

- `tldraw` removed.
- Leafer dependencies added.
- tldraw imports gone.
- Adapter boundary present.
- No unrelated visual redesign.

- [ ] **Step 2: Commit**

If the user approves landing and all verification gates are recorded, commit:

```bash
git add packages/web-frontend/package.json pnpm-lock.yaml \
  packages/web-frontend/src/app/image-workspace/image-canvas.tsx \
  packages/web-frontend/src/app/image-workspace/use-canvas-persistence.ts \
  packages/web-frontend/src/app/image-workspace/components/canvas-toolbar.tsx \
  packages/web-frontend/src/app/image-workspace/leafer-canvas-adapter.ts \
  packages/web-frontend/src/app/image-workspace/leafer-canvas-types.ts \
  packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs \
  docs/gstack/2026-06-24-mira-leafer-canvas-frontend-design.md \
  docs/gstack/2026-06-24-mira-leafer-canvas-eng-review.md \
  docs/gstack/2026-06-24-mira-leafer-canvas-impeccable-review.md \
  docs/superpowers/plans/2026-06-24-mira-leafer-canvas-migration.md
git commit -m "feat: migrate image canvas to Leafer"
```

If the earlier task-inspector collapse changes are still uncommitted, ask the user whether to include them in the same commit or commit them separately before staging broad paths.

## Completion Checklist

- [ ] No `tldraw` dependency remains in `packages/web-frontend/package.json`.
- [ ] No image workspace source imports `tldraw`.
- [ ] Leafer packages are MIT-licensed npm packages.
- [ ] Existing backend `CanvasSnapshot` shape is unchanged.
- [ ] Image hydration works.
- [ ] Selection sync works both directions.
- [ ] Persistence debounce and dedupe remain.
- [ ] Toolbar only exposes real working actions.
- [ ] Browser QA passes on desktop and mobile.
- [ ] `impeccable` detector does not report UI anti-patterns.
