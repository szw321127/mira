"use client";

import { useEffect, useRef } from "react";
import type { CanvasController } from "./leafer-canvas-types";
import type { CanvasSnapshot, ImageWorkspace } from "./types";

const CANVAS_SAVE_DEBOUNCE_MS = 700;

type UseCanvasPersistenceInput = {
  controller: CanvasController | null;
  workspace: ImageWorkspace | null;
  onPersistCanvas: (snapshot: CanvasSnapshot) => Promise<void> | void;
};

export function useCanvasPersistence({
  controller,
  onPersistCanvas,
  workspace,
}: UseCanvasPersistenceInput) {
  const persistRef = useRef<(snapshot: CanvasSnapshot) => Promise<void> | void>(
    (snapshot) => onPersistCanvas(snapshot),
  );
  const lastSnapshotJsonRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);
  const workspaceId = workspace?.id ?? null;

  useEffect(() => {
    persistRef.current = (snapshot) => onPersistCanvas(snapshot);
  }, [onPersistCanvas]);

  useEffect(() => {
    if (!controller || !workspaceId) return;

    const activeController = controller;
    lastSnapshotJsonRef.current = JSON.stringify(
      activeController.serializeSnapshot(),
    );

    function scheduleSave() {
      const snapshot = activeController.serializeSnapshot();
      const snapshotJson = JSON.stringify(snapshot);
      if (snapshotJson === lastSnapshotJsonRef.current) return;

      lastSnapshotJsonRef.current = snapshotJson;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }

      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        void persistRef.current(snapshot);
      }, CANVAS_SAVE_DEBOUNCE_MS);
    }

    const unsubscribe = activeController.subscribeChange(scheduleSave);

    return () => {
      unsubscribe();
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [controller, workspaceId]);
}
