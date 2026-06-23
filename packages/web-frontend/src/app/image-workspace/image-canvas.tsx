"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AssetRecordType,
  createShapeId,
  Tldraw,
  type Editor,
  type TLImageAsset,
  type TLShapeId,
  type TLShapePartial
} from "tldraw";
import "tldraw/tldraw.css";
import { CanvasToolbar } from "./components/canvas-toolbar";
import type { CanvasSnapshot, ImageAsset, ImageWorkspace } from "./types";
import { useCanvasPersistence } from "./use-canvas-persistence";
import { createImageAssetPreviewUrl } from "./workspace-api";

export function ImageCanvas({
  loading,
  onPersistCanvas,
  onSelectAsset,
  selectedAssetId,
  workspace,
}: {
  loading: boolean;
  onPersistCanvas: (snapshot: CanvasSnapshot) => Promise<void> | void;
  onSelectAsset: (assetId: string | null) => void;
  selectedAssetId: string | null;
  workspace: ImageWorkspace | null;
}) {
  const [canvasReady, setCanvasReady] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const lastSelectedAssetRef = useRef<string | null>(null);
  const persistenceKey = workspace ? `mira-image-workspace:${workspace.id}` : null;

  useEffect(() => {
    setCanvasReady(false);
    if (!persistenceKey) return;

    let ready = false;
    const markCanvasReady = () => {
      if (ready) return;
      ready = true;
      setCanvasReady(true);
    };

    const frame = window.requestAnimationFrame(markCanvasReady);
    const timeout = window.setTimeout(markCanvasReady, 120);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [persistenceKey]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !workspace || !canvasReady) return;
    hydrateWorkspaceImages(editor, workspace);
    applyWorkspaceViewport(editor, workspace);
  }, [canvasReady, workspace]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !workspace) return;

    if (!selectedAssetId) {
      lastSelectedAssetRef.current = null;
      if (editor.getSelectedShapeIds().length) {
        editor.setSelectedShapes([]);
      }
      return;
    }

    const shapeId = findShapeIdForAsset(workspace, selectedAssetId);
    if (!shapeId || editor.getSelectedShapeIds()[0] === shapeId) return;

    lastSelectedAssetRef.current = selectedAssetId;
    editor.setSelectedShapes([shapeId]);
  }, [selectedAssetId, workspace]);

  useCanvasPersistence({ editor, onPersistCanvas, workspace });

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;
      setEditor(editor);
      hydrateWorkspaceImages(editor, workspace);
      applyWorkspaceViewport(editor, workspace);

      const unsubscribe = editor.store.listen(() => {
        const assetId = readSelectedMiraAssetId(editor);
        if (lastSelectedAssetRef.current === assetId) return;

        lastSelectedAssetRef.current = assetId;
        onSelectAsset(assetId);
      });

      return () => {
        unsubscribe();
        editorRef.current = null;
        setEditor(null);
      };
    },
    [onSelectAsset, workspace],
  );

  return (
    <div className="relative h-full w-full overflow-hidden bg-[var(--surface-muted)]">
      {canvasReady && persistenceKey ? (
        <Tldraw
          key={persistenceKey}
          onMount={handleMount}
          persistenceKey={persistenceKey}
        />
      ) : null}
      {canvasReady && workspace ? <CanvasToolbar editor={editor} /> : null}
      {loading || !workspace || !canvasReady ? (
        <div className="pointer-events-none absolute inset-x-4 top-4 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted-strong)]">
          {loading || !canvasReady ? "正在加载图像画布" : "创建一个图像工作区后开始"}
        </div>
      ) : null}
    </div>
  );
}

