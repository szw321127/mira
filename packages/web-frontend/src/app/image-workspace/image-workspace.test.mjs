import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workspaceDir = dirname(fileURLToPath(import.meta.url));
const appDir = join(workspaceDir, "..");
const packageDir = join(workspaceDir, "..", "..", "..");

function readImageWorkspaceFile(fileName) {
  const filePath = join(workspaceDir, fileName);
  assert.equal(existsSync(filePath), true, `${fileName} should exist`);
  return readFileSync(filePath, "utf8");
}

function readAppFile(relativePath) {
  const filePath = join(appDir, relativePath);
  assert.equal(existsSync(filePath), true, `${relativePath} should exist`);
  return readFileSync(filePath, "utf8");
}

test("image workspace page is gated behind the existing email session", () => {
  const pageSource = readImageWorkspaceFile("page.tsx");

  assert.match(pageSource, /useAuthSession/);
  assert.match(pageSource, /EmailLoginPanel/);
  assert.match(pageSource, /ImageWorkspaceShell/);
});

test("image workspace auth gate defers the heavy canvas shell until after auth", () => {
  const pageSource = readImageWorkspaceFile("page.tsx");

  assert.match(pageSource, /dynamic\(\s*\(\)\s*=>\s*import\("\.\/image-workspace-shell"\)/);
  assert.match(pageSource, /ssr:\s*false/);
  assert.doesNotMatch(
    pageSource,
    /import\s*\{\s*ImageWorkspaceShell\s*\}\s*from\s*"\.\/image-workspace-shell"/,
  );
});

test("image canvas uses Leafer instead of tldraw", () => {
  const packageSource = readFileSync(join(packageDir, "package.json"), "utf8");
  const canvasSource = readImageWorkspaceFile("image-canvas.tsx");
  const persistenceSource = readImageWorkspaceFile("use-canvas-persistence.ts");
  const toolbarSource = readImageWorkspaceFile("components/canvas-toolbar.tsx");
  const imageWorkspaceSource = `${canvasSource}\n${persistenceSource}\n${toolbarSource}`;

  assert.match(packageSource, /"leafer-ui"/);
  assert.match(packageSource, /"leafer-editor"/);
  assert.doesNotMatch(packageSource, /"tldraw"/);
  assert.doesNotMatch(imageWorkspaceSource, /from "tldraw"|tldraw\/tldraw\.css/);
  assert.match(canvasSource, /createLeaferCanvasController/);
});

test("image canvas is backed by Leafer and keeps an explicit canvas size", () => {
  const canvasSource = readImageWorkspaceFile("image-canvas.tsx");

  assert.match(canvasSource, /createLeaferCanvasController/);
  assert.match(canvasSource, /className="[^"]*h-full[^"]*w-full/);
  assert.match(canvasSource, /useEffect/);
  assert.match(canvasSource, /canvasReady/);
});

test("image canvas delays Leafer mount until after strict-mode effect replay", () => {
  const canvasSource = readImageWorkspaceFile("image-canvas.tsx");

  assert.match(canvasSource, /requestAnimationFrame/);
  assert.match(canvasSource, /cancelAnimationFrame/);
  assert.match(canvasSource, /setReadyCanvasKey\(persistenceKey\)/);
  assert.match(canvasSource, /readyCanvasKey === persistenceKey/);
  assert.match(canvasSource, /persistenceKey/);
  assert.match(canvasSource, /canvasHostRef/);
  assert.match(canvasSource, /createLeaferCanvasController/);
});

test("image canvas has a timer fallback when animation frames are throttled", () => {
  const canvasSource = readImageWorkspaceFile("image-canvas.tsx");

  assert.match(canvasSource, /setTimeout/);
  assert.match(canvasSource, /clearTimeout/);
  assert.match(canvasSource, /markCanvasReady/);
});

test("image canvas hydrates backend image assets into Leafer image nodes", () => {
  const adapterSource = readImageWorkspaceFile("leafer-canvas-adapter.ts");
  const apiSource = readImageWorkspaceFile("workspace-api.ts");

  assert.match(adapterSource, /import\("leafer-ui"\)/);
  assert.match(adapterSource, /import\("leafer-editor"\)/);
  assert.match(adapterSource, /createLeaferCanvasController/);
  assert.match(adapterSource, /hydrateWorkspace/);
  assert.match(adapterSource, /createImageAssetPreviewUrl\(asset\.id\)/);
  assert.match(adapterSource, /miraAssetId/);
  assert.match(adapterSource, /miraObjectId/);
  assert.match(adapterSource, /width:\s*object\.width/);
  assert.match(adapterSource, /height:\s*object\.height/);
  assert.match(adapterSource, /type:\s*"image"/);
  assert.match(apiSource, /createImageAssetPreviewUrl/);
  assert.match(apiSource, /\/api\/image-assets\/\$\{encodeURIComponent\(assetId\)\}\/preview/);
});

test("image canvas loads Leafer only after the browser host is ready", () => {
  const canvasSource = readImageWorkspaceFile("image-canvas.tsx");
  const adapterSource = readImageWorkspaceFile("leafer-canvas-adapter.ts");

  assert.match(adapterSource, /Promise<CanvasController>/);
  assert.match(adapterSource, /await Promise\.all/);
  assert.match(adapterSource, /import\("leafer-ui"\)/);
  assert.match(adapterSource, /import\("leafer-editor"\)/);
  assert.doesNotMatch(adapterSource, /import\s*\{\s*App[\s\S]*from "leafer-ui"/);
  assert.match(canvasSource, /void createLeaferCanvasController/);
  assert.match(canvasSource, /cancelled/);
  assert.match(canvasSource, /nextController\.destroy\(\)/);
});

test("image canvas keeps a stable Leafer controller across parent rerenders", () => {
  const canvasSource = readImageWorkspaceFile("image-canvas.tsx");

  assert.match(canvasSource, /eventsRef/);
  assert.match(canvasSource, /readyCallbackRef/);
  assert.match(canvasSource, /eventsRef\.current\.onSelectAsset\(selection\)/);
  assert.match(canvasSource, /readyCallbackRef\.current\?\.\(nextController\)/);
  assert.match(canvasSource, /readyCallbackRef\.current\?\.\(null\)/);
  assert.doesNotMatch(
    canvasSource,
    /\}, \[canvasReady, onControllerReady, onSelectAsset, persistenceKey\]\)/,
  );
  assert.match(canvasSource, /\}, \[canvasReady, persistenceKey\]\)/);
});

test("image canvas lets Leafer create the editor layer", () => {
  const adapterSource = readImageWorkspaceFile("leafer-canvas-adapter.ts");

  assert.match(adapterSource, /type\s+LeaferAppWithEditor/);
  assert.match(adapterSource, /tree:\s*IGroup/);
  assert.match(adapterSource, /editor:\s*\{\}/);
  assert.match(adapterSource, /app\.editor\s+as\s+LeaferEditor/);
  assert.match(adapterSource, /app\.tree\.add\(imageLayer\)/);
  assert.doesNotMatch(adapterSource, /app\.add\(editor\)/);
  assert.doesNotMatch(adapterSource, /app\.sky\.add\(editor\)/);
  assert.doesNotMatch(adapterSource, /app\.add\(imageLayer\)/);
  assert.doesNotMatch(adapterSource, /new Editor\(\)/);
});

