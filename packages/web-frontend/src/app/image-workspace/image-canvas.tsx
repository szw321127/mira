"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CanvasToolbar } from "./components/canvas-toolbar";
import { createLeaferCanvasController } from "./leafer-canvas-adapter";
import type {
  CanvasAssetSelection,
  CanvasController,
} from "./leafer-canvas-types";
import type { CanvasSnapshot, ImageWorkspace } from "./types";
import { useCanvasPersistence } from "./use-canvas-persistence";

export function ImageCanvas({
  loading,
  onControllerReady,
  onPersistCanvas,
  onSelectAsset,
  selectedAssetId,
  selectedObjectId,
  selectedVersionId,
  workspace,
}: {
  loading: boolean;
  onControllerReady?: (controller: CanvasController | null) => void;
  onPersistCanvas: (snapshot: CanvasSnapshot) => Promise<void> | void;
  onSelectAsset: (selection: CanvasAssetSelection) => void;
  selectedAssetId: string | null;
  selectedObjectId: string | null;
  selectedVersionId: string | null;
  workspace: ImageWorkspace | null;
}) {
  const [canvasError, setCanvasError] = useState<string | null>(null);
  const [readyCanvasKey, setReadyCanvasKey] = useState<string | null>(null);
  const [controller, setController] = useState<CanvasController | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<CanvasController | null>(null);
  const eventsRef = useRef({ onSelectAsset });
  const lastSelectedAssetRef = useRef<string>("");
  const readyCallbackRef = useRef(onControllerReady);
  const persistenceKey = workspace ? `mira-image-workspace:${workspace.id}` : null;
  const canvasReady = Boolean(persistenceKey && readyCanvasKey === persistenceKey);

  useEffect(() => {
    eventsRef.current.onSelectAsset = onSelectAsset;
    readyCallbackRef.current = onControllerReady;
  }, [onControllerReady, onSelectAsset]);

  useEffect(() => {
    if (!persistenceKey) return;

    let ready = false;
    const markCanvasReady = () => {
      if (ready) return;
      ready = true;
      setReadyCanvasKey(persistenceKey);
    };

    const frame = window.requestAnimationFrame(markCanvasReady);
    const timeout = window.setTimeout(markCanvasReady, 120);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [persistenceKey]);

  useEffect(() => {
    if (!canvasReady || !persistenceKey || !canvasHostRef.current) return;

    let cancelled = false;
    let mountedController: CanvasController | null = null;
    setCanvasError(null);

    void createLeaferCanvasController({
      container: canvasHostRef.current,
      events: {
        onChange: () => undefined,
        onError: (message) => {
          console.error(message);
        },
        onReady: () => undefined,
        onSelectAsset: (selection: CanvasAssetSelection) => {
          const selectionKey = createSelectionKey(selection);
          if (lastSelectedAssetRef.current === selectionKey) return;

          lastSelectedAssetRef.current = selectionKey;
          eventsRef.current.onSelectAsset(selection);
        },
      },
    })
      .then((nextController) => {
        if (cancelled) {
          nextController.destroy();
          return;
        }
        mountedController = nextController;
        controllerRef.current = nextController;
        setController(nextController);
        readyCallbackRef.current?.(nextController);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error(error);
        setCanvasError("图像画布加载失败，请刷新后重试");
      });

    return () => {
      cancelled = true;
      mountedController?.destroy();
      if (controllerRef.current === mountedController) {
        controllerRef.current = null;
      }
      if (mountedController) {
        readyCallbackRef.current?.(null);
      }
      setController((current) => (current === mountedController ? null : current));
    };
  }, [canvasReady, persistenceKey]);

  useEffect(() => {
    if (!controller || !canvasReady) return;
    controller.hydrateWorkspace(workspace);
  }, [canvasReady, controller, workspace]);

  useEffect(() => {
    if (!controller) return;
    const selection = {
      assetId: selectedAssetId,
      objectId: selectedObjectId,
      selectedVersionId,
    };
    lastSelectedAssetRef.current = createSelectionKey(selection);
    controller.selectAsset(selection);
  }, [controller, selectedAssetId, selectedObjectId, selectedVersionId]);

  useCanvasPersistence({ controller, onPersistCanvas, workspace });

  const handleCanvasKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const currentController = controllerRef.current;
      if (!currentController) return;

      if (event.key === "Escape") {
        event.preventDefault();
        if (currentController.getLocalEditOverlayState().dirty) {
          currentController.clearLocalEditOverlay();
          return;
        }
        currentController.clearSelection();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        if (currentController.getActiveTool() !== "select") return;
        event.preventDefault();
        if (currentController.getLocalEditOverlayState().dirty) {
          currentController.clearLocalEditOverlay();
          return;
        }
        currentController.deleteSelection();
        return;
      }

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        currentController.zoomIn();
        return;
      }

      if (event.key === "-") {
        event.preventDefault();
        currentController.zoomOut();
      }
    },
    [],
  );

  const loadingMessage = useMemo(() => {
    if (canvasError) return canvasError;
    if (loading || !canvasReady) return "正在加载图像画布";
    if (!workspace) return "创建一个图像工作区后开始";
    return null;
  }, [canvasError, canvasReady, loading, workspace]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[var(--surface-muted)]">
      {persistenceKey ? (
        <div
          aria-label="图像画布"
          className="h-full w-full"
          onKeyDown={handleCanvasKeyDown}
          ref={canvasHostRef}
          tabIndex={0}
        />
      ) : null}
      {canvasReady && workspace ? <CanvasToolbar controller={controller} /> : null}
      {loadingMessage ? (
        <div className="pointer-events-none absolute inset-x-4 top-4 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--muted-strong)]">
          {loadingMessage}
        </div>
      ) : null}
    </div>
  );
}

function createSelectionKey(selection: CanvasAssetSelection) {
  return [
    selection.assetId ?? "",
    selection.objectId ?? "",
    selection.selectedVersionId ?? "",
  ].join(":");
}
