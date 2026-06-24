# Engineering Review: Mira Leafer Canvas Migration

Date: 2026-06-24

Review basis:

- Existing implementation under `packages/web-frontend/src/app/image-workspace/`.
- Current backend `CanvasSnapshot` shape in `types.ts`.
- Current tldraw integration in `image-canvas.tsx`, `use-canvas-persistence.ts`, and `components/canvas-toolbar.tsx`.
- npm package facts checked on 2026-06-24:
  - `leafer-ui@2.1.8`, MIT.
  - `leafer-editor@2.1.8`, MIT.
  - `@leafer-in/editor@2.1.8`, MIT.
  - `@leafer-in/react` was not found on npm and must not be used as a dependency.

## Architecture Decision

Use Leafer as an imperative canvas engine behind a local adapter boundary. Keep React responsible for app state and panels; keep the backend snapshot contract unchanged.

```text
ImageWorkspaceShell
  └─ ImageCanvas
      ├─ CanvasToolbar
      ├─ useLeaferCanvasPersistence
      └─ LeaferCanvasAdapter
          ├─ Leafer app/stage/layer/editor
          ├─ Mira object id -> image node
          ├─ Mira asset id -> selected node
          └─ CanvasSnapshot serializer
```

## Why This Shape

The current backend already stores a generic `CanvasSnapshot`:

```ts
type CanvasSnapshot = {
  viewport: { x: number; y: number; zoom: number } | null;
  objects: Array<{
    id: string;
    assetId: string | null;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    zIndex: number;
    props: Record<string, unknown>;
  }>;
};
```

That means no backend migration is required. The frontend only needs an engine adapter that can hydrate and serialize this shape.

## Data Flow

```text
backend workspace
  ├─ assets[]
  ├─ objects[]
  └─ viewport
      │
      ▼
ImageCanvas receives workspace
      │
      ▼
adapter.hydrateWorkspace(workspace)
      ├─ create/update Leafer image nodes
      ├─ remove nodes whose object id disappeared
      ├─ attach miraObjectId, miraAssetId, miraVersionId metadata
      └─ apply viewport
      │
      ▼
user edits canvas
      │
      ▼
adapter emits change
      │
      ▼
useLeaferCanvasPersistence serializes + debounces
      │
      ▼
workspace.persistCanvas(snapshot)
```

## Files To Touch

### Frontend dependencies

- Modify `packages/web-frontend/package.json`
  - Remove `tldraw`.
  - Add `leafer-ui`.
  - Add `leafer-editor` unless implementation proves the smaller plugin set is enough.

### Canvas implementation

- Replace `packages/web-frontend/src/app/image-workspace/image-canvas.tsx`
  - Remove tldraw imports and CSS.
  - Use local Leafer adapter.
  - Keep public component props unchanged.

- Replace `packages/web-frontend/src/app/image-workspace/use-canvas-persistence.ts`
  - Either rename to `use-leafer-canvas-persistence.ts` or keep the filename if that reduces churn.
  - Remove tldraw `Editor` and `TLShape` types.
  - Serialize through adapter/controller API.

- Modify `packages/web-frontend/src/app/image-workspace/components/canvas-toolbar.tsx`
  - Replace tldraw `Editor` prop with a generic `CanvasController`.
  - Remove the tldraw frame tool unless implemented.

- Create `packages/web-frontend/src/app/image-workspace/leafer-canvas-adapter.ts`
  - Own all Leafer imports and type-specific operations.

- Optionally create `packages/web-frontend/src/app/image-workspace/leafer-canvas-types.ts`
  - Export a small app-owned `CanvasController` interface so toolbar and persistence do not depend on Leafer package types.

### Tests

- Modify `packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs`
  - Rewrite tldraw-specific source assertions to Leafer adapter assertions.
  - Add guard that no image-workspace source imports `tldraw`.
  - Add guard that package dependency no longer includes `tldraw`.

## Adapter Contract

The app-owned controller should expose only what the rest of the UI needs:

```ts
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
```

Events:

```ts
type CanvasControllerEvents = {
  onChange: () => void;
  onSelectAsset: (assetId: string | null) => void;
  onReady: () => void;
  onError: (message: string) => void;
};
```

## Compatibility Notes

### Viewport

tldraw stores camera as `{ x, y, z }`. Mira stores `{ x, y, zoom }`.