test("image canvas removes stale Mira image nodes after backend asset deletion", () => {
  const adapterSource = readImageWorkspaceFile("leafer-canvas-adapter.ts");

  assert.match(adapterSource, /removeStaleMiraImageNodes/);
  assert.match(adapterSource, /node\.remove\(\)/);
  assert.match(adapterSource, /miraObjectId/);
  assert.match(adapterSource, /validObjectIds/);
  assert.match(adapterSource, /hydrateWorkspace[\s\S]*removeStaleMiraImageNodes/);
});

test("image canvas clears stale selection before hydrating a different workspace", () => {
  const adapterSource = readImageWorkspaceFile("leafer-canvas-adapter.ts");

  assert.match(adapterSource, /selectionBelongsToWorkspace/);
  assert.match(adapterSource, /const workspaceAssetIds = new Set/);
  assert.match(adapterSource, /const selectionStillValid = selectionBelongsToWorkspace/);
  assert.match(adapterSource, /if \(!selectionStillValid\)/);
  assert.match(adapterSource, /selectedAssetId = null/);
  assert.match(adapterSource, /selectedObjectId = null/);
  assert.match(adapterSource, /selectedVersionId = null/);
  assert.match(adapterSource, /clearLocalEditOverlay\(false\)/);
  assert.match(adapterSource, /applySelectionToEditor\(null\)/);
});

test("image canvas selection updates the selected Mira asset", () => {
  const canvasSource = readImageWorkspaceFile("image-canvas.tsx");
  const adapterSource = readImageWorkspaceFile("leafer-canvas-adapter.ts");
  const shellSource = readImageWorkspaceFile("image-workspace-shell.tsx");

  assert.match(canvasSource, /onSelectAsset/);
  assert.match(canvasSource, /selectedAssetId/);
  assert.match(canvasSource, /selectedVersionId/);
  assert.match(canvasSource, /controller\.selectAsset\(selection\)/);
  assert.match(adapterSource, /onSelectAsset/);
  assert.match(adapterSource, /miraAssetId/);
  assert.match(adapterSource, /miraObjectId/);
  assert.match(canvasSource, /onSelectAsset\(selection\)/);
  assert.match(shellSource, /selectedAssetId/);
  assert.match(shellSource, /selectedVersionId/);
  assert.match(shellSource, /onSelectAsset=\{selectAsset\}/);
});

