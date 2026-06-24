# Mira Leafer Canvas Frontend Design

Date: 2026-06-24

Skill basis:

- `frontend-design`: production-grade product UI direction for a working canvas surface.
- `impeccable` product register: restrained tool UI, familiar affordances, compact states, no decorative complexity.
- Current product context: Mira is a creator workbench, not a landing page or generic image toy.

## 1. Design Brief

Replace the image workspace's tldraw canvas with a Leafer-based canvas while preserving the user's mental model: generated and uploaded images appear on a durable infinite workspace, can be selected, moved, scaled, rotated, edited through the inspector, and saved back to the backend.

This is a canvas engine migration, not a visual redesign. The work should remove tldraw production-license pressure without making the image workspace feel less capable.

## 2. Visual Direction

### Register

Product UI. The interface serves repeated editing work.

### Scene sentence

A creator is arranging generated campaign visuals on a desktop canvas, checking versions in the right inspector, then making quick edits without losing their place.

This points to a restrained, bright workspace with strong canvas affordances, clear selection state, and low-friction controls. The engine should disappear into the work.

### Color strategy

Use the existing Mira tokens in `packages/web-frontend/src/app/globals.css`:

- Base: `--background`, `--surface`, `--surface-muted`, `--surface-raised`.
- Ink and secondary text: `--ink`, `--muted-strong`, `--muted`.
- Accent: `--accent`, `--accent-strong`, `--accent-soft`, `--accent-subtle`.
- Semantic states: `--danger`, `--warning`, `--success`.

No new color system is needed. Leafer objects should render against the existing muted canvas surface. Selection controls should use the existing accent so they match the inspector and toolbar vocabulary.

### Typography

Keep one product UI sans stack. Canvas labels, overlays, empty states, and toolbar tooltips should stay compact at the app's default 13px scale. Do not introduce display fonts or fluid type.

## 3. Layout Strategy

The current page structure stays:

```text
┌──────────────┬────────────────────────────────────┬────────────────────┐
│ workspace    │ Leafer canvas                       │ inspector          │
│ rail         │ toolbar overlays                     │ generation/tasks   │
│              │ selected image objects               │ asset versions     │
└──────────────┴────────────────────────────────────┴────────────────────┘
```

Desktop keeps the three-column grid:

- Left workspace rail.
- Center canvas.
- Right inspector.

Mobile keeps the current single-column structure:

- Header with workspace and inspector buttons.
- Canvas as the primary visible surface.
- Generation/asset controls in the inspector drawer.

The canvas itself should own only canvas interaction and overlays. It should not absorb prompt, task, or asset-version UI.

## 4. Component Model

### `ImageCanvas`

Owns React integration:

- Creates and disposes the Leafer stage.
- Passes workspace data to the adapter.
- Bridges selected asset id between React and the canvas.
- Shows loading and empty-state overlays.
- Renders `CanvasToolbar`.

### `leafer-canvas-adapter.ts`

Owns engine-specific operations:

- Create app/stage/layer/editor instances.
- Hydrate backend `CanvasObject` records into image nodes.
- Remove stale image nodes.
- Select and deselect nodes by Mira asset id.
- Serialize node geometry and viewport to `CanvasSnapshot`.
- Apply saved viewport.
- Fit viewport to content or selection.
- Expose stable events for selection and geometry changes.

This file is the deliberate replacement boundary for tldraw-specific code. No other component should import Leafer types directly unless it is part of the canvas implementation.

### `use-leafer-canvas-persistence.ts`

Owns persistence timing:

- Listen to adapter-level geometry and viewport changes.
- Serialize snapshots through adapter methods.
- Debounce saves using the existing 700ms behavior.
- Avoid saving identical snapshots.
- Clean up timers on unmount or workspace switch.

### `CanvasToolbar`

Keeps the same user-facing role but switches from tldraw editor methods to a small generic canvas controller.

Initial buttons:

- Select.
- Pan.
- Undo.
- Redo.
- Zoom out.
- Zoom in.
- Fit view.

The current tldraw-only frame tool should be removed in the first Leafer version unless implemented as a real Leafer feature. A visible button that does not map to working behavior would be worse than losing the button.

### `image-workspace.test.mjs`

