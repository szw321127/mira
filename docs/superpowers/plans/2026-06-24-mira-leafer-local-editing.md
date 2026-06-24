# Mira Leafer Local Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move mask drawing into the Leafer canvas and add a click-to-mark, resizable local-edit flow for regenerating a selected part of an image.

**Architecture:** Extend the Leafer canvas controller with transient local-edit overlay state, then let the inspector submit edits by asking the canvas to export a mask data URL. The backend remains unchanged because local edits still upload a mask and create the existing image edit task with `maskId`.

**Tech Stack:** Next.js App Router, React, Tailwind CSS, Leafer UI, Leafer Editor, existing Mira image workspace APIs.

---

### Task 1: Extend Canvas Controller Contract And Structure Tests

**Files:**
- Modify: `packages/web-frontend/src/app/image-workspace/leafer-canvas-types.ts`
- Modify: `packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs`

- [ ] **Step 1: Write failing structure tests**

Add tests to `image-workspace.test.mjs`:

```js
test("image canvas controller supports Leafer mask and marker tools", () => {
  const typesSource = readImageWorkspaceFile("leafer-canvas-types.ts");
  const toolbarSource = readImageWorkspaceFile("components/canvas-toolbar.tsx");
  const adapterSource = readImageWorkspaceFile("leafer-canvas-adapter.ts");

  assert.match(typesSource, /"mask"/);
  assert.match(typesSource, /"marker"/);
  assert.match(typesSource, /exportLocalEditMask/);
  assert.match(typesSource, /clearLocalEditOverlay/);
  assert.match(toolbarSource, /Brush/);
  assert.match(toolbarSource, /MapPin/);
  assert.match(toolbarSource, /controller\.setTool\("mask"\)/);
  assert.match(toolbarSource, /controller\.setTool\("marker"\)/);
  assert.match(adapterSource, /maskLayer/);
  assert.match(adapterSource, /markerLayer/);
});
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
pnpm --filter @mira/web-frontend test -- src/app/image-workspace/image-workspace.test.mjs
```

Expected: FAIL because `mask`, `marker`, `exportLocalEditMask`, and overlay layers are not implemented yet.

- [ ] **Step 3: Extend controller types**

Update `leafer-canvas-types.ts`:

```ts
export type CanvasTool = "select" | "pan" | "mask" | "marker";

export type LocalEditMaskExportInput = {
  assetId: string;
  versionId: string;
  width: number;
  height: number;
};

export type LocalEditMaskExportResult = {
  dataUrl: string | null;
  source: "mask" | "marker" | null;
};
```

Add methods to `CanvasController`:

```ts
  clearLocalEditOverlay: () => void;
  exportLocalEditMask: (
    input: LocalEditMaskExportInput,
  ) => LocalEditMaskExportResult;
  getLocalEditOverlayState: () => {
    assetId: string | null;
    dirty: boolean;
    source: "mask" | "marker" | null;
  };
```

- [ ] **Step 4: Run type-focused test again**

Run:

```bash
pnpm --filter @mira/web-frontend test -- src/app/image-workspace/image-workspace.test.mjs
```

Expected: still FAIL, now because toolbar and adapter have not implemented the new tools.

### Task 2: Add Toolbar Controls For Mask And Marker

**Files:**
- Modify: `packages/web-frontend/src/app/image-workspace/components/canvas-toolbar.tsx`
- Test: `packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs`

- [ ] **Step 1: Implement toolbar buttons**

Import icons:

```ts
import {
  Brush,
  Hand,
  MapPin,
  Maximize2,
  MousePointer2,
  Redo2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
```

Add buttons after pan:

```ts
    {
      active: activeTool === "mask",
      icon: Brush,
      label: "蒙版",
      onClick: () => controller.setTool("mask"),
    },
    {
      active: activeTool === "marker",
      icon: MapPin,
      label: "标记局部",
      onClick: () => controller.setTool("marker"),
    },
```

- [ ] **Step 2: Run structure test**

Run:

```bash
pnpm --filter @mira/web-frontend test -- src/app/image-workspace/image-workspace.test.mjs
```

Expected: still FAIL until adapter has `maskLayer` and `markerLayer`.

### Task 3: Implement Leafer Local Edit Overlay

**Files:**
- Modify: `packages/web-frontend/src/app/image-workspace/leafer-canvas-adapter.ts`
- Test: `packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs`

- [ ] **Step 1: Add overlay layers and transient state**

Inside `createLoadedLeaferCanvasController`, add two Leafer groups:

