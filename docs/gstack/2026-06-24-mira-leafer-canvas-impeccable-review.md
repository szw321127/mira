# Mira Leafer Canvas Impeccable Review

Date: 2026-06-24

Target reviewed:

- Current canvas: `packages/web-frontend/src/app/image-workspace/image-canvas.tsx`
- Current toolbar: `packages/web-frontend/src/app/image-workspace/components/canvas-toolbar.tsx`
- Shell: `packages/web-frontend/src/app/image-workspace/image-workspace-shell.tsx`
- Tokens: `packages/web-frontend/src/app/globals.css`
- Planned migration design: `docs/gstack/2026-06-24-mira-leafer-canvas-frontend-design.md`
- Engineering review: `docs/gstack/2026-06-24-mira-leafer-canvas-eng-review.md`

Review basis:

- Product register from `PRODUCT.md`.
- `impeccable` product-register guidance for restrained tool UI.
- Deterministic detector:
  `node /Users/szw/.agents/skills/impeccable/scripts/detect.mjs --json packages/web-frontend/src/app/image-workspace/image-canvas.tsx packages/web-frontend/src/app/image-workspace/components/canvas-toolbar.tsx packages/web-frontend/src/app/image-workspace/image-workspace-shell.tsx packages/web-frontend/src/app/globals.css`

Detector result:

```json
[]
```

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|---:|---:|---|
| 1 | Accessibility | 3 | Existing toolbar has labels, but the canvas region needs explicit focus and keyboard controls after the Leafer migration. |
| 2 | Performance | 3 | Current persistence is debounced; Leafer migration must preserve dedupe and avoid remounting on every workspace update. |
| 3 | Responsive Design | 3 | Shell already has desktop/mobile structure; canvas controls need mobile touch verification after engine swap. |
| 4 | Theming | 4 | Existing tokens are strong and should be reused without new hard-coded canvas colors. |
| 5 | Anti-Patterns | 4 | Detector found no AI-slop tells in the target files. |
| **Total** | **17/20** | **Good baseline, migration needs focused a11y and interaction hardening.** |

## Anti-Patterns Verdict

The target surface does not look AI-generated. It uses a conventional product workspace layout, compact icon toolbar, tokenized surfaces, and restrained color. There are no detected gradient text, glass cards, side-stripe accents, oversized rounded panels, nested decorative cards, or marketing scaffolds.

The main risk is not visual slop. The risk is a "nearly working canvas" that loses expected editor affordances after replacing tldraw. For product UI, a missing selection handle, broken keyboard delete, or fake undo button is more damaging than a bland palette.

## Required UX Constraints For Migration

1. **Keep visible UI in React/Tailwind.** Let Leafer render images and transforms. Toolbar, empty/loading state, errors, and inspector integration should stay in the app's existing component vocabulary.
2. **No fake tools.** Remove or disable tools that are not implemented. The current frame tool should not survive the migration unless there is a real Leafer equivalent.
3. **Make selection unambiguous.** Selected images need a clear visual state and inspector sync. If Leafer editor handles are visually weak or mismatched, add a minimal React overlay or configure the editor handles.
4. **Preserve compactness.** The canvas area should not gain big instructional cards, oversized controls, or hero-like empty states.
5. **Keyboard matters.** The focusable canvas wrapper should support escape, delete/backspace, and zoom shortcuts.
6. **Mobile is not optional.** The toolbar must remain reachable, not cover essential selected-object handles, and not force horizontal page scroll.

## Detailed Findings

### P1: Canvas accessibility contract must be added during migration

Location: planned `ImageCanvas` and Leafer wrapper.

Category: Accessibility.

Impact: A raw canvas without a focusable region and keyboard controls becomes mouse-only. Users cannot clear selection, delete selected images, or zoom without pointer precision.

Recommendation: Add `role="application"` only if keyboard controls are comprehensive; otherwise prefer a focusable region with `aria-label="图像画布"`. Support Escape, Delete/Backspace, plus/minus. Keep toolbar buttons as the primary accessible controls.

Suggested command: `$impeccable harden packages/web-frontend/src/app/image-workspace/image-canvas.tsx`

### P1: Toolbar must reflect actual controller capability

Location: `components/canvas-toolbar.tsx`.

Category: Accessibility / Product consistency.

Impact: A visible enabled tool that does not work breaks trust and creates repeated failed interactions.

Recommendation: Replace the tldraw `Editor` prop with an app-owned controller. Remove the frame tool in first Leafer version. Disable undo/redo until actual history support is verified.

Suggested command: `$impeccable clarify packages/web-frontend/src/app/image-workspace/components/canvas-toolbar.tsx`

### P2: Selection affordance needs visual QA

Location: Leafer editor configuration.

Category: Responsive / Interaction.

Impact: If selection handles are too small, low-contrast, or hidden under the toolbar, users will think generated images are static.

Recommendation: In browser QA, verify selected state at desktop and mobile widths. If needed, tune Leafer editor handle colors to existing accent tokens and keep touch handles usable.

Suggested command: `$impeccable audit packages/web-frontend/src/app/image-workspace/image-canvas.tsx`

### P2: Persistence should not become noisy

Location: planned persistence hook.

Category: Performance.

Impact: Canvas engines emit frequent interaction events. Saving on every pointer movement can flood the backend and make dragging feel sticky.

Recommendation: Keep the 700ms debounce and JSON snapshot dedupe. Trigger saves from stable geometry/viewport events, not from broad every-frame render events.

Suggested command: `$impeccable optimize packages/web-frontend/src/app/image-workspace/use-canvas-persistence.ts`

### P3: Empty/loading copy should stay task-focused

Location: `ImageCanvas` overlay.

Category: UX copy.

Impact: The current overlay is terse and fine. Replacing it with explanatory copy would add clutter to a work surface.

Recommendation: Keep short copy such as `正在加载图像画布` and `创建一个图像工作区后开始`.

Suggested command: `$impeccable clarify packages/web-frontend/src/app/image-workspace/image-canvas.tsx`

## Positive Findings

- The shell already separates workspace rail, canvas, and inspector cleanly.
- Current global tokens have enough semantic vocabulary for the migration.
- The toolbar uses lucide icons and accessible labels, matching the app's existing button vocabulary.
- Current source tests already guard many behaviors that should be kept: hydration, stale object removal, selection sync, persistence, and mobile reachability.

## Recommended Actions

1. **P1 `$impeccable harden`**: Add focus, keyboard, and state semantics to the Leafer canvas wrapper.
2. **P1 `$impeccable clarify`**: Make toolbar controls match real Leafer capabilities, especially frame and undo/redo.
3. **P2 `$impeccable optimize`**: Preserve debounced persistence and avoid noisy saves.
4. **P2 `$impeccable audit`**: After implementation, run browser QA on desktop and mobile before shipping.
5. **Final `$impeccable polish`**: Do a focused visual pass only after the engine migration is functional.

## Release Gate

Do not ship the migration only because the build passes. The visible behavior must be checked in browser:

- Canvas renders nonblank.
- Image selection is clear.
- Move/scale/rotate works.
- Inspector selection sync works both ways.
- Refresh preserves geometry.
- Mobile toolbar and drawers remain usable.