export function hydrateWorkspaceImages(
  editor: Editor,
  workspace: ImageWorkspace | null,
) {
  if (!workspace) return;

  const assetsById = new Map(workspace.assets.map((asset) => [asset.id, asset]));
  const imageObjects = workspace.objects.filter((object) => {
    return object.assetId && object.type === "image" && assetsById.has(object.assetId);
  });
  const validShapeIds = new Set(
    imageObjects.map((object) => createShapeId(`mira-${object.id}`)),
  );
  removeStaleMiraImageShapes(editor, validShapeIds);
  if (!imageObjects.length) return;

  const assetsToCreate: TLImageAsset[] = [];
  const shapesToCreate: TLShapePartial[] = [];
  const shapesToUpdate: TLShapePartial[] = [];

  for (const object of imageObjects) {
    const asset = object.assetId ? assetsById.get(object.assetId) : null;
    const version = asset ? getCurrentVersion(asset) : null;
    if (!asset || !version) continue;

    const tldrawAssetId = AssetRecordType.createId(
      `mira-${asset.id}-${version.id}`,
    );
    if (!editor.getAsset(tldrawAssetId)) {
      assetsToCreate.push({
        id: tldrawAssetId,
        typeName: "asset",
        type: "image",
        props: {
          fileSize: version.sizeBytes,
          h: version.height || object.height,
          isAnimated: false,
          mimeType: version.mimeType,
          name: asset.title || asset.prompt || "Mira image",
          src: createImageAssetPreviewUrl(asset.id),
          w: version.width || object.width,
        },
        meta: {
          miraAssetId: asset.id,
          miraVersionId: version.id,
        },
      });
    }

    const shapeId = createShapeId(`mira-${object.id}`);
    const shape: TLShapePartial = {
      id: shapeId,
      type: "image",
      x: object.x,
      y: object.y,
      rotation: object.rotation,
      props: {
        assetId: tldrawAssetId,
        h: object.height || version.height || 320,
        w: object.width || version.width || 320,
      },
      meta: {
        miraAssetId: asset.id,
        miraObjectId: object.id,
        miraVersionId: version.id,
      },
    };

    if (editor.getShape(shapeId)) {
      shapesToUpdate.push(shape);
    } else {
      shapesToCreate.push(shape);
    }
  }

  if (assetsToCreate.length) {
    editor.createAssets(assetsToCreate);
  }
  if (shapesToCreate.length) {
    editor.createShapes(shapesToCreate);
  }
  if (shapesToUpdate.length) {
    editor.updateShapes(shapesToUpdate);
  }
}

function removeStaleMiraImageShapes(
  editor: Editor,
  validShapeIds: Set<TLShapeId>,
) {
  const staleShapeIds = editor
    .getCurrentPageShapes()
    .filter((shape) => {
      return (
        shape.type === "image" &&
        typeof shape.meta?.miraObjectId === "string" &&
        !validShapeIds.has(shape.id)
      );
    })
    .map((shape) => shape.id);

  if (staleShapeIds.length) {
    editor.deleteShapes(staleShapeIds);
  }
}

function findShapeIdForAsset(workspace: ImageWorkspace, assetId: string) {
  const object = workspace.objects.find((item) => item.assetId === assetId);
  return object ? createShapeId(`mira-${object.id}`) : null;
}

function readSelectedMiraAssetId(editor: Editor) {
  const selectedShapeId = editor.getSelectedShapeIds()[0];
  if (!selectedShapeId) return null;

  const shape = editor.getShape(selectedShapeId);
  if (!shape) return null;

  const assetId = shape.meta?.miraAssetId;
  return typeof assetId === "string" ? assetId : null;
}

function applyWorkspaceViewport(
  editor: Editor,
  workspace: ImageWorkspace | null,
) {
  if (!workspace?.viewport) return;

  const x = readFiniteNumber(workspace.viewport.x);
  const y = readFiniteNumber(workspace.viewport.y);
  const zoom = readFiniteNumber(workspace.viewport.zoom);
  if (x === null || y === null || zoom === null) return;

  const current = editor.getCamera();
  if (current.x === x && current.y === y && current.z === zoom) return;
  editor.setCamera({ x, y, z: zoom });
}

function readFiniteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getCurrentVersion(asset: ImageAsset) {
  return (
    asset.versions.find((version) => version.id === asset.currentVersionId) ??
    asset.versions[0] ??
    null
  );
}