```ts
  const maskLayer = new Group({ x: 0, y: 0 }) as IGroup;
  const markerLayer = new Group({ x: 0, y: 0 }) as IGroup;
  app.tree.add(maskLayer);
  app.tree.add(markerLayer);
```

Add transient state:

```ts
  let activeMaskAssetId: string | null = null;
  let maskStrokes: Array<{ assetId: string; points: Array<{ x: number; y: number }> }> = [];
  let currentMaskStroke: Array<{ x: number; y: number }> | null = null;
  let marker: {
    assetId: string;
    center: { x: number; y: number };
    radius: number;
  } | null = null;
```

- [ ] **Step 2: Add helper functions**

Add helpers near the bottom:

```ts
function isLocalEditTool(tool: CanvasTool) {
  return tool === "mask" || tool === "marker";
}
```

Inside the controller closure, implement:

```ts
  const clearLocalEditOverlay = () => {
    activeMaskAssetId = null;
    maskStrokes = [];
    currentMaskStroke = null;
    marker = null;
    maskLayer.removeAll();
    markerLayer.removeAll();
    emitChange();
  };
```

Also add a helper that clears overlays when selected asset changes:

```ts
  const clearLocalEditIfAssetChanged = (assetId: string | null) => {
    const activeOverlayAssetId = marker?.assetId ?? activeMaskAssetId;
    if (activeOverlayAssetId && activeOverlayAssetId !== assetId) {
      clearLocalEditOverlay();
    }
  };
```

- [ ] **Step 3: Handle pointer events for mask mode**

Update pointer handlers:

```ts
  const handlePointerDown = (event: unknown) => {
    if (activeTool === "mask") {
      const selectedNode = readSelectedNode();
      const pointer = readPointer(event);
      if (!selectedNode || !pointer) return;
      activeMaskAssetId = selectedNode.__mira?.miraAssetId ?? null;
      if (!activeMaskAssetId) return;
      currentMaskStroke = [toImageLocalPoint(selectedNode, pointer)];
      renderMaskOverlay();
      return;
    }
    if (activeTool === "marker") {
      const selectedNode = readSelectedNode();
      const pointer = readPointer(event);
      if (!selectedNode || !pointer) return;
      const assetId = selectedNode.__mira?.miraAssetId;
      if (!assetId) return;
      marker = {
        assetId,
        center: toImageLocalPoint(selectedNode, pointer),
        radius: 96,
      };
      renderMarkerOverlay();
      emitChange();
      return;
    }
    if (activeTool !== "pan") return;
    // existing pan code remains
  };
```

Add `handlePointerMove` support:

```ts
  if (activeTool === "mask" && currentMaskStroke) {
    const selectedNode = readSelectedNode();
    const pointer = readPointer(event);
    if (!selectedNode || !pointer) return;
    currentMaskStroke.push(toImageLocalPoint(selectedNode, pointer));
    renderMaskOverlay();
    return;
  }
```

Add `handlePointerUp` support:

```ts
  if (currentMaskStroke && activeMaskAssetId) {
    maskStrokes = [
      ...maskStrokes,
      { assetId: activeMaskAssetId, points: currentMaskStroke },
    ];
    currentMaskStroke = null;
    emitChange();
    return;
  }
```

- [ ] **Step 4: Render overlays**

Use Leafer `Path` or `Rect`/`Ellipse` imports from dynamic `leafer-ui`. If `Path`
is unavailable in local typings, use `Ellipse` circles for each mask point and
marker circle.

Implement:

```ts
  const renderMaskOverlay = () => {
    maskLayer.removeAll();
    const selectedNode = readSelectedNode();
    const assetId = selectedNode?.__mira?.miraAssetId;
    const strokes = [
      ...maskStrokes.filter((stroke) => stroke.assetId === assetId),
      ...(currentMaskStroke && assetId
        ? [{ assetId, points: currentMaskStroke }]
        : []),
    ];
    for (const stroke of strokes) {
      for (const point of stroke.points) {
        maskLayer.add(
          new Ellipse({
            fill: "rgba(225,29,72,0.46)",
            height: 34,
            width: 34,
            x: selectedNode.x + point.x - 17,
            y: selectedNode.y + point.y - 17,
          }),
        );
      }
    }
  };
```

Implement marker rendering:

