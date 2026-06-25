import type { CanvasSnapshot, ImageWorkspace } from "./types";

export type CanvasTool = "select" | "pan" | "mask" | "marker";

export type CanvasAssetSelection = {
  assetId: string | null;
  objectId: string | null;
  selectedVersionId: string | null;
};

export type LocalExpandMode = "free" | "ratio" | "direction";

export type LocalExpandDirection = "left" | "right" | "top" | "bottom" | "around";

export type LocalExpandPadding = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type LocalExpandOverlayState = {
  active: boolean;
  assetId: string | null;
  versionId: string | null;
  mode: LocalExpandMode;
  aspectRatio: "1:1" | "2:1" | "4:3" | "16:9" | "1:2" | "3:4" | "9:16";
  direction: LocalExpandDirection;
  percent: number;
  padding: LocalExpandPadding;
  target: { width: number; height: number } | null;
};

export type LocalExpandExportInput = {
  assetId: string;
  versionId: string;
  width: number;
  height: number;
};

export type LocalExpandExportResult = {
  promptDefaults: string;
  versionId: string;
  mode: LocalExpandMode;
  aspectRatio?: LocalExpandOverlayState["aspectRatio"];
  direction?: LocalExpandDirection;
  percent?: number;
  padding: LocalExpandPadding;
  target: { width: number; height: number };
};

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
  brushSize: number;
  dirty: boolean;
  markerRadius: number;
  source: "mask" | "marker" | null;
};

export type CanvasController = {
  clearLocalExpandOverlay: () => void;
  clearLocalEditOverlay: () => void;
  clearSelection: () => void;
  deleteSelection: () => void;
  destroy: () => void;
  exportLocalExpandInput: (
    input: LocalExpandExportInput,
  ) => LocalExpandExportResult | null;
  exportLocalEditMask: (
    input: LocalEditMaskExportInput,
  ) => LocalEditMaskExportResult;
  fitView: () => void;
  getActiveTool: () => CanvasTool;
  getCanRedo: () => boolean;
  getCanUndo: () => boolean;
  getLocalExpandState: () => LocalExpandOverlayState;
  getLocalEditOverlayState: () => LocalEditOverlayState;
  hydrateWorkspace: (workspace: ImageWorkspace | null) => void;
  redo: () => void;
  selectAsset: (selection: CanvasAssetSelection | string | null) => void;
  serializeSnapshot: () => CanvasSnapshot;
  setSelectedAssetVersion: (versionId: string) => void;
  setLocalExpandAspectRatio: (
    aspectRatio: LocalExpandOverlayState["aspectRatio"],
  ) => void;
  setLocalExpandDirection: (direction: LocalExpandDirection) => void;
  setLocalExpandMode: (mode: LocalExpandMode) => void;
  setLocalExpandPadding: (padding: Partial<LocalExpandPadding>) => void;
  setLocalExpandPercent: (percent: number) => void;
  setLocalEditBrushSize: (size: number) => void;
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
  onSelectAsset: (selection: CanvasAssetSelection) => void;
};