test("image canvas selection can be cleared without reselecting the first asset", () => {
  const canvasSource = readImageWorkspaceFile("image-canvas.tsx");
  const selectionSource = readImageWorkspaceFile("use-selected-image-asset.ts");

  assert.match(canvasSource, /onSelectAsset:\s*\(selection: CanvasAssetSelection\)/);
  assert.match(canvasSource, /onSelectAsset\(selection\)/);
  assert.doesNotMatch(canvasSource, /if \(!assetId/);
  assert.match(selectionSource, /selectAsset:\s*\(selection: CanvasAssetSelection \| string \| null\)/);
  assert.doesNotMatch(selectionSource, /workspace\.assets\[0\]/);
  assert.doesNotMatch(selectionSource, /!selectedAssetId\s*\|\|/);
});

test("image canvas persists Leafer geometry and viewport through backend snapshots", () => {
  const pageSource = readImageWorkspaceFile("page.tsx");
  const shellSource = readImageWorkspaceFile("image-workspace-shell.tsx");
  const canvasSource = readImageWorkspaceFile("image-canvas.tsx");
  const persistenceSource = readImageWorkspaceFile("use-canvas-persistence.ts");
  const adapterSource = readImageWorkspaceFile("leafer-canvas-adapter.ts");

  assert.match(pageSource, /onPersistCanvas=\{workspace\.persistCanvas\}/);
  assert.match(shellSource, /onPersistCanvas/);
  assert.match(shellSource, /onPersistCanvas=\{onPersistCanvas\}/);
  assert.match(canvasSource, /useCanvasPersistence/);
  assert.match(canvasSource, /onPersistCanvas/);
  assert.match(persistenceSource, /CanvasController/);
  assert.match(persistenceSource, /activeController\.serializeSnapshot\(\)/);
  assert.match(persistenceSource, /const activeController = controller/);
  assert.match(adapterSource, /serializeSnapshot/);
  assert.match(adapterSource, /viewport/);
  assert.match(adapterSource, /miraObjectId/);
  assert.match(adapterSource, /miraAssetId/);
  assert.match(persistenceSource, /window\.setTimeout/);
  assert.match(persistenceSource, /onPersistCanvas\(snapshot\)/);
});

test("image workspace ignores transient empty canvas autosaves over existing objects", () => {
  const hookSource = readImageWorkspaceFile("use-image-workspace.ts");

  assert.match(hookSource, /shouldPersistCanvasSnapshot/);
  assert.match(hookSource, /activeWorkspace\.objects\.length\s*>\s*0/);
  assert.match(hookSource, /snapshot\.objects\.length\s*===\s*0/);
});

test("image canvas exposes a focused Mira toolbar for common canvas actions", () => {
  const canvasSource = readImageWorkspaceFile("image-canvas.tsx");
  const toolbarSource = readImageWorkspaceFile("components/canvas-toolbar.tsx");

  assert.match(canvasSource, /CanvasToolbar/);
  assert.match(canvasSource, /controller=\{controller\}/);
  assert.match(toolbarSource, /export function CanvasToolbar/);
  assert.match(toolbarSource, /from "lucide-react"/);
  assert.match(toolbarSource, /CanvasController/);
  assert.match(toolbarSource, /MousePointer2/);
  assert.match(toolbarSource, /Hand/);
  assert.match(toolbarSource, /Undo2/);
  assert.match(toolbarSource, /Redo2/);
  assert.match(toolbarSource, /ZoomIn/);
  assert.match(toolbarSource, /ZoomOut/);
  assert.match(toolbarSource, /Maximize2/);
  assert.match(toolbarSource, /toolButtons/);
  assert.match(toolbarSource, /aria-pressed=\{active/);
  assert.match(toolbarSource, /tool:\s*"select"/);
  assert.match(toolbarSource, /tool:\s*"pan"/);
  assert.match(toolbarSource, /handleToolClick\(button\.tool\)/);
  assert.match(toolbarSource, /controller\.undo\(\)/);
  assert.match(toolbarSource, /controller\.redo\(\)/);
  assert.match(toolbarSource, /controller\.zoomIn\(\)/);
  assert.match(toolbarSource, /controller\.zoomOut\(\)/);
  assert.match(toolbarSource, /controller\.fitView\(\)/);
  assert.doesNotMatch(toolbarSource, /Frame/);
  assert.doesNotMatch(toolbarSource, /from "tldraw"/);
});

test("image canvas controller supports Leafer mask and marker tools", () => {
  const typesSource = readImageWorkspaceFile("leafer-canvas-types.ts");
  const toolbarSource = readImageWorkspaceFile("components/canvas-toolbar.tsx");
  const adapterSource = readImageWorkspaceFile("leafer-canvas-adapter.ts");

  assert.match(typesSource, /"mask"/);
  assert.match(typesSource, /"marker"/);
  assert.match(typesSource, /exportLocalEditMask/);
  assert.match(typesSource, /clearLocalEditOverlay/);
  assert.match(typesSource, /setLocalEditMarkerRadius/);
  assert.match(typesSource, /markerRadius/);
  assert.match(toolbarSource, /Brush/);
  assert.match(toolbarSource, /MapPin/);
  assert.match(toolbarSource, /tool:\s*"mask"/);
  assert.match(toolbarSource, /tool:\s*"marker"/);
  assert.match(adapterSource, /maskLayer/);
  assert.match(adapterSource, /markerLayer/);
  assert.match(adapterSource, /setLocalEditMarkerRadius/);
});

test("leafer canvas controller exposes local image expansion overlay types", () => {
  const typesSource = readImageWorkspaceFile("leafer-canvas-types.ts");

  assert.match(typesSource, /export type LocalExpandMode = "free" \| "ratio" \| "direction"/);
  assert.match(typesSource, /export type LocalExpandDirection = "left" \| "right" \| "top" \| "bottom" \| "around"/);
  assert.match(typesSource, /export type LocalExpandPadding = \{/);
  assert.match(typesSource, /left:\s*number/);
  assert.match(typesSource, /right:\s*number/);
  assert.match(typesSource, /top:\s*number/);
  assert.match(typesSource, /bottom:\s*number/);
  assert.match(typesSource, /export type LocalExpandOverlayState = \{/);
  assert.match(typesSource, /active:\s*boolean/);
  assert.match(typesSource, /assetId:\s*string \| null/);
  assert.match(typesSource, /versionId:\s*string \| null/);
  assert.match(typesSource, /mode:\s*LocalExpandMode/);
  assert.match(typesSource, /aspectRatio:\s*"1:1" \| "2:1" \| "4:3" \| "16:9" \| "1:2" \| "3:4" \| "9:16"/);
  assert.match(typesSource, /direction:\s*LocalExpandDirection/);
  assert.match(typesSource, /percent:\s*number/);
  assert.match(typesSource, /padding:\s*LocalExpandPadding/);
  assert.match(typesSource, /target:\s*\{ width:\s*number; height:\s*number \} \| null/);
  assert.match(typesSource, /export type LocalExpandExportInput = \{/);
  assert.match(typesSource, /export type LocalExpandExportResult = \{/);
});

test("leafer canvas controller exposes local image expansion overlay methods", () => {
  const typesSource = readImageWorkspaceFile("leafer-canvas-types.ts");
  const adapterSource = readImageWorkspaceFile("leafer-canvas-adapter.ts");

  for (const methodName of [
    "getLocalExpandState",
    "setLocalExpandMode",
    "setLocalExpandAspectRatio",
    "setLocalExpandDirection",
    "setLocalExpandPercent",
    "setLocalExpandPadding",
    "clearLocalExpandOverlay",
    "exportLocalExpandInput",
  ]) {
    assert.match(typesSource, new RegExp(`${methodName}:`));
    assert.match(adapterSource, new RegExp(`${methodName}:`));
  }
});

test("leafer canvas adapter renders a viewport-synced local expansion layer", () => {
  const adapterSource = readImageWorkspaceFile("leafer-canvas-adapter.ts");

  assert.match(adapterSource, /expandLayer/);
  assert.match(adapterSource, /app\.tree\.add\(expandLayer\)/);
  assert.match(adapterSource, /expandLayer\.x = viewport\.x/);
  assert.match(adapterSource, /expandLayer\.y = viewport\.y/);
  assert.match(adapterSource, /expandLayer\.scaleX = viewport\.zoom/);
  assert.match(adapterSource, /expandLayer\.scaleY = viewport\.zoom/);
  assert.match(adapterSource, /renderExpandOverlay/);
  assert.match(adapterSource, /calculateRatioExpandPadding/);
  assert.match(adapterSource, /calculateDirectionalExpandPadding/);
  assert.match(adapterSource, /dragExpandHandle/);
  assert.match(adapterSource, /dashPattern/);
  assert.match(adapterSource, /rgba\(225,\s*29,\s*72,\s*0\.12\)/);
});

test("leafer local expansion export returns prompt defaults and mode-specific fields", () => {
  const adapterSource = readImageWorkspaceFile("leafer-canvas-adapter.ts");

  assert.match(adapterSource, /exportLocalExpandInput/);
  assert.match(adapterSource, /自然扩展图片画面，保持原图主体、风格和光照一致/);
  assert.match(adapterSource, /promptDefaults/);
  assert.match(adapterSource, /mode:\s*localExpandState\.mode/);
  assert.match(adapterSource, /localExpandState\.mode === "ratio"[\s\S]*aspectRatio:\s*localExpandState\.aspectRatio/);
  assert.match(adapterSource, /localExpandState\.mode === "direction"[\s\S]*direction:\s*localExpandState\.direction/);
  assert.match(adapterSource, /localExpandState\.mode === "direction"[\s\S]*percent:\s*localExpandState\.percent/);
  assert.match(adapterSource, /padding:\s*normalizedPadding/);
  assert.match(adapterSource, /target:\s*\{\s*width:\s*input\.width \+ normalizedPadding\.left \+ normalizedPadding\.right/);
  assert.match(adapterSource, /height:\s*input\.height \+ normalizedPadding\.top \+ normalizedPadding\.bottom/);
});

test("leafer toolbar tools are mutually exclusive and disable other tool behavior", () => {
  const canvasSource = readImageWorkspaceFile("image-canvas.tsx");
  const toolbarSource = readImageWorkspaceFile("components/canvas-toolbar.tsx");
  const adapterSource = readImageWorkspaceFile("leafer-canvas-adapter.ts");

  assert.match(toolbarSource, /toolButtons/);
  assert.match(toolbarSource, /activeTool === button\.tool/);
  assert.match(toolbarSource, /aria-pressed=\{active\}/);
  assert.match(toolbarSource, /handleToolClick\(button\.tool\)/);
  assert.match(adapterSource, /applyToolInteractionState/);
  assert.match(adapterSource, /activeTool === "select"/);
  assert.match(adapterSource, /node\.draggable = canEdit/);
  assert.match(adapterSource, /node\.editable = canEdit/);
  assert.match(adapterSource, /if \(tool !== "select"\) applySelectionToEditor\(null\)/);
  assert.match(adapterSource, /activeTool === "pan" && isPanning/);
  assert.match(adapterSource, /activeTool === "mask" && currentMaskStroke/);
  assert.match(adapterSource, /if \(activeTool !== "select"\) return/);
  assert.match(canvasSource, /getActiveTool\(\) !== "select"/);
  assert.match(canvasSource, /deleteSelection\(\)/);
});

test("leafer toolbar makes the active tool mode obvious", () => {
  const toolbarSource = readImageWorkspaceFile("components/canvas-toolbar.tsx");

  assert.match(toolbarSource, /useSyncExternalStore/);
  assert.match(toolbarSource, /controller\?\.subscribeChange/);
  assert.match(toolbarSource, /controller\?\.getActiveTool\(\) \?\? "select"/);
  assert.match(toolbarSource, /handleToolClick/);
  assert.match(toolbarSource, /controller\.setTool\(tool\)/);
  assert.match(toolbarSource, /activeToolButton/);
  assert.match(toolbarSource, /当前工具/);
  assert.match(toolbarSource, /activeToolButton\.label/);
  assert.match(toolbarSource, /data-active-tool=\{active\}/);
  assert.match(toolbarSource, /ring-2 ring-\[var\(--accent\)\]/);
  assert.match(toolbarSource, /border-\[color-mix\(in_oklch,var\(--accent\)_70%,var\(--border\)\)\]/);
});

test("leafer mask brush uses the official Pen element", () => {
  const adapterSource = readImageWorkspaceFile("leafer-canvas-adapter.ts");

  assert.match(adapterSource, /App, Ellipse, Group, Image, Pen, PointerEvent/);
  assert.match(adapterSource, /import type \{[\s\S]*IPen[\s\S]*\} from "leafer-ui"/);
  assert.match(adapterSource, /new Pen\(/);
  assert.match(adapterSource, /drawMaskStrokePen/);
  assert.match(adapterSource, /\.moveTo\(/);
  assert.match(adapterSource, /\.lineTo\(/);
  assert.match(adapterSource, /\.paint\(\)/);
  assert.doesNotMatch(adapterSource, /for \(const point of stroke\.points\)[\s\S]*new Ellipse/);
});

test("image workspace shell exposes rail, canvas, prompt, task, and mobile panels", () => {
  const shellSource = readImageWorkspaceFile("image-workspace-shell.tsx");
  const componentSource = [
    readImageWorkspaceFile("components/workspace-rail.tsx"),
    readImageWorkspaceFile("components/prompt-panel.tsx"),
    readImageWorkspaceFile("components/task-inspector.tsx"),
    readImageWorkspaceFile("components/inspector-panel.tsx"),
    readImageWorkspaceFile("components/mobile-drawers.tsx"),
  ].join("\n");
  const combinedSource = `${shellSource}\n${componentSource}`;

  assert.match(combinedSource, /工作区/);
  assert.match(shellSource, /ImageCanvas/);
  assert.match(combinedSource, /生成图像/);
  assert.match(combinedSource, /任务/);
  assert.match(shellSource, /md:grid-cols-\[260px_minmax\(0,1fr\)_320px\]/);
  assert.match(componentSource, /md:hidden/);
});

test("image workspace rail includes workspace search", () => {
  const railSource = readImageWorkspaceFile("components/workspace-rail.tsx");

  assert.match(railSource, /Search/);
  assert.match(railSource, /useState/);
  assert.match(railSource, /searchQuery/);
  assert.match(railSource, /filteredWorkspaces/);
  assert.match(railSource, /workspace\.title\.toLowerCase\(\)/);
  assert.match(railSource, /placeholder="搜索图像画布"/);
  assert.match(railSource, /focus:outline-none/);
  assert.match(railSource, /没有匹配的图像画布/);
});

test("image workspace rail supports renaming and deleting canvases", () => {
  const pageSource = readImageWorkspaceFile("page.tsx");
  const shellSource = readImageWorkspaceFile("image-workspace-shell.tsx");
  const railSource = readImageWorkspaceFile("components/workspace-rail.tsx");

  assert.match(pageSource, /onRenameWorkspace=\{workspace\.renameWorkspace\}/);
  assert.match(pageSource, /onDeleteWorkspace=\{workspace\.deleteWorkspace\}/);
  assert.match(shellSource, /onRenameWorkspace/);
  assert.match(shellSource, /onDeleteWorkspace/);
  assert.match(shellSource, /onRename=\{onRenameWorkspace\}/);
  assert.match(shellSource, /onDelete=\{onDeleteWorkspace\}/);
  assert.match(railSource, /Pencil/);
  assert.match(railSource, /Trash2/);
  assert.match(railSource, /Check/);
  assert.match(railSource, /editingWorkspaceId/);
  assert.match(railSource, /aria-label="重命名图像画布"/);
  assert.match(railSource, /aria-label="保存图像画布名称"/);
  assert.match(railSource, /aria-label="取消重命名图像画布"/);
  assert.match(railSource, /aria-label="删除图像画布"/);
  assert.match(railSource, /onRename\(workspace\.id/);
  assert.match(railSource, /onDelete\(workspace\.id\)/);
});

test("image workspace shell delegates panels to focused components", () => {
  const shellSource = readImageWorkspaceFile("image-workspace-shell.tsx");
  const componentFiles = [
    ["workspace-rail.tsx", /export function WorkspaceRail/],
    ["prompt-panel.tsx", /export function PromptPanel/],
    ["task-inspector.tsx", /export function TaskInspector/],
    ["inspector-panel.tsx", /export function InspectorPanel/],
    ["mobile-drawers.tsx", /export function MobileWorkspaceHeader/],
  ];

  for (const [fileName, exportPattern] of componentFiles) {
    const source = readImageWorkspaceFile(`components/${fileName}`);
    assert.match(source, exportPattern);
  }

  assert.match(shellSource, /WorkspaceRail/);
  assert.match(shellSource, /InspectorPanel/);
  assert.match(shellSource, /MobileWorkspaceHeader/);
  assert.doesNotMatch(shellSource, /workspaces\.map/);
  assert.doesNotMatch(shellSource, /activeWorkspace\?\.tasks\.map/);
  assert.doesNotMatch(shellSource, /<textarea/);
});

test("image workspace shell keeps generation and task controls reachable on mobile", () => {
  const shellSource = readImageWorkspaceFile("image-workspace-shell.tsx");
  const mobileSource = readImageWorkspaceFile("components/mobile-drawers.tsx");
  const inspectorSource = readImageWorkspaceFile("components/inspector-panel.tsx");
  const combinedSource = `${shellSource}\n${mobileSource}\n${inspectorSource}`;

  assert.match(shellSource, /mobileInspectorOpen/);
  assert.match(combinedSource, /打开生成面板/);
  assert.match(combinedSource, /关闭生成面板/);
  assert.match(combinedSource, /max-md:fixed/);
  assert.match(inspectorSource, /flex-1 overflow-y-auto/);
  assert.match(combinedSource, /md:hidden[\s\S]*Sparkles/);
});

test("image workspace api uses same-origin image workspace endpoints", () => {
  const apiSource = readImageWorkspaceFile("workspace-api.ts");

  assert.match(apiSource, /fetch\("\/api\/image-workspaces"/);
  assert.match(apiSource, /createImageWorkspace/);
  assert.match(apiSource, /renameImageWorkspace/);
  assert.match(apiSource, /deleteImageWorkspace/);
  assert.match(apiSource, /saveCanvasSnapshot/);
  assert.match(apiSource, /createImageTask/);
  assert.match(apiSource, /cancelImageTask/);
  assert.match(apiSource, /\/tasks\/\$\{encodeURIComponent\(taskId\)\}\/cancel/);
  assert.match(apiSource, /retryImageTask/);
  assert.match(apiSource, /\/tasks\/\$\{encodeURIComponent\(taskId\)\}\/retry/);
  assert.match(apiSource, /deleteImageTask/);
  assert.match(apiSource, /\/tasks\/\$\{encodeURIComponent\(taskId\)\}/);
  assert.match(apiSource, /encodeURIComponent\(id\)/);
});

test("image workspace subscribes to task streams and reloads generated assets", () => {
  const hookSource = readImageWorkspaceFile("use-image-workspace.ts");

  assert.match(hookSource, /useImageTaskStream/);
  assert.match(hookSource, /setStreamTaskId\(task\.id\)/);
  assert.match(hookSource, /asset-created/);
  assert.match(hookSource, /asset-updated/);
  assert.match(hookSource, /loadImageWorkspace/);
  assert.match(hookSource, /setError\(message\)/);
});

test("image workspace shows task policy errors below the prompt", () => {
  const panelSource = readImageWorkspaceFile("components/prompt-panel.tsx");
  const hookSource = readImageWorkspaceFile("use-image-workspace.ts");
  const inspectorSource = readImageWorkspaceFile("components/inspector-panel.tsx");

  assert.match(hookSource, /setError\(taskError instanceof Error \? taskError\.message/);
  assert.match(inspectorSource, /error=\{error\}/);
  assert.match(panelSource, /error \?/);
  assert.match(panelSource, /border-\[var\(--danger\)\]/);
  assert.match(panelSource, /text-\[var\(--danger\)\]/);
  assert.doesNotMatch(panelSource, /dangerouslySetInnerHTML/);
});

test("image generation panel exposes compact provider settings", () => {
  const panelSource = readImageWorkspaceFile("components/prompt-panel.tsx");
  const apiSource = readImageWorkspaceFile("workspace-api.ts");
  const hookSource = readImageWorkspaceFile("use-image-workspace.ts");
  const shellSource = readImageWorkspaceFile("image-workspace-shell.tsx");
  const inspectorSource = readImageWorkspaceFile("components/inspector-panel.tsx");

  assert.match(panelSource, /ImageGenerationSettings/);
  assert.match(panelSource, /aspectRatio:\s*"1:1"/);
  assert.match(panelSource, /quality:\s*"auto"/);
  assert.match(panelSource, /background:\s*"auto"/);
  assert.match(panelSource, /画幅/);
  assert.match(panelSource, /质量/);
  assert.match(panelSource, /背景/);
  assert.match(panelSource, /onGenerate\(prompt,\s*settings\)/);
  assert.match(apiSource, /aspectRatio\?:\s*ImageGenerationSettings\["aspectRatio"\]/);
  assert.match(apiSource, /quality\?:\s*ImageGenerationSettings\["quality"\]/);
  assert.match(apiSource, /background\?:\s*ImageGenerationSettings\["background"\]/);
  assert.match(hookSource, /generateImage\(prompt: string,\s*settings: ImageGenerationSettings/);
  assert.match(hookSource, /\.\.\.settings/);
  assert.match(shellSource, /onGenerate:\s*\(prompt: string,\s*settings: ImageGenerationSettings\)/);
  assert.match(inspectorSource, /onGenerate:\s*\(prompt: string,\s*settings: ImageGenerationSettings\)/);
});

test("image generation panel supports common aspect ratios", () => {
  const panelSource = readImageWorkspaceFile("components/prompt-panel.tsx");
  const typesSource = readImageWorkspaceFile("types.ts");
  const apiSource = readImageWorkspaceFile("workspace-api.ts");

  for (const ratio of ["1:1", "2:1", "4:3", "16:9", "1:2", "3:4", "9:16"]) {
    assert.match(panelSource, new RegExp(`value: "${ratio}"`));
    assert.match(typesSource, new RegExp(`"${ratio}"`));
  }
  assert.match(panelSource, /ASPECT_RATIO_OPTIONS/);
  assert.match(panelSource, /grid-cols-4/);
  assert.doesNotMatch(panelSource, /SIZE_OPTIONS/);
  assert.doesNotMatch(apiSource, /size\?:\s*ImageGenerationSettings\["size"\]/);
});

test("image workspace exposes queued task cancellation controls", () => {
  const apiSource = readImageWorkspaceFile("workspace-api.ts");
  const hookSource = readImageWorkspaceFile("use-image-workspace.ts");
  const shellSource = readImageWorkspaceFile("image-workspace-shell.tsx");
  const inspectorSource = readImageWorkspaceFile("components/inspector-panel.tsx");
  const taskSource = readImageWorkspaceFile("components/task-inspector.tsx");

  assert.match(apiSource, /cancelImageTask/);
  assert.match(hookSource, /cancelTask/);
  assert.match(hookSource, /status:\s*"canceled"/);
  assert.match(hookSource, /setStreamTaskId/);
  assert.match(shellSource, /onCancelTask/);
  assert.match(inspectorSource, /onCancelTask/);
  assert.match(taskSource, /onCancelTask/);
  assert.match(taskSource, /XCircle/);
  assert.match(taskSource, /task\.status === "queued" \|\| task\.status === "running"/);
  assert.match(taskSource, /aria-label="取消任务"/);
});

test("image workspace keeps task history to 20 items and exposes task deletion controls", () => {
  const apiSource = readImageWorkspaceFile("workspace-api.ts");
  const hookSource = readImageWorkspaceFile("use-image-workspace.ts");
  const pageSource = readImageWorkspaceFile("page.tsx");
  const shellSource = readImageWorkspaceFile("image-workspace-shell.tsx");
  const inspectorSource = readImageWorkspaceFile("components/inspector-panel.tsx");
  const taskSource = readImageWorkspaceFile("components/task-inspector.tsx");

  assert.match(apiSource, /deleteImageTask/);
  assert.match(apiSource, /method:\s*"DELETE"/);
  assert.match(hookSource, /IMAGE_TASK_HISTORY_LIMIT\s*=\s*20/);
  assert.match(hookSource, /limitImageTasks/);
  assert.match(hookSource, /\.slice\(0,\s*IMAGE_TASK_HISTORY_LIMIT\)/);
  assert.match(hookSource, /deleteTask/);
  assert.match(hookSource, /deleteImageTask\(activeWorkspace\.id,\s*taskId\)/);
  assert.match(hookSource, /task\.id !== taskId/);
  assert.match(hookSource, /setStreamTaskId\(\(current\) => \(current === taskId \? null : current\)\)/);
  assert.match(pageSource, /onDeleteTask=\{workspace\.deleteTask\}/);
  assert.match(shellSource, /onDeleteTask/);
  assert.match(inspectorSource, /onDeleteTask/);
  assert.match(taskSource, /onDeleteTask/);
  assert.match(taskSource, /Trash2/);
  assert.match(taskSource, /aria-label="删除任务"/);
  assert.match(taskSource, /title="删除任务"/);
});

test("image generation settings expose interruption for the active task", () => {
  const shellSource = readImageWorkspaceFile("image-workspace-shell.tsx");
  const inspectorSource = readImageWorkspaceFile("components/inspector-panel.tsx");
  const promptSource = readImageWorkspaceFile("components/prompt-panel.tsx");

  assert.match(shellSource, /activeTask/);
  assert.match(shellSource, /activeTask=\{activeTask\}/);
  assert.match(inspectorSource, /activeTask/);
  assert.match(inspectorSource, /activeTask=\{activeTask\}/);
  assert.match(promptSource, /activeTask/);
  assert.match(promptSource, /onCancelTask\(activeTask\.id\)/);
  assert.match(promptSource, /中断当前任务/);
  assert.match(promptSource, /aria-label="中断当前图像任务"/);
});

test("image workspace exposes failed task retry controls", () => {
  const apiSource = readImageWorkspaceFile("workspace-api.ts");
  const hookSource = readImageWorkspaceFile("use-image-workspace.ts");
  const shellSource = readImageWorkspaceFile("image-workspace-shell.tsx");
  const inspectorSource = readImageWorkspaceFile("components/inspector-panel.tsx");
  const taskSource = readImageWorkspaceFile("components/task-inspector.tsx");

  assert.match(apiSource, /retryImageTask/);
  assert.match(hookSource, /retryTask/);
  assert.match(hookSource, /setStreamTaskId\(retriedTask\.id\)/);
  assert.match(shellSource, /onRetryTask/);
  assert.match(inspectorSource, /onRetryTask/);
  assert.match(taskSource, /onRetryTask/);
  assert.match(taskSource, /RotateCcw/);
  assert.match(taskSource, /task\.status === "failed"/);
  assert.match(taskSource, /aria-label="重试任务"/);
});

test("image task panel collapses generated task history behind an accessible toggle", () => {
  const taskSource = readImageWorkspaceFile("components/task-inspector.tsx");

  assert.match(taskSource, /useState/);
  assert.match(taskSource, /ChevronDown/);
  assert.match(taskSource, /aria-expanded=\{expanded\}/);
  assert.match(taskSource, /aria-controls="image-task-history"/);
  assert.match(taskSource, /id="image-task-history"/);
  assert.match(taskSource, /setExpanded\(\(value\) => !value\)/);
  assert.match(taskSource, /latestTask/);
  assert.match(taskSource, /expanded \?/);
});

test("image workspace clears stale task streams after stream connection errors", () => {
  const hookSource = readImageWorkspaceFile("use-image-workspace.ts");

  assert.match(hookSource, /handleStreamError\s*=\s*useCallback\(\(message: string\)/);
  assert.match(hookSource, /handleStreamError[\s\S]*setError\(message\);[\s\S]*setStreamTaskId\(null\)/);
});

test("image workspace exposes asset editing api helpers", () => {
  const apiSource = readImageWorkspaceFile("workspace-api.ts");
  const typesSource = readImageWorkspaceFile("types.ts");

  assert.match(apiSource, /createImageAssetEditTask/);
  assert.match(apiSource, /uploadImageAssetMask/);
  assert.match(apiSource, /createImageAssetVariationTask/);
  assert.match(apiSource, /createImageAssetUpscaleTask/);
  assert.match(apiSource, /createImageAssetBackgroundRemovalTask/);
  assert.match(apiSource, /revertImageAsset/);
  assert.match(apiSource, /downloadImageAsset/);
  assert.match(apiSource, /deleteImageAsset/);
  assert.match(apiSource, /createImageVersionPreviewUrl/);
  assert.match(apiSource, /createImageVersionDownloadUrl/);
  assert.match(apiSource, /\/api\/image-assets\/\$\{encodeURIComponent\(assetId\)\}/);
  assert.doesNotMatch(typesSource, /storageKey:\s*string/);
  assert.doesNotMatch(typesSource, /maskKey:\s*string\s*\|\s*null/);
  assert.doesNotMatch(typesSource, /providerJob:\s*string\s*\|\s*null/);
});

test("image asset expand route proxies expansion tasks through the backend", () => {
  const routeSource = readAppFile("api/image-assets/[assetId]/expand/route.ts");

  assert.match(routeSource, /export async function POST/);
  assert.match(routeSource, /proxyBackendRequest/);
  assert.match(
    routeSource,
    /image-assets\/\$\{encodeURIComponent\(assetId\)\}\/expand/,
  );
});

test("image workspace api exposes image expansion task creation", () => {
  const apiSource = readImageWorkspaceFile("workspace-api.ts");

  assert.match(apiSource, /export type ImageExpandRequest/);
  assert.match(apiSource, /prompt\?:\s*string/);
  assert.match(apiSource, /versionId:\s*string/);
  assert.match(apiSource, /mode:\s*"free"\s*\|\s*"ratio"\s*\|\s*"direction"/);
  assert.match(apiSource, /direction\?:\s*"left"\s*\|\s*"right"\s*\|\s*"top"\s*\|\s*"bottom"\s*\|\s*"around"/);
  assert.match(apiSource, /padding:\s*\{\s*left:\s*number;\s*right:\s*number;\s*top:\s*number;\s*bottom:\s*number/);
  assert.match(apiSource, /target:\s*\{\s*width:\s*number;\s*height:\s*number/);
  assert.match(apiSource, /aspectRatio\?:\s*ImageGenerationSettings\["aspectRatio"\]/);
  assert.match(apiSource, /createImageAssetExpandTask\(assetId:\s*string,\s*input:\s*ImageExpandRequest\)/);
  assert.match(apiSource, /\/api\/image-assets\/\$\{encodeURIComponent\(assetId\)\}\/expand/);
  assert.match(apiSource, /body:\s*JSON\.stringify\(input\)/);
  assert.match(apiSource, /图片扩展任务创建失败/);
});

test("image workspace hook exposes image expansion task creation", () => {
  const hookSource = readImageWorkspaceFile("use-image-workspace.ts");

  assert.match(hookSource, /createImageAssetExpandTask/);
  assert.match(hookSource, /ImageExpandRequest/);
  assert.match(
    hookSource,
    /expandImageAsset\(assetId:\s*string,\s*input:\s*ImageExpandRequest\)/,
  );
  assert.match(hookSource, /if \(!activeWorkspace \|\| creatingTask\) return/);
  assert.match(hookSource, /createImageAssetExpandTask\(assetId,\s*input\)/);
  assert.match(hookSource, /appendTask\(activeWorkspace\.id,\s*task\)/);
  assert.match(hookSource, /setStreamTaskId\(task\.id\)/);
  assert.match(hookSource, /图片扩展任务创建失败/);
  assert.match(hookSource, /expandImageAsset/);
});

test("image workspace page and shell thread image expansion props", () => {
  const pageSource = readImageWorkspaceFile("page.tsx");
  const shellSource = readImageWorkspaceFile("image-workspace-shell.tsx");

  assert.match(pageSource, /onExpandAsset=\{workspace\.expandImageAsset\}/);
  assert.match(shellSource, /onExpandAsset/);
  assert.match(
    shellSource,
    /onExpandAsset:\s*\(assetId:\s*string,\s*input:\s*ImageExpandRequest\)/,
  );
});

test("image workspace uploads local source images into the active canvas", () => {
  const apiSource = readImageWorkspaceFile("workspace-api.ts");
  const hookSource = readImageWorkspaceFile("use-image-workspace.ts");
  const shellSource = readImageWorkspaceFile("image-workspace-shell.tsx");
  const inspectorSource = readImageWorkspaceFile("components/inspector-panel.tsx");
  const panelSource = readImageWorkspaceFile("components/prompt-panel.tsx");

  assert.match(apiSource, /uploadImageWorkspaceAsset/);
  assert.match(apiSource, /\/api\/image-workspaces\/\$\{encodeURIComponent\(workspaceId\)\}\/assets/);
  assert.match(hookSource, /uploadSourceAsset/);
  assert.match(hookSource, /FileReader/);
  assert.match(hookSource, /readAsDataURL\(file\)/);
  assert.match(hookSource, /uploadImageWorkspaceAsset\(activeWorkspace\.id/);
  assert.match(hookSource, /replaceWorkspace\(workspace\)/);
  assert.match(shellSource, /onUploadSourceAsset/);
  assert.match(inspectorSource, /onUploadSourceAsset/);
  assert.match(panelSource, /Upload/);
  assert.match(panelSource, /上传源图到画布/);
  assert.match(panelSource, /accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(panelSource, /className="sr-only"/);
  assert.match(panelSource, /type="file"/);
  assert.doesNotMatch(panelSource, /storageKey|maskKey/);
  assert.doesNotMatch(
    apiSource.slice(
      apiSource.indexOf("export async function uploadImageWorkspaceAsset"),
      apiSource.indexOf("export async function createImageTask"),
    ),
    /storageKey|maskKey/,
  );
});

test("image source upload validates data URLs before calling the workspace asset api", () => {
  const hookSource = readImageWorkspaceFile("use-image-workspace.ts");

  assert.match(hookSource, /assertSourceDataUrl\(dataUrl,\s*file\)/);
  assert.match(hookSource, /dataUrl\.startsWith\(`data:\$\{file\.type\};base64,`\)/);
  assert.match(hookSource, /源图读取结果无效/);
});

test("asset version panel supports drawing and uploading an edit mask", () => {
  const panelSource = readImageWorkspaceFile("components/asset-version-panel.tsx");
  const inspectorSource = readImageWorkspaceFile("components/inspector-panel.tsx");
  const shellSource = readImageWorkspaceFile("image-workspace-shell.tsx");
  const apiSource = readImageWorkspaceFile("workspace-api.ts");

  assert.match(panelSource, /局部重绘/);
  assert.match(panelSource, /onSubmitLocalEdit/);
  assert.match(panelSource, /localEditOverlayState/);
  assert.match(panelSource, /标记范围/);
  assert.match(panelSource, /onLocalEditRadiusChange/);
  assert.match(shellSource, /canvasControllerRef/);
  assert.match(shellSource, /exportLocalEditMask/);
  assert.match(shellSource, /setLocalEditMarkerRadius/);
  assert.match(shellSource, /onUploadMask\(/);
  assert.match(shellSource, /onEditAsset\(/);
  assert.match(shellSource, /clearLocalEditOverlay/);
  assert.match(inspectorSource, /onSubmitLocalEdit/);
  assert.doesNotMatch(panelSource, /maskCanvasRef/);
  assert.doesNotMatch(panelSource, /aria-label="绘制蒙版"/);
  assert.doesNotMatch(panelSource, /maskKey/);
  assert.doesNotMatch(apiSource, /maskKey\?: string/);
  assert.match(shellSource, /onUploadMask/);
});

test("asset version panel delegates local edit overlays to the Leafer canvas", () => {
  const panelSource = readImageWorkspaceFile("components/asset-version-panel.tsx");
  const adapterSource = readImageWorkspaceFile("leafer-canvas-adapter.ts");

  assert.match(adapterSource, /exportLocalEditMask/);
  assert.match(adapterSource, /createEditableMaskDataUrl/);
  assert.match(adapterSource, /drawMaskStrokes/);
  assert.match(adapterSource, /drawMarkerMask/);
  assert.match(panelSource, /type="range"/);
  assert.doesNotMatch(panelSource, /MASK_PREVIEW_MAX_HEIGHT/);
  assert.doesNotMatch(panelSource, /maskFrameStyle/);
  assert.doesNotMatch(panelSource, /getCanvasPoint/);
  assert.doesNotMatch(panelSource, /createEditableMaskDataUrl/);
  assert.doesNotMatch(panelSource, /onPointerDown=\{startMaskStroke\}/);
});

test("local edit overlays are cleared and restored through toolbar undo redo", () => {
  const panelSource = readImageWorkspaceFile("components/asset-version-panel.tsx");
  const inspectorSource = readImageWorkspaceFile("components/inspector-panel.tsx");
  const shellSource = readImageWorkspaceFile("image-workspace-shell.tsx");
  const adapterSource = readImageWorkspaceFile("leafer-canvas-adapter.ts");

  assert.doesNotMatch(panelSource, /Eraser/);
  assert.doesNotMatch(panelSource, /onClearLocalEditOverlay/);
  assert.doesNotMatch(panelSource, /清除/);
  assert.doesNotMatch(inspectorSource, /onClearLocalEditOverlay/);
  assert.doesNotMatch(shellSource, /onClearLocalEditOverlay/);
  assert.match(adapterSource, /type LocalEditOverlaySnapshot/);
  assert.match(adapterSource, /localEditUndoStack/);
  assert.match(adapterSource, /localEditRedoStack/);
  assert.match(adapterSource, /captureLocalEditSnapshot/);
  assert.match(adapterSource, /applyLocalEditSnapshot/);
  assert.match(adapterSource, /pushLocalEditHistory/);
  assert.match(adapterSource, /getCanUndo:\s*\(\) => localEditUndoStack\.length > 0/);
  assert.match(adapterSource, /getCanRedo:\s*\(\) => localEditRedoStack\.length > 0/);
  assert.match(adapterSource, /undo:\s*\(\) =>/);
  assert.match(adapterSource, /redo:\s*\(\) =>/);
  assert.match(adapterSource, /currentLocalEditHistorySnapshot/);
});

test("image workspace has a focused asset version panel component", () => {
  const panelSource = readImageWorkspaceFile("components/asset-version-panel.tsx");
  const inspectorSource = readImageWorkspaceFile("components/inspector-panel.tsx");
  const selectionSource = readImageWorkspaceFile("use-selected-image-asset.ts");
  const shellSource = readImageWorkspaceFile("image-workspace-shell.tsx");

  assert.match(panelSource, /AssetVersionPanel/);
  assert.match(panelSource, /onSubmitLocalEdit/);
  assert.match(panelSource, /onVariation/);
  assert.match(panelSource, /onUpscale/);
  assert.match(panelSource, /onRemoveBackground/);
  assert.match(panelSource, /onRevert/);
  assert.match(panelSource, /onDownload/);
  assert.match(panelSource, /onDelete/);
  assert.match(panelSource, /放大图片/);
  assert.match(panelSource, /移除背景/);
  assert.match(panelSource, /Compare/);
  assert.match(panelSource, /createImageVersionPreviewUrl/);
  assert.match(panelSource, /createImageVersionDownloadUrl/);
  assert.doesNotMatch(panelSource, /storageKey/);
  assert.doesNotMatch(panelSource, /placeholder=["'][^"']*maskKey/);
  assert.match(selectionSource, /useSelectedImageAsset/);
  assert.match(inspectorSource, /AssetVersionPanel/);
  assert.match(shellSource, /InspectorPanel/);
  assert.match(shellSource, /useSelectedImageAsset/);
});

test("asset version panel switches the selected canvas image version without global asset rollback", () => {
  const typesSource = readImageWorkspaceFile("leafer-canvas-types.ts");
  const adapterSource = readImageWorkspaceFile("leafer-canvas-adapter.ts");
  const shellSource = readImageWorkspaceFile("image-workspace-shell.tsx");
  const panelSource = readImageWorkspaceFile("components/asset-version-panel.tsx");

  assert.match(typesSource, /selectedVersionId/);
  assert.match(typesSource, /setSelectedAssetVersion/);
  assert.match(typesSource, /onSelectAsset:\s*\(selection: CanvasAssetSelection\)/);
  assert.match(adapterSource, /readCanvasObjectVersionId/);
  assert.match(adapterSource, /createImageVersionPreviewUrl\(asset\.id,\s*version\.id\)/);
  assert.match(adapterSource, /setSelectedAssetVersion/);
  assert.match(adapterSource, /props:\s*\{[\s\S]*versionId:/);
  assert.match(shellSource, /selectedVersionId/);
  assert.match(shellSource, /onSelectVersion/);
  assert.match(shellSource, /canvasControllerRef\.current\?\.setSelectedAssetVersion\(versionId\)/);
  assert.match(panelSource, /onSelectVersion/);
  assert.match(panelSource, /onSelectVersion\(version\.id\)/);
  assert.doesNotMatch(panelSource, /onRevert\(selectedAsset\.id,\s*version\.id\)/);
});

test("leafer canvas refreshes image nodes when asset current versions change", () => {
  const adapterSource = readImageWorkspaceFile("leafer-canvas-adapter.ts");

  assert.match(adapterSource, /const previousAssetsById = latestAssetsById/);
  assert.match(adapterSource, /previousAssetsById\.get\(asset\.id\)/);
  assert.match(adapterSource, /getCanvasObjectVersion\(asset,\s*object,\s*previousAsset\)/);
  assert.match(adapterSource, /assetCurrentVersionChanged/);
  assert.match(
    adapterSource,
    /previousAsset\?\.currentVersionId !== asset\.currentVersionId/,
  );
  assert.match(
    adapterSource,
    /if \(assetCurrentVersionChanged && currentVersion\) return currentVersion/,
  );
});

test("asset version comparison images update the selected leafer image", () => {
  const panelSource = readImageWorkspaceFile("components/asset-version-panel.tsx");

  assert.match(panelSource, /onSelect=\{\(\) => onSelectVersion\(currentVersion\.id\)\}/);
  assert.match(panelSource, /onSelect=\{\(\) => onSelectVersion\(previousVersion\.id\)\}/);
  assert.match(panelSource, /function CompareVersion/);
  assert.match(panelSource, /onClick=\{onSelect\}/);
  assert.match(panelSource, /type="button"/);
});

test("asset version panel lazy-loads same-origin asset thumbnails", () => {
  const panelSource = readImageWorkspaceFile("components/asset-version-panel.tsx");

  assert.match(panelSource, /createImageAssetPreviewUrl/);
  assert.match(panelSource, /src=\{createImageAssetPreviewUrl\(asset\.id\)\}/);
  assert.match(panelSource, /loading="lazy"/);
  assert.match(panelSource, /decoding="async"/);
  assert.doesNotMatch(panelSource, /storageKey/);
});

test("image asset action controls are wired through the shell and hook", () => {
  const hookSource = readImageWorkspaceFile("use-image-workspace.ts");
  const shellSource = readImageWorkspaceFile("image-workspace-shell.tsx");
  const inspectorSource = readImageWorkspaceFile("components/inspector-panel.tsx");
  const panelSource = readImageWorkspaceFile("components/asset-version-panel.tsx");

  assert.match(hookSource, /createImageUpscale/);
  assert.match(hookSource, /createImageBackgroundRemoval/);
  assert.match(hookSource, /createImageAssetUpscaleTask/);
  assert.match(hookSource, /createImageAssetBackgroundRemovalTask/);
  assert.match(shellSource, /onUpscaleAsset/);
  assert.match(shellSource, /onRemoveBackgroundAsset/);
  assert.match(inspectorSource, /onUpscaleAsset/);
  assert.match(inspectorSource, /onRemoveBackgroundAsset/);
  assert.match(panelSource, /onUpscale\(selectedAsset\.id\)/);
  assert.match(panelSource, /onRemoveBackground\(selectedAsset\.id\)/);
});

test("image task stream hook parses ndjson and hides raw tool payloads", () => {
  const streamSource = readImageWorkspaceFile("use-image-task-stream.ts");

  assert.match(streamSource, /ReadableStream/);
  assert.match(streamSource, /getReader\(\)/);
  assert.match(streamSource, /TextDecoder/);
  assert.match(streamSource, /JSON\.parse/);
  assert.match(streamSource, /tool_call\|tool_result\|b64_json\|stack/i);
  assert.doesNotMatch(streamSource, /dangerouslySetInnerHTML/);
});

test("image task stream hook accepts asset updates from edit and variation tasks", () => {
  const streamSource = readImageWorkspaceFile("use-image-task-stream.ts");
  const hookSource = readImageWorkspaceFile("use-image-workspace.ts");

  assert.match(streamSource, /value\.type === "asset-updated"/);
  assert.match(streamSource, /value\.type === "asset-version-created"/);
  assert.match(streamSource, /type:\s*"asset-updated"/);
  assert.match(streamSource, /type:\s*"asset-version-created"/);
  assert.match(streamSource, /assetId:\s*value\.assetId/);
  assert.match(streamSource, /versionId:\s*value\.versionId/);
  assert.match(hookSource, /event\.type === "asset-created"/);
  assert.match(hookSource, /event\.type === "asset-updated"/);
  assert.match(hookSource, /event\.type === "asset-version-created"/);
});

test("image task stream hook accepts usage events without raw provider payloads", () => {
  const typesSource = readImageWorkspaceFile("types.ts");
  const streamSource = readImageWorkspaceFile("use-image-task-stream.ts");
  const hookSource = readImageWorkspaceFile("use-image-workspace.ts");

  assert.match(typesSource, /type:\s*"usage"/);
  assert.match(streamSource, /value\.type === "usage"/);
  assert.match(streamSource, /provider:\s*sanitizeTaskMessage\(value\.provider\)/);
  assert.match(streamSource, /cost:\s*sanitizeTaskMessage\(value\.cost\)/);
  assert.match(hookSource, /event\.type === "usage"/);
});

test("image task stream hook accepts task-created and asset-placeholder events", () => {
  const typesSource = readImageWorkspaceFile("types.ts");
  const streamSource = readImageWorkspaceFile("use-image-task-stream.ts");

  assert.match(typesSource, /type:\s*"task-created"/);
  assert.match(typesSource, /type:\s*"asset-placeholder"/);
  assert.match(streamSource, /value\.type === "task-created"/);
  assert.match(streamSource, /value\.type === "asset-placeholder"/);
  assert.match(streamSource, /taskType:\s*normalizeTaskType\(value\.taskType\)/);
  assert.match(streamSource, /objectId:\s*value\.objectId/);
});

test("image workspace recognizes expand task type in shared surfaces", () => {
  const typesSource = readImageWorkspaceFile("types.ts");
  const streamSource = readImageWorkspaceFile("use-image-task-stream.ts");
  const taskSource = readImageWorkspaceFile("components/task-inspector.tsx");

  assert.match(typesSource, /"expand"/);
  assert.match(streamSource, /value === "expand"/);
  assert.match(taskSource, /expand: "扩展图片"/);
});

test("image task stream hook accepts canvas-updated events and refreshes the workspace", () => {
  const typesSource = readImageWorkspaceFile("types.ts");
  const streamSource = readImageWorkspaceFile("use-image-task-stream.ts");
  const hookSource = readImageWorkspaceFile("use-image-workspace.ts");

  assert.match(typesSource, /type:\s*"canvas-updated"/);
  assert.match(streamSource, /value\.type === "canvas-updated"/);
  assert.match(streamSource, /workspaceId:\s*value\.workspaceId/);
  assert.match(streamSource, /objectIds:\s*value\.objectIds/);
  assert.match(hookSource, /event\.type === "canvas-updated"/);
  assert.match(hookSource, /reloadWorkspace\(event\.workspaceId\)/);
});

test("chat workspace has a visible entry point to the image workspace", () => {
  const chatShellSource = readFileSync(
    join(appDir, "agent-workspace", "workspace-shell.tsx"),
    "utf8",
  );

  assert.match(chatShellSource, /\/image-workspace/);
  assert.match(chatShellSource, /图像画布/);
});