Leafer adapter should map the currently visible viewport into the same Mira shape. If Leafer uses stage `x`, `y`, and `scale`, the adapter owns that translation. No other file should know the engine-specific viewport field names.

### Object ids

The current tldraw shape id derives from `mira-${object.id}`. Leafer nodes should store the original `object.id` in app metadata and, where useful, use a deterministic node id string derived from it. Backend object ids must not be regenerated on every hydrate.

### Image source

Continue using same-origin `createImageAssetPreviewUrl(asset.id)`. Do not expose storage keys or signed provider URLs in the canvas source.

### Selection

Keep the current behavior:

- Select a canvas node -> inspector selected asset updates.
- Select an inspector asset -> canvas node selected.
- Clear selection -> inspector clears.
- Missing matching object -> no fallback selection.

### Undo/Redo

Leafer editor plugin should be evaluated for built-in undo/redo support. If reliable undo/redo is not available through the MIT packages, first implementation should:

1. Disable undo/redo buttons with accurate labels.
2. Track undo/redo as a follow-up task.

Do not show enabled undo/redo buttons that do nothing.

## Edge Cases

| Case | Required behavior |
|---|---|
| Workspace is null | Show the existing empty overlay and no engine instance. |
| Workspace switches | Dispose old engine, clear timers, create new instance. |
| Image version changes | Update existing node image source and dimensions. |
| Asset deleted | Remove stale node from the canvas. |
| Selected asset deleted | Clear selection. |
| Empty backend objects after existing local objects | Keep existing guard in `shouldPersistCanvasSnapshot` so transient empty autosaves do not wipe saved objects. |
| Image load fails | Keep node metadata, show unobtrusive canvas error, allow workspace reload. |
| Mobile drawer opens | Canvas should keep size stable and not remount unnecessarily. |
| Browser tab throttles animation frames | Keep the existing timer fallback pattern for readiness. |

## Test Plan

### Source-level tests

Use the existing Node test style in `image-workspace.test.mjs`:

- `image canvas is backed by Leafer and keeps an explicit canvas size`.
- `image canvas does not import tldraw`.
- `image canvas hydrates backend image assets into Leafer image nodes`.
- `image canvas removes stale Mira image nodes after backend asset deletion`.
- `image canvas selection updates the selected Mira asset`.
- `image canvas persists Leafer geometry and viewport through backend snapshots`.
- `image canvas toolbar targets the app-owned canvas controller`.

### Build tests

```bash
pnpm --filter @mira/web-frontend test -- src/app/image-workspace/image-workspace.test.mjs
pnpm --filter @mira/web-frontend build
git diff --check
```

Run lint, but record existing unrelated lint errors if still present:

```bash
pnpm --filter @mira/web-frontend lint
```

### Browser checks

With a working local backend/session or a mockable local environment:

1. Open `/image-workspace`.
2. Confirm the canvas renders and is not blank.
3. Generate or upload one image.
4. Move, scale, rotate, select, deselect.
5. Refresh and verify geometry persists.
6. Verify inspector selection sync.
7. Test mobile viewport and inspector drawer.

## Risks

### P1: Leafer API mismatch

The package names and MIT license are verified, but the exact editor/viewport APIs must be confirmed during implementation. Mitigation: build adapter behind tests, keep first feature set small, and avoid exposing Leafer types across the app.

### P1: Losing editor affordances

tldraw provided many behaviors by default. Leafer may require more explicit code for selection handles, transform controls, keyboard actions, and history. Mitigation: scope first migration to image editing essentials and disable unsupported toolbar actions instead of pretending they work.

### P2: Persistence storms

Dragging and viewport changes can emit many events. Mitigation: preserve the 700ms debounce and snapshot JSON dedupe.

### P2: Visual regression

Leafer's canvas controls may not match the rest of the app by default. Mitigation: keep all visible chrome in React/Tailwind and use Leafer mostly for the central object surface.

## Recommendation

Proceed with the migration, but treat it as an engine adapter replacement rather than a rewrite of the image workspace. The plan should land in small, verifiable tasks:

1. Dependency and test guardrails.
2. Adapter skeleton and component wiring.
3. Hydration and selection.
4. Persistence and viewport.
5. Toolbar and keyboard controls.
6. Browser QA and cleanup.
