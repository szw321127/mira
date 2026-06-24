import type { CanvasSnapshot, ImageWorkspace } from "./types";

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

export type LocalEditOverlayState = {
  assetId: string | null;
  dirty: boolean;
  markerRadius: number;
  source: "mask" | "marker" | null;
};

export type CanvasController = {
  clearLocalEditOverlay: () => void;
  clearSelection: () => void;
  deleteSelection: () => void;
  destroy: () => void;
  exportLocalEditMask: (
    input: LocalEditMaskExportInput,
  ) => LocalEditMaskExportResult;
  fitView: () => void;
  getActiveTool: () => CanvasTool;
  getCanRedo: () => boolean;
  getCanUndo: () => boolean;
  getLocalEditOverlayState: () => LocalEditOverlayState;
  hydrateWorkspace: (workspace: ImageWorkspace | null) => void;
  redo: () => void;
  selectAsset: (assetId: string | null) => void;
  serializeSnapshot: () => CanvasSnapshot;
  setLocalEditMarkerRadius: (radius: number) => void;
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
