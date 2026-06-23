import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workspaceDir = dirname(fileURLToPath(import.meta.url));
const appDir = join(workspaceDir, "..");

function readImageWorkspaceFile(fileName) {
  const filePath = join(workspaceDir, fileName);
  assert.equal(existsSync(filePath), true, `${fileName} should exist`);
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

test("image canvas is backed by tldraw and keeps an explicit canvas size", () => {
  const canvasSource = readImageWorkspaceFile("image-canvas.tsx");

  assert.match(canvasSource, /import\s*\{[\s\S]*Tldraw[\s\S]*\}\s*from\s*"tldraw"/);
  assert.match(canvasSource, /className="[^"]*h-full[^"]*w-full/);
  assert.match(canvasSource, /useEffect/);
  assert.match(canvasSource, /canvasReady/);
  assert.doesNotMatch(canvasSource, /<canvas/);
});

test("image canvas delays tldraw mount until after strict-mode effect replay", () => {
  const canvasSource = readImageWorkspaceFile("image-canvas.tsx");

  assert.match(canvasSource, /requestAnimationFrame/);
  assert.match(canvasSource, /cancelAnimationFrame/);
  assert.match(canvasSource, /setCanvasReady\(true\)/);
  assert.match(canvasSource, /setCanvasReady\(false\)/);
  assert.match(canvasSource, /persistenceKey/);
  assert.match(canvasSource, /<Tldraw[\s\S]*persistenceKey=\{persistenceKey\}/);
});

test("image canvas has a timer fallback when animation frames are throttled", () => {
  const canvasSource = readImageWorkspaceFile("image-canvas.tsx");

  assert.match(canvasSource, /setTimeout/);
  assert.match(canvasSource, /clearTimeout/);
  assert.match(canvasSource, /markCanvasReady/);
});

test("image canvas hydrates backend image assets into tldraw image shapes", () => {
  const canvasSource = readImageWorkspaceFile("image-canvas.tsx");
  const apiSource = readImageWorkspaceFile("workspace-api.ts");

  assert.match(canvasSource, /AssetRecordType/);
  assert.match(canvasSource, /createShapeId/);
  assert.match(canvasSource, /type\s+Editor/);
  assert.match(canvasSource, /type\s+TLImageAsset/);
  assert.match(canvasSource, /handleMount/);
  assert.match(canvasSource, /onMount=\{handleMount\}/);
  assert.match(canvasSource, /hydrateWorkspaceImages/);
  assert.match(canvasSource, /createImageAssetPreviewUrl/);
  assert.match(canvasSource, /editor\.createAssets/);
  assert.match(canvasSource, /editor\.createShapes/);
  assert.match(canvasSource, /type:\s*"image"/);
  assert.match(canvasSource, /miraAssetId/);
  assert.match(canvasSource, /miraObjectId/);
  assert.match(canvasSource, /w:\s*object\.width/);
  assert.match(canvasSource, /h:\s*object\.height/);
  assert.match(apiSource, /createImageAssetPreviewUrl/);
  assert.match(apiSource, /\/api\/image-assets\/\$\{encodeURIComponent\(assetId\)\}\/preview/);
});

test("image canvas removes stale Mira image shapes after backend asset deletion", () => {
  const canvasSource = readImageWorkspaceFile("image-canvas.tsx");

  assert.match(canvasSource, /removeStaleMiraImageShapes/);
  assert.match(canvasSource, /editor\.deleteShapes/);
  assert.match(canvasSource, /getCurrentPageShapes\(\)/);
  assert.match(canvasSource, /shape\.meta\?\.miraObjectId/);
  assert.match(canvasSource, /validShapeIds/);
  assert.match(canvasSource, /hydrateWorkspaceImages[\s\S]*removeStaleMiraImageShapes/);
});

test("image canvas selection updates the selected Mira asset", () => {
  const canvasSource = readImageWorkspaceFile("image-canvas.tsx");
  const shellSource = readImageWorkspaceFile("image-workspace-shell.tsx");

  assert.match(canvasSource, /onSelectAsset/);
  assert.match(canvasSource, /selectedAssetId/);
  assert.match(canvasSource, /editor\.store\.listen/);
  assert.match(canvasSource, /editor\.getSelectedShapeIds\(\)/);
  assert.match(canvasSource, /editor\.getShape/);
  assert.match(canvasSource, /shape\.meta\?\.miraAssetId/);
  assert.match(canvasSource, /onSelectAsset\(assetId\)/);
  assert.match(shellSource, /selectedAssetId/);
  assert.match(shellSource, /onSelectAsset=\{selectAsset\}/);
});

test("image canvas selection can be cleared without reselecting the first asset", () => {
  const canvasSource = readImageWorkspaceFile("image-canvas.tsx");
  const selectionSource = readImageWorkspaceFile("use-selected-image-asset.ts");

  assert.match(canvasSource, /onSelectAsset:\s*\(assetId:\s*string\s*\|\s*null\)/);
  assert.match(canvasSource, /onSelectAsset\(assetId\)/);
  assert.doesNotMatch(canvasSource, /if \(!assetId/);
  assert.match(selectionSource, /selectAsset:\s*\(assetId:\s*string\s*\|\s*null\)/);
  assert.doesNotMatch(selectionSource, /workspace\.assets\[0\]/);
  assert.doesNotMatch(selectionSource, /!selectedAssetId\s*\|\|/);
});

test("image canvas persists tldraw geometry and viewport through backend snapshots", () => {
  const pageSource = readImageWorkspaceFile("page.tsx");
  const shellSource = readImageWorkspaceFile("image-workspace-shell.tsx");
  const canvasSource = readImageWorkspaceFile("image-canvas.tsx");
  const persistenceSource = readImageWorkspaceFile("use-canvas-persistence.ts");

  assert.match(pageSource, /onPersistCanvas=\{workspace\.persistCanvas\}/);
  assert.match(shellSource, /onPersistCanvas/);
  assert.match(shellSource, /onPersistCanvas=\{onPersistCanvas\}/);
  assert.match(canvasSource, /useCanvasPersistence/);
  assert.match(canvasSource, /onPersistCanvas/);
  assert.match(persistenceSource, /getCurrentPageShapes\(\)/);
  assert.match(persistenceSource, /getCamera\(\)/);
  assert.match(persistenceSource, /miraObjectId/);
  assert.match(persistenceSource, /miraAssetId/);
  assert.match(persistenceSource, /window\.setTimeout/);
  assert.match(persistenceSource, /onPersistCanvas\(snapshot\)/);
});

test("image canvas exposes a focused Mira toolbar for common canvas actions", () => {
  const canvasSource = readImageWorkspaceFile("image-canvas.tsx");
  const toolbarSource = readImageWorkspaceFile("components/canvas-toolbar.tsx");

  assert.match(canvasSource, /CanvasToolbar/);
  assert.match(canvasSource, /editor=\{editor\}/);
  assert.match(toolbarSource, /export function CanvasToolbar/);
  assert.match(toolbarSource, /from "lucide-react"/);
  assert.match(toolbarSource, /MousePointer2/);
  assert.match(toolbarSource, /Hand/);
  assert.match(toolbarSource, /Frame/);
  assert.match(toolbarSource, /Undo2/);
  assert.match(toolbarSource, /Redo2/);
  assert.match(toolbarSource, /ZoomIn/);
  assert.match(toolbarSource, /ZoomOut/);
  assert.match(toolbarSource, /Maximize2/);
  assert.match(toolbarSource, /editor\.setCurrentTool\("select"\)/);
  assert.match(toolbarSource, /editor\.setCurrentTool\("hand"\)/);
  assert.match(toolbarSource, /editor\.setCurrentTool\("frame"\)/);
  assert.match(toolbarSource, /editor\.undo\(\)/);
  assert.match(toolbarSource, /editor\.redo\(\)/);
  assert.match(toolbarSource, /editor\.zoomIn\(\)/);
  assert.match(toolbarSource, /editor\.zoomOut\(\)/);
  assert.match(toolbarSource, /editor\.zoomToSelection/);
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
  assert.match(panelSource, /size:\s*"1024x1024"/);
  assert.match(panelSource, /quality:\s*"auto"/);
  assert.match(panelSource, /background:\s*"auto"/);
  assert.match(panelSource, /画幅/);
  assert.match(panelSource, /质量/);
  assert.match(panelSource, /背景/);
  assert.match(panelSource, /onGenerate\(prompt,\s*settings\)/);
  assert.match(apiSource, /size\?:\s*ImageGenerationSettings\["size"\]/);
  assert.match(apiSource, /quality\?:\s*ImageGenerationSettings\["quality"\]/);
  assert.match(apiSource, /background\?:\s*ImageGenerationSettings\["background"\]/);
  assert.match(hookSource, /generateImage\(prompt: string,\s*settings: ImageGenerationSettings/);
  assert.match(hookSource, /\.\.\.settings/);
  assert.match(shellSource, /onGenerate:\s*\(prompt: string,\s*settings: ImageGenerationSettings\)/);
  assert.match(inspectorSource, /onGenerate:\s*\(prompt: string,\s*settings: ImageGenerationSettings\)/);
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

test("asset version panel supports drawing and uploading an edit mask", () => {
  const panelSource = readImageWorkspaceFile("components/asset-version-panel.tsx");
  const inspectorSource = readImageWorkspaceFile("components/inspector-panel.tsx");
  const shellSource = readImageWorkspaceFile("image-workspace-shell.tsx");
  const apiSource = readImageWorkspaceFile("workspace-api.ts");

  assert.match(panelSource, /maskCanvasRef/);
  assert.match(panelSource, /onPointerDown/);
  assert.match(panelSource, /onPointerMove/);
  assert.match(panelSource, /toDataURL\("image\/png"\)/);
  assert.match(panelSource, /onUploadMask\(\s*selectedAsset\.id/);
  assert.match(panelSource, /onEdit\(selectedAsset\.id,\s*prompt,\s*maskId/);
  assert.match(panelSource, /\.maskId/);
  assert.doesNotMatch(panelSource, /maskKey/);
  assert.doesNotMatch(apiSource, /maskKey\?: string/);
  assert.match(inspectorSource, /onUploadMask/);
  assert.match(shellSource, /onUploadMask/);
});

test("image workspace has a focused asset version panel component", () => {
  const panelSource = readImageWorkspaceFile("components/asset-version-panel.tsx");
  const inspectorSource = readImageWorkspaceFile("components/inspector-panel.tsx");
  const selectionSource = readImageWorkspaceFile("use-selected-image-asset.ts");
  const shellSource = readImageWorkspaceFile("image-workspace-shell.tsx");

  assert.match(panelSource, /AssetVersionPanel/);
  assert.match(panelSource, /onEdit/);
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
