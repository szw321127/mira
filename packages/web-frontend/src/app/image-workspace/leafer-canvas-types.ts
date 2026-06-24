import type { CanvasSnapshot, ImageWorkspace } from "./types";

export type CanvasTool = "select" | "pan";

export type CanvasController = {
  clearSelection: () => void;
  deleteSelection: () => void;
  destroy: () => void;
  fitView: () => void;
  getActiveTool: () => CanvasTool;
  getCanRedo: () => boolean;
  getCanUndo: () => boolean;
  hydrateWorkspace: (workspace: ImageWorkspace | null) => void;
  redo: () => void;
  selectAsset: (assetId: string | null) => void;
  serializeSnapshot: () => CanvasSnapshot;
  setTool: (tool: CanvasTool) => void;
  subscribeChange: (listener: () => void) => () => void;
  undo: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
};

export type CanvasControllerEvents = {
  onChange: () => void;
  onError: (message: string) => void;
  onReady: () => void;
  onSelectAsset: (assetId: string | null) => void;
};
