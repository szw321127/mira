"use client";

import { useEffect, useRef } from "react";
import type { Editor, TLShape } from "tldraw";
import type { CanvasObject, CanvasSnapshot, ImageWorkspace } from "./types";

const CANVAS_SAVE_DEBOUNCE_MS = 700;

type UseCanvasPersistenceInput = {
  editor: Editor | null;
  workspace: ImageWorkspace | null;
  onPersistCanvas: (snapshot: CanvasSnapshot) => Promise<void> | void;
};

export function useCanvasPersistence({
  editor,
  onPersistCanvas,
  workspace,
}: UseCanvasPersistenceInput) {
  const persistRef = useRef<(snapshot: CanvasSnapshot) => Promise<void> | void>(
    (snapshot) => onPersistCanvas(snapshot),
  );
  const lastSnapshotJsonRef = useRef<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    persistRef.current = (snapshot) => onPersistCanvas(snapshot);
  }, [onPersistCanvas]);

  useEffect(() => {
    if (!editor || !workspace) return;

    const activeEditor = editor;
    lastSnapshotJsonRef.current = JSON.stringify(
      serializeCanvasSnapshot(activeEditor),
    );

    function scheduleSave() {
      const snapshot = serializeCanvasSnapshot(activeEditor);
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

    const unsubscribe = activeEditor.store.listen(scheduleSave);

    return () => {
      unsubscribe();
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [editor, workspace?.id]);
}

export function serializeCanvasSnapshot(editor: Editor): CanvasSnapshot {
  const camera = editor.getCamera();
  const objects = editor
    .getCurrentPageShapes()
    .map((shape, index) => serializeImageShape(shape, index))
    .filter((object): object is CanvasObject => object !== null);

  return {
    viewport: {
      x: camera.x,
      y: camera.y,
      zoom: camera.z,
    },
    objects,
  };
}

function serializeImageShape(shape: TLShape, zIndex: number): CanvasObject | null {
  if (shape.type !== "image") return null;

  const objectId = shape.meta?.miraObjectId;
  const assetId = shape.meta?.miraAssetId;
  if (typeof objectId !== "string" || typeof assetId !== "string") return null;

  const props = shape.props as { w?: unknown; h?: unknown };
  return {
    id: objectId,
    assetId,
    type: "image",
    x: normalizeFiniteNumber(shape.x, 0),
    y: normalizeFiniteNumber(shape.y, 0),
    width: normalizeFiniteNumber(props.w, 320),
    height: normalizeFiniteNumber(props.h, 320),
    rotation: normalizeFiniteNumber(shape.rotation, 0),
    zIndex,
    props: {},
  };
}

function normalizeFiniteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