Keeps source-level guardrails, rewritten from tldraw-specific assertions to Leafer-specific assertions:

- `tldraw` must not be imported.
- `leafer-ui` and `leafer-editor` must be present.
- The adapter boundary must exist.
- Backend snapshot shape must be preserved.
- Selection, stale-node cleanup, viewport, persistence debounce, and toolbar actions must remain covered.

## 5. Interaction Flow

### Open Workspace

1. The shell passes `activeWorkspace` into `ImageCanvas`.
2. `ImageCanvas` mounts the Leafer view only after the browser can provide real dimensions.
3. The adapter creates a stage and hydrates all visible image objects.
4. Saved viewport is applied when present.
5. Loading overlay disappears.

### Generate Or Upload

1. Backend creates or updates workspace assets and canvas objects.
2. The frontend reloads or receives stream events as it does today.
3. Adapter compares object ids with current nodes.
4. New objects become image nodes; deleted assets remove stale nodes.

### Select

1. User selects an image node on canvas.
2. Adapter emits the Mira asset id.
3. React updates `selectedAssetId`.
4. Inspector shows the selected asset version panel.

### Select From Inspector

1. User selects an asset thumbnail in the inspector.
2. React passes `selectedAssetId` to `ImageCanvas`.
3. Adapter selects the matching canvas node.
4. If `selectedAssetId` is null, adapter clears selection without reselecting the first asset.

### Persist

1. User moves, scales, rotates, deletes, or changes viewport.
2. Adapter emits a dirty event.
3. Persistence hook serializes `CanvasSnapshot`.
4. Hook debounces and saves through the existing `onPersistCanvas`.

## 6. Key States

- Loading workspace.
- Empty workspace with no objects.
- Workspace with hydrated images.
- Selected image.
- No selection.
- Persistence in progress, implicit and non-blocking.
- Canvas initialization failure with a user-readable message.

## 7. UI Detail Requirements

- Canvas container keeps `h-full w-full overflow-hidden bg-[var(--surface-muted)]`.
- Loading/empty overlay uses existing tokenized border and surface styling.
- Toolbar remains bottom-centered and horizontally scrollable on small widths.
- Toolbar buttons keep icon-only controls with `aria-label` and `title`.
- Focus style remains the global button focus ring; text inputs remain outline-free per existing app convention.
- Touch targets should be at least 36px in the compact desktop toolbar and easy to hit on mobile. If mobile testing shows misses, increase to 40px for canvas controls only.
- No nested cards, no glass effects, no decorative gradients, no custom color ramps.

## 8. Accessibility

Leafer canvas content is not inherently semantic, so surrounding controls must carry the accessible contract:

- Canvas region gets a descriptive `aria-label`, for example `图像画布`.
- Toolbar buttons expose names through `aria-label`.
- Active tool state uses `aria-pressed`.
- Disabled undo/redo use disabled buttons.
- Keyboard support for minimum viable editing:
  - `Delete` or `Backspace`: delete selected image node if a selected Mira object exists.
  - `Escape`: clear selection.
  - `+` / `-`: zoom in/out when the canvas area is focused.
- Canvas wrapper should be focusable with `tabIndex={0}`.

## 9. Motion

Keep motion functional:

- Selection affordance updates immediately.
- Zoom/fit can animate at 150-220ms if Leafer exposes a smooth viewport API.
- Respect `prefers-reduced-motion` by making fit/zoom instant when the user requests reduced motion.

## 10. Non-Goals

- Rebuilding tldraw's full editor feature set.
- Multi-user collaboration.
- Text, shape, pen, connector, or frame tools in the first migration.
- Backend schema changes.
- Migrating existing persisted canvas data.
- Introducing a React Leafer wrapper package that is not available on npm.

## 11. Success Criteria

1. `tldraw` is no longer a dependency of `@mira/web-frontend`.
2. `leafer-ui` and `leafer-editor` or the specific Leafer plugin packages are installed with MIT licenses.
3. Existing image workspace records render without migration.
4. Images can be selected, moved, scaled, rotated, deleted, and saved.
5. Refreshing the page restores image geometry and viewport.
6. Inspector selection and canvas selection stay in sync.
7. Mobile keeps workspace and inspector controls reachable.
8. The UI remains visually consistent with the current Mira product system.
