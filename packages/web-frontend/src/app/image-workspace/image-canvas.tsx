"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CanvasToolbar } from "./components/canvas-toolbar";
import { createLeaferCanvasController } from "./leafer-canvas-adapter";
import type { CanvasController } from "./leafer-canvas-types";
import type { CanvasSnapshot, ImageWorkspace } from "./types";
import { useCanvasPersistence } from "./use-canvas-persistence";

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
  const [readyCanvasKey, setReadyCanvasKey] = useState<string | null>(null);
  const [controller, setController] = useState<CanvasController | null>(null);
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const controllerRef = useRef<CanvasController | null>(null);
  const lastSelectedAssetRef = useRef<string | null>(null);
  const persistenceKey = workspace ? `mira-image-workspace:${workspace.id}` : null;
  const canvasReady = Boolean(persistenceKey && readyCanvasKey === persistenceKey);

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

    const nextController = createLeaferCanvasController({
      container: canvasHostRef.current,
      events: {
        onChange: () => undefined,
        onError: (message) => {
          console.error(message);
        },
        onReady: () => undefined,
        onSelectAsset: (assetId: string | null) => {
          if (lastSelectedAssetRef.current === assetId) return;

          lastSelectedAssetRef.current = assetId;
          onSelectAsset(assetId);
        },
      },
    });

    controllerRef.current = nextController;
    setController(nextController);

    return () => {
      nextController.destroy();
      if (controllerRef.current === nextController) {
        controllerRef.current = null;
      }
      setController((current) => (current === nextController ? null : current));
    };
  }, [canvasReady, onSelectAsset, persistenceKey]);

  useEffect(() => {
    if (!controller || !canvasReady) return;
    controller.hydrateWorkspace(workspace);
  }, [canvasReady, controller, workspace]);

  useEffect(() => {
    if (!controller) return;
    lastSelectedAssetRef.current = selectedAssetId;
    controller.selectAsset(selectedAssetId);
  }, [controller, selectedAssetId]);

  useCanvasPersistence({ controller, onPersistCanvas, workspace });

  const handleCanvasKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const currentController = controllerRef.current;
      if (!currentController) return;

      if (event.key === "Escape") {
        event.preventDefault();
        currentController.clearSelection();
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
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
    if (loading || !canvasReady) return "正在加载图像画布";
    if (!workspace) return "创建一个图像工作区后开始";
    return null;
  }, [canvasReady, loading, workspace]);

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