```ts
  const renderMarkerOverlay = () => {
    markerLayer.removeAll();
    const selectedNode = readSelectedNode();
    if (!marker || !selectedNode || selectedNode.__mira?.miraAssetId !== marker.assetId) {
      return;
    }
    markerLayer.add(
      new Ellipse({
        editable: true,
        fill: "rgba(59,130,246,0.16)",
        height: marker.radius * 2,
        stroke: "#2563eb",
        strokeWidth: 2,
        width: marker.radius * 2,
        x: selectedNode.x + marker.center.x - marker.radius,
        y: selectedNode.y + marker.center.y - marker.radius,
      }),
    );
  };
```

- [ ] **Step 5: Export source-sized mask**

Implement `exportLocalEditMask` inside the controller:

```ts
    exportLocalEditMask: ({ assetId, width, height }) => {
      const relevantStrokes = maskStrokes.filter((stroke) => stroke.assetId === assetId);
      const relevantMarker = marker?.assetId === assetId ? marker : null;
      if (!relevantStrokes.length && !relevantMarker) {
        return { dataUrl: null, source: null };
      }

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const context = canvas.getContext("2d");
      if (!context) return { dataUrl: null, source: null };

      context.fillStyle = "rgba(0,0,0,1)";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.globalCompositeOperation = "destination-out";

      if (relevantStrokes.length) {
        context.lineCap = "round";
        context.lineJoin = "round";
        context.lineWidth = 34;
        for (const stroke of relevantStrokes) {
          context.beginPath();
          stroke.points.forEach((point, index) => {
            if (index === 0) context.moveTo(point.x, point.y);
            else context.lineTo(point.x, point.y);
          });
          context.stroke();
        }
        return { dataUrl: canvas.toDataURL("image/png"), source: "mask" };
      }

      if (relevantMarker) {
        context.beginPath();
        context.arc(
          relevantMarker.center.x,
          relevantMarker.center.y,
          relevantMarker.radius,
          0,
          Math.PI * 2,
        );
        context.fill();
        return { dataUrl: canvas.toDataURL("image/png"), source: "marker" };
      }

      return { dataUrl: null, source: null };
    },
```

- [ ] **Step 6: Wire controller methods**

Add methods to the controller object:

```ts
    clearLocalEditOverlay,
    getLocalEditOverlayState: () => ({
      assetId: marker?.assetId ?? activeMaskAssetId,
      dirty: maskStrokes.length > 0 || Boolean(marker),
      source: maskStrokes.length > 0 ? "mask" : marker ? "marker" : null,
    }),
```

Update `setTool`:

```ts
      if (tool === "pan" || isLocalEditTool(tool)) applySelectionToEditor(null);
```

If selection cancellation prevents mask/marker targeting, instead keep editor
selection and only make image nodes non-editable while local edit tools are
active.

- [ ] **Step 7: Run tests**

Run:

```bash
pnpm --filter @mira/web-frontend test -- src/app/image-workspace/image-workspace.test.mjs
```

Expected: PASS for structure tests.

### Task 4: Connect Canvas Controller To Inspector Submission

**Files:**
- Modify: `packages/web-frontend/src/app/image-workspace/image-canvas.tsx`
- Modify: `packages/web-frontend/src/app/image-workspace/image-workspace-shell.tsx`
- Modify: `packages/web-frontend/src/app/image-workspace/components/inspector-panel.tsx`
- Modify: `packages/web-frontend/src/app/image-workspace/components/asset-version-panel.tsx`
- Test: `packages/web-frontend/src/app/image-workspace/image-workspace.test.mjs`

- [ ] **Step 1: Add failing structure test**

Add:

```js
test("local image edits export masks from the Leafer canvas before edit task creation", () => {
  const shellSource = readImageWorkspaceFile("image-workspace-shell.tsx");
  const panelSource = readImageWorkspaceFile("components/asset-version-panel.tsx");
  const inspectorSource = readImageWorkspaceFile("components/inspector-panel.tsx");
  const canvasSource = readImageWorkspaceFile("image-canvas.tsx");

  assert.match(shellSource, /canvasControllerRef/);
  assert.match(shellSource, /exportLocalEditMask/);
  assert.match(shellSource, /onUploadMask\(/);
  assert.match(shellSource, /onEditAsset\(/);
  assert.match(shellSource, /clearLocalEditOverlay/);
  assert.match(panelSource, /局部重绘/);
  assert.match(panelSource, /onSubmitLocalEdit/);
  assert.doesNotMatch(panelSource, /maskCanvasRef/);
  assert.doesNotMatch(panelSource, /aria-label="绘制蒙版"/);
  assert.match(inspectorSource, /onSubmitLocalEdit/);
  assert.match(canvasSource, /onControllerReady/);
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
pnpm --filter @mira/web-frontend test -- src/app/image-workspace/image-workspace.test.mjs
```

Expected: FAIL because shell and panel do not yet use canvas controller export.

- [ ] **Step 3: Expose controller from ImageCanvas**

Add prop:

```ts
  onControllerReady?: (controller: CanvasController | null) => void;
```

Call it when controller changes:

```ts
  useEffect(() => {
    onControllerReady?.(controller);
    return () => onControllerReady?.(null);
  }, [controller, onControllerReady]);
```

- [ ] **Step 4: Store controller in shell**

In `image-workspace-shell.tsx`, import `useCallback` and `useRef`, and store:

```ts
  const canvasControllerRef = useRef<CanvasController | null>(null);
```

Pass:

```tsx
          onControllerReady={(nextController) => {
            canvasControllerRef.current = nextController;
          }}
```

- [ ] **Step 5: Implement local edit submit in shell**

Add:

```ts
  const submitLocalEdit = useCallback(
    async (assetId: string, versionId: string, prompt: string) => {
      const controller = canvasControllerRef.current;
      const version = currentVersion;
      let maskId: string | undefined;
      if (controller && version && version.id === versionId) {
        const exported = controller.exportLocalEditMask({
          assetId,
          versionId,
          width: Math.max(1, version.width),
          height: Math.max(1, version.height),
        });
        if (exported.dataUrl) {
          maskId = (await onUploadMask(assetId, exported.dataUrl)).maskId;
        }
      }
      await onEditAsset(assetId, prompt, maskId);
      controller?.clearLocalEditOverlay();
    },
    [currentVersion, onEditAsset, onUploadMask],
  );
```

- [ ] **Step 6: Pass local edit submit through inspector**

Add `onSubmitLocalEdit` prop to `InspectorPanel` and `AssetVersionPanel`:

```ts
  onSubmitLocalEdit: (
    assetId: string,
    versionId: string,
    prompt: string,
  ) => Promise<void> | void;
```

- [ ] **Step 7: Remove right-panel mask canvas**

In `asset-version-panel.tsx`:

- Remove `maskCanvasRef`, pointer handlers, `createEditableMaskDataUrl`, and the
  embedded `<canvas aria-label="绘制蒙版" />`.
- Rename the edit form heading/copy to `局部重绘`.
- Submit through `onSubmitLocalEdit(selectedAsset.id, currentVersion.id, prompt)`.
- Keep local prompt error handling and existing action buttons.

- [ ] **Step 8: Run tests**

Run:

```bash
pnpm --filter @mira/web-frontend test -- src/app/image-workspace/image-workspace.test.mjs
```

Expected: PASS for local edit structure.

### Task 5: Verify Build And Manual UX

**Files:**
- No new files.

- [ ] **Step 1: Run focused tests**

Run:

```bash
pnpm --filter @mira/web-frontend test -- src/app/image-workspace/image-workspace.test.mjs
```

Expected: all image workspace tests pass.

- [ ] **Step 2: Run lint**

Run:

```bash
pnpm --filter @mira/web-frontend lint -- src/app/image-workspace/image-canvas.tsx src/app/image-workspace/leafer-canvas-adapter.ts src/app/image-workspace/leafer-canvas-types.ts src/app/image-workspace/image-workspace-shell.tsx src/app/image-workspace/components/canvas-toolbar.tsx src/app/image-workspace/components/inspector-panel.tsx src/app/image-workspace/components/asset-version-panel.tsx src/app/image-workspace/image-workspace.test.mjs
```

Expected: lint exits 0.

- [ ] **Step 3: Run frontend build**

Run:

```bash
pnpm --filter @mira/web-frontend build
```

Expected: Next.js production build exits 0.

- [ ] **Step 4: Manual local check when browser/server access is available**

Start frontend/backend normally, open `/image-workspace`, select an image, choose
`标记局部`, click the image, enter a prompt, and verify that a task is created.

Expected: the marker appears on the canvas, the task enters queued/running state,
and no raw tool or provider payload appears in the UI.

---

## Self-Review Notes

- Spec coverage: mask tool, marker tool, source-sized export, existing `maskId`
  flow, and right-panel simplification are all covered.
- Type consistency: the controller methods are named `exportLocalEditMask`,
  `clearLocalEditOverlay`, and `getLocalEditOverlayState` throughout the plan.
- Scope: backend stays unchanged; multi-region and persisted annotation history
  remain out of scope.
