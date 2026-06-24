import type { IApp, IGroup, IImage, IPen, IUI } from "leafer-ui";
import type {
  CanvasAssetSelection,
  CanvasController,
  CanvasControllerEvents,
  CanvasTool,
  LocalExpandDirection,
  LocalExpandExportInput,
  LocalExpandMode,
  LocalExpandOverlayState,
  LocalExpandPadding,
  LocalEditMaskExportInput,
} from "./leafer-canvas-types";
import type {
  CanvasObject,
  CanvasSnapshot,
  CanvasViewport,
  ImageAsset,
  ImageWorkspace,
} from "./types";
import {
  createImageAssetPreviewUrl,
  createImageVersionPreviewUrl,
} from "./workspace-api";

type MiraImageMeta = {
  miraAssetId: string;
  miraObjectId: string;
  miraProps: Record<string, unknown>;
  miraVersionId: string;
};

type MiraImageNode = IImage & {
  __mira?: MiraImageMeta;
  draggable?: boolean;
  editable?: boolean;
  remove: () => void;
};

type LeaferEditor = {
  cancel: () => void;
  select: (target: IUI | IUI[]) => void;
  target?: IUI | IUI[];
};

type LeaferAppWithEditor = IApp & {
  editor: LeaferEditor;
  tree: IGroup;
};

type ControllerOptions = {
  container: HTMLDivElement;
  events: CanvasControllerEvents;
};

type PointerLike = {
  current?: { x?: number; y?: number };
  getInnerPoint?: (relative?: unknown) => { x?: number; y?: number };
  getLocalPoint?: (relative?: unknown) => { x?: number; y?: number };
  x?: number;
  y?: number;
};

type LocalEditPoint = {
  x: number;
  y: number;
};

type LocalEditStroke = {
  assetId: string;
  points: LocalEditPoint[];
  versionId: string;
};

type LocalEditMarker = {
  assetId: string;
  center: LocalEditPoint;
  radius: number;
  versionId: string;
};

type ExpandHandlePosition =
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

type ExpandHandleNode = IUI & {
  __miraExpandHandle?: ExpandHandlePosition;
};

type LocalExpandDrag = {
  handle: ExpandHandlePosition;
  startPadding: LocalExpandPadding;
  startPointer: LocalEditPoint;
};

type ParsedExpandAspectRatio = { width: number; height: number };

type LocalEditOverlaySnapshot = {
  activeMaskAssetId: string | null;
  activeMaskVersionId: string | null;
  currentMaskStroke: LocalEditPoint[] | null;
  marker: LocalEditMarker | null;
  markerRadius: number;
  maskStrokes: LocalEditStroke[];
};

const DEFAULT_OBJECT_SIZE = 320;
const DEFAULT_VIEWPORT: CanvasViewport = { x: 0, y: 0, zoom: 1 };
const DEFAULT_EXPAND_PERCENT = 0.25;
const EXPAND_HANDLE_SIZE = 10;
const EXPAND_PROMPT_DEFAULTS = "自然扩展图片画面，保持原图主体、风格和光照一致";
const DEFAULT_MARKER_RADIUS = 96;
const MASK_BRUSH_RADIUS = 17;
const MAX_MARKER_RADIUS = 260;
const MAX_EXPAND_PADDING = 8192;
const MIN_EXPAND_PERCENT = 0.1;
const MAX_EXPAND_PERCENT = 1;
const MIN_MARKER_RADIUS = 24;
const MIN_ZOOM = 0.18;
const MAX_ZOOM = 4;

export function createLeaferCanvasController({
  container,
  events,
}: ControllerOptions): Promise<CanvasController> {
  return createLoadedLeaferCanvasController({ container, events });
}

async function createLoadedLeaferCanvasController({
  container,
  events,
}: ControllerOptions): Promise<CanvasController> {
  const [{ App, Ellipse, Group, Image, Pen, PointerEvent, Rect }] = await Promise.all([
    import("leafer-ui"),
    import("leafer-editor"),
  ]);

  let activeTool: CanvasTool = "select";
  let destroyed = false;
  let viewport: CanvasViewport = { ...DEFAULT_VIEWPORT };
  let selectedAssetId: string | null = null;
  let selectedObjectId: string | null = null;
  let selectedVersionId: string | null = null;
  let latestAssetsById = new Map<string, ImageAsset>();
  let activeMaskAssetId: string | null = null;
  let activeMaskVersionId: string | null = null;
  let currentMaskStroke: LocalEditPoint[] | null = null;
  let localExpandState: LocalExpandOverlayState = createDefaultLocalExpandState();
  let localExpandDrag: LocalExpandDrag | null = null;
  let marker: LocalEditMarker | null = null;
  let markerRadius = DEFAULT_MARKER_RADIUS;
  let maskStrokes: LocalEditStroke[] = [];
  let isPanning = false;
  let panStart: { pointer: { x: number; y: number }; viewport: CanvasViewport } | null =
    null;
  const changeListeners = new Set<() => void>();
  let localEditGestureStartSnapshot: LocalEditOverlaySnapshot | null = null;
  let localEditRedoStack: LocalEditOverlaySnapshot[] = [];
  let localEditUndoStack: LocalEditOverlaySnapshot[] = [];
  let currentLocalEditHistorySnapshot: LocalEditOverlaySnapshot = {
    activeMaskAssetId: null,
    activeMaskVersionId: null,
    currentMaskStroke: null,
    marker: null,
    markerRadius,
    maskStrokes: [],
  };

  const app = new App({
    editor: {},
    height: Math.max(1, container.clientHeight),
    view: container,
    width: Math.max(1, container.clientWidth),
  }) as LeaferAppWithEditor;
  const imageLayer = new Group({ x: 0, y: 0 }) as IGroup;
  const maskLayer = new Group({
    hitChildren: false,
    hitSelf: false,
    hittable: false,
    x: 0,
    y: 0,
  }) as IGroup;
  const markerLayer = new Group({
    hitChildren: false,
    hitSelf: false,
    hittable: false,
    x: 0,
    y: 0,
  }) as IGroup;
  const expandLayer = new Group({
    hitChildren: true,
    hitSelf: false,
    hittable: true,
    x: 0,
    y: 0,
  }) as IGroup;
  const editor = app.editor as LeaferEditor;

  app.tree.add(imageLayer);
  app.tree.add(maskLayer);
  app.tree.add(markerLayer);
  app.tree.add(expandLayer);

  const resizeObserver = new ResizeObserver(() => {
    safeCall(() => {
      app.resize({
        height: Math.max(1, container.clientHeight),
        width: Math.max(1, container.clientWidth),
      });
    });
  });
  resizeObserver.observe(container);

  const emitChange = () => {
    if (destroyed) return;
    events.onChange();
    changeListeners.forEach((listener) => listener());
  };

  const emitSelection = (selection: CanvasAssetSelection) => {
    if (
      selectedAssetId === selection.assetId &&
      selectedObjectId === selection.objectId &&
      selectedVersionId === selection.selectedVersionId
    ) {
      return;
    }

    selectedAssetId = selection.assetId;
    selectedObjectId = selection.objectId;
    selectedVersionId = selection.selectedVersionId;
    events.onSelectAsset(selection);
    emitChange();
  };

  const setViewport = (nextViewport: CanvasViewport, shouldEmit = true) => {
    viewport = {
      x: normalizeFiniteNumber(nextViewport.x, DEFAULT_VIEWPORT.x),
      y: normalizeFiniteNumber(nextViewport.y, DEFAULT_VIEWPORT.y),
      zoom: clamp(
        normalizeFiniteNumber(nextViewport.zoom, DEFAULT_VIEWPORT.zoom),
        MIN_ZOOM,
        MAX_ZOOM,
      ),
    };
    imageLayer.x = viewport.x;
    imageLayer.y = viewport.y;
    imageLayer.scaleX = viewport.zoom;
    imageLayer.scaleY = viewport.zoom;
    maskLayer.x = viewport.x;
    maskLayer.y = viewport.y;
    maskLayer.scaleX = viewport.zoom;
    maskLayer.scaleY = viewport.zoom;
    markerLayer.x = viewport.x;
    markerLayer.y = viewport.y;
    markerLayer.scaleX = viewport.zoom;
    markerLayer.scaleY = viewport.zoom;
    expandLayer.x = viewport.x;
    expandLayer.y = viewport.y;
    expandLayer.scaleX = viewport.zoom;
    expandLayer.scaleY = viewport.zoom;
    if (shouldEmit) emitChange();
  };

  const applySelectionToEditor = (node: MiraImageNode | null) => {
    safeCall(() => {
      if (!node) {
        editor.cancel();
        return;
      }
      editor.select(node);
    });
  };

  const readSelectedNode = () => {
    const target = editor.target;
    const editorNode = Array.isArray(target)
      ? toMiraImageNode(target[0])
      : toMiraImageNode(target);
    if (editorNode) return editorNode;
    return findMiraImageNodeBySelection(imageLayer, {
      assetId: selectedAssetId,
      objectId: selectedObjectId,
      selectedVersionId,
    });
  };

  const applyToolInteractionState = () => {
    const canEdit = activeTool === "select";
    for (const node of readMiraImageNodes(imageLayer)) {
      node.draggable = canEdit;
      node.editable = canEdit;
    }
    if (canEdit) {
      applySelectionToEditor(readSelectedNode());
      return;
    }
    applySelectionToEditor(null);
  };

  const cloneLocalEditPoint = (point: LocalEditPoint): LocalEditPoint => ({
    x: point.x,
    y: point.y,
  });

  const cloneLocalEditStroke = (stroke: LocalEditStroke): LocalEditStroke => ({
    assetId: stroke.assetId,
    points: stroke.points.map(cloneLocalEditPoint),
    versionId: stroke.versionId,
  });

  const cloneLocalEditMarker = (
    value: LocalEditMarker | null,
  ): LocalEditMarker | null => {
    if (!value) return null;
    return {
      assetId: value.assetId,
      center: cloneLocalEditPoint(value.center),
      radius: value.radius,
      versionId: value.versionId,
    };
  };

  const cloneLocalEditSnapshot = (
    snapshot: LocalEditOverlaySnapshot,
  ): LocalEditOverlaySnapshot => ({
    activeMaskAssetId: snapshot.activeMaskAssetId,
    activeMaskVersionId: snapshot.activeMaskVersionId,
    currentMaskStroke: snapshot.currentMaskStroke
      ? snapshot.currentMaskStroke.map(cloneLocalEditPoint)
      : null,
    marker: cloneLocalEditMarker(snapshot.marker),
    markerRadius: snapshot.markerRadius,
    maskStrokes: snapshot.maskStrokes.map(cloneLocalEditStroke),
  });

  const captureLocalEditSnapshot = (): LocalEditOverlaySnapshot => ({
    activeMaskAssetId,
    activeMaskVersionId,
    currentMaskStroke: currentMaskStroke
      ? currentMaskStroke.map(cloneLocalEditPoint)
      : null,
    marker: cloneLocalEditMarker(marker),
    markerRadius,
    maskStrokes: maskStrokes.map(cloneLocalEditStroke),
  });

  const applyLocalEditSnapshot = (snapshot: LocalEditOverlaySnapshot) => {
    activeMaskAssetId = snapshot.activeMaskAssetId;
    activeMaskVersionId = snapshot.activeMaskVersionId;
    currentMaskStroke = snapshot.currentMaskStroke
      ? snapshot.currentMaskStroke.map(cloneLocalEditPoint)
      : null;
    marker = cloneLocalEditMarker(snapshot.marker);
    markerRadius = snapshot.markerRadius;
    maskStrokes = snapshot.maskStrokes.map(cloneLocalEditStroke);
    renderMaskOverlay();
    renderMarkerOverlay();
  };

  const localEditSnapshotsEqual = (
    left: LocalEditOverlaySnapshot,
    right: LocalEditOverlaySnapshot,
  ) => JSON.stringify(left) === JSON.stringify(right);

  const resetLocalEditHistory = () => {
    localEditGestureStartSnapshot = null;
    localEditRedoStack = [];
    localEditUndoStack = [];
    currentLocalEditHistorySnapshot = captureLocalEditSnapshot();
  };

  const pushLocalEditHistory = (beforeSnapshot: LocalEditOverlaySnapshot) => {
    const nextSnapshot = captureLocalEditSnapshot();
    if (localEditSnapshotsEqual(beforeSnapshot, nextSnapshot)) {
      currentLocalEditHistorySnapshot = nextSnapshot;
      return;
    }
    localEditUndoStack = [...localEditUndoStack, cloneLocalEditSnapshot(beforeSnapshot)];
    localEditRedoStack = [];
    currentLocalEditHistorySnapshot = nextSnapshot;
  };

  const clearLocalEditOverlay = (shouldEmit = true) => {
    activeMaskAssetId = null;
    activeMaskVersionId = null;
    currentMaskStroke = null;
    marker = null;
    maskStrokes = [];
    maskLayer.removeAll();
    markerLayer.removeAll();
    resetLocalEditHistory();
    if (shouldEmit) emitChange();
  };

  const clearLocalExpandOverlay = (shouldEmit = true) => {
    localExpandState = {
      ...localExpandState,
      active: false,
      assetId: null,
      versionId: null,
      padding: createEmptyExpandPadding(),
      target: null,
    };
    localExpandDrag = null;
    expandLayer.removeAll();
    if (shouldEmit) emitChange();
  };

  const getLocalExpandState = () => cloneLocalExpandState(localExpandState);

  const activateLocalExpandOverlay = (node: MiraImageNode | null) => {
    const assetId = node?.__mira?.miraAssetId ?? null;
    const versionId = node?.__mira?.miraVersionId ?? null;
    if (!node || !assetId || !versionId) {
      clearLocalExpandOverlay(false);
      return;
    }

    const sourceSize = readNodeSize(node);
    const padding = getModeExpandPadding(localExpandState, sourceSize);
    localExpandState = {
      ...localExpandState,
      active: true,
      assetId,
      versionId,
      padding,
      target: calculateExpandTarget(sourceSize, padding),
    };
    renderExpandOverlay();
  };

  const getLocalEditOverlayState = () => {
    const maskDirty = Boolean(maskStrokes.length || currentMaskStroke?.length);
    const activeOverlayAssetId = marker?.assetId ?? activeMaskAssetId;
    const source = marker ? "marker" : maskDirty ? "mask" : null;

    return {
      assetId: activeOverlayAssetId ?? null,
      dirty: Boolean(source),
      markerRadius,
      source,
    } as const;
  };

  const clearLocalEditIfNodeChanged = (node: MiraImageNode | null) => {
    const activeOverlayAssetId =
      marker?.assetId ?? activeMaskAssetId ?? maskStrokes[0]?.assetId ?? null;
    const activeOverlayVersionId =
      marker?.versionId ?? activeMaskVersionId ?? maskStrokes[0]?.versionId ?? null;
    if (
      activeOverlayAssetId &&
      (
        !node ||
        node.__mira?.miraAssetId !== activeOverlayAssetId ||
        (activeOverlayVersionId &&
          node.__mira?.miraVersionId !== activeOverlayVersionId)
      )
    ) {
      clearLocalEditOverlay(false);
    }
  };

  const clearLocalExpandIfNodeChanged = (node: MiraImageNode | null) => {
    if (
      localExpandState.active &&
      (
        !node ||
        node.__mira?.miraAssetId !== localExpandState.assetId ||
        node.__mira?.miraVersionId !== localExpandState.versionId
      )
    ) {
      clearLocalExpandOverlay(false);
    }
  };

  const selectNode = (node: MiraImageNode | null) => {
    applySelectionToEditor(activeTool === "select" ? node : null);
    clearLocalEditIfNodeChanged(node);
    clearLocalExpandIfNodeChanged(node);
    emitSelection(selectionFromNode(node));
  };

  const resolveLocalEditNode = (event: unknown) => {
    const selectedNode = readSelectedNode();
    const targetNode = toMiraImageNode((event as { target?: unknown }).target);
    if (targetNode && targetNode !== selectedNode) {
      selectNode(targetNode);
      return targetNode;
    }
    return selectedNode ?? targetNode;
  };

  const renderExpandOverlay = () => {
    expandLayer.removeAll();
    const selectedNode = readSelectedNode();
    if (
      !localExpandState.active ||
      !selectedNode ||
      selectedNode.__mira?.miraAssetId !== localExpandState.assetId ||
      selectedNode.__mira?.miraVersionId !== localExpandState.versionId
    ) {
      return;
    }

    const sourceSize = readNodeSize(selectedNode);
    const padding = normalizeExpandPadding(localExpandState.padding);
    const x = normalizeFiniteNumber(selectedNode.x, 0) - padding.left;
    const y = normalizeFiniteNumber(selectedNode.y, 0) - padding.top;
    const width = sourceSize.width + padding.left + padding.right;
    const height = sourceSize.height + padding.top + padding.bottom;

    expandLayer.add(
      new Rect({
        dashPattern: [8, 6],
        fill: "rgba(225, 29, 72, 0.12)",
        height,
        hitChildren: false,
        hitSelf: false,
        hittable: false,
        stroke: "rgba(225, 29, 72, 0.82)",
        strokeWidth: 2,
        width,
        x,
        y,
      }),
    );
    expandLayer.add(
      new Rect({
        fill: "rgba(255, 255, 255, 0)",
        height: sourceSize.height,
        hitChildren: false,
        hitSelf: false,
        hittable: false,
        stroke: "rgba(225, 29, 72, 0.28)",
        strokeWidth: 1,
        width: sourceSize.width,
        x: normalizeFiniteNumber(selectedNode.x, 0),
        y: normalizeFiniteNumber(selectedNode.y, 0),
      }),
    );

    if (localExpandState.mode !== "free") return;
    for (const handle of createExpandHandles(x, y, width, height)) {
      const handleNode = new Rect({
        fill: handle.corner ? "rgba(225, 29, 72, 0.95)" : "rgba(255, 255, 255, 0.96)",
        height: EXPAND_HANDLE_SIZE,
        stroke: "rgba(225, 29, 72, 0.88)",
        strokeWidth: 1.5,
        width: EXPAND_HANDLE_SIZE,
        x: handle.x - EXPAND_HANDLE_SIZE / 2,
        y: handle.y - EXPAND_HANDLE_SIZE / 2,
      }) as ExpandHandleNode;
      handleNode.__miraExpandHandle = handle.position;
      expandLayer.add(handleNode);
    }
  };

  const renderMaskOverlay = () => {
    maskLayer.removeAll();
    const selectedNode = readSelectedNode();
    const assetId = selectedNode?.__mira?.miraAssetId;
    const versionId = selectedNode?.__mira?.miraVersionId;
    if (!selectedNode || !assetId || !versionId) return;

    const strokes = [
      ...maskStrokes.filter((stroke) => {
        return stroke.assetId === assetId && stroke.versionId === versionId;
      }),
      ...(currentMaskStroke?.length &&
      activeMaskAssetId === assetId &&
      activeMaskVersionId === versionId
        ? [{ points: currentMaskStroke }]
        : []),
    ];

    for (const stroke of strokes) {
      const pen = drawMaskStrokePen(
        new Pen({
          hitChildren: false,
          hitSelf: false,
          hittable: false,
          stroke: "rgba(225, 29, 72, 0.58)",
          strokeCap: "round",
          strokeJoin: "round",
          strokeWidth: MASK_BRUSH_RADIUS * 2,
        }) as IPen,
        stroke.points,
        {
          x: normalizeFiniteNumber(selectedNode.x, 0),
          y: normalizeFiniteNumber(selectedNode.y, 0),
        },
      );
      if (pen) maskLayer.add(pen);
    }
  };

  const renderMarkerOverlay = () => {
    markerLayer.removeAll();
    const selectedNode = readSelectedNode();
    if (
      !marker ||
      !selectedNode ||
      selectedNode.__mira?.miraAssetId !== marker.assetId ||
      selectedNode.__mira?.miraVersionId !== marker.versionId
    ) {
      return;
    }

    const radius = clamp(marker.radius, MIN_MARKER_RADIUS, MAX_MARKER_RADIUS);
    markerLayer.add(
      new Ellipse({
        fill: "rgba(14, 165, 233, 0.18)",
        height: radius * 2,
        hitChildren: false,
        hitSelf: false,
        hittable: false,
        stroke: "rgba(2, 132, 199, 0.88)",
        strokeWidth: 2,
        width: radius * 2,
        x: normalizeFiniteNumber(selectedNode.x, 0) + marker.center.x - radius,
        y: normalizeFiniteNumber(selectedNode.y, 0) + marker.center.y - radius,
      }),
    );
    markerLayer.add(
      new Ellipse({
        fill: "rgba(2, 132, 199, 0.95)",
        height: 8,
        hitChildren: false,
        hitSelf: false,
        hittable: false,
        width: 8,
        x: normalizeFiniteNumber(selectedNode.x, 0) + marker.center.x - 4,
        y: normalizeFiniteNumber(selectedNode.y, 0) + marker.center.y - 4,
      }),
    );
  };

  const handlePointerTap = (event: unknown) => {
    if (activeTool !== "select") return;
    const target = (event as { target?: unknown }).target;
    const node = toMiraImageNode(target);
    selectNode(node);
  };

  const handlePointerDown = (event: unknown) => {
    const expandHandle = activeTool === "select"
      ? readExpandHandle((event as { target?: unknown }).target)
      : null;
    if (expandHandle && localExpandState.active && localExpandState.mode === "free") {
      const pointer = readContentPointer(event, imageLayer, viewport);
      if (!pointer) return;
      localExpandDrag = {
        handle: expandHandle,
        startPadding: normalizeExpandPadding(localExpandState.padding),
        startPointer: pointer,
      };
      return;
    }

    if (activeTool === "mask") {
      const selectedNode = resolveLocalEditNode(event);
      const point = selectedNode
        ? toImageLocalPoint(selectedNode, event, imageLayer, viewport)
        : null;
      const assetId = selectedNode?.__mira?.miraAssetId;
      const versionId = selectedNode?.__mira?.miraVersionId;
      if (!selectedNode || !point || !assetId || !versionId) return;

      const beforeSnapshot = captureLocalEditSnapshot();
      marker = null;
      markerLayer.removeAll();
      activeMaskAssetId = assetId;
      activeMaskVersionId = versionId;
      currentMaskStroke = [point];
      localEditGestureStartSnapshot = beforeSnapshot;
      renderMaskOverlay();
      emitChange();
      return;
    }

    if (activeTool === "marker") {
      const selectedNode = resolveLocalEditNode(event);
      const point = selectedNode
        ? toImageLocalPoint(selectedNode, event, imageLayer, viewport)
        : null;
      const assetId = selectedNode?.__mira?.miraAssetId;
      const versionId = selectedNode?.__mira?.miraVersionId;
      if (!selectedNode || !point || !assetId || !versionId) return;

      const beforeSnapshot = captureLocalEditSnapshot();
      activeMaskAssetId = null;
      activeMaskVersionId = null;
      currentMaskStroke = null;
      maskStrokes = [];
      maskLayer.removeAll();
      marker = {
        assetId,
        center: point,
        radius: markerRadius,
        versionId,
      };
      renderMarkerOverlay();
      pushLocalEditHistory(beforeSnapshot);
      emitChange();
      return;
    }

    if (activeTool !== "pan") return;
    const pointer = readPointer(event);
    if (!pointer) return;
    isPanning = true;
    panStart = { pointer, viewport: { ...viewport } };
    container.style.cursor = "grabbing";
  };

  const handlePointerMove = (event: unknown) => {
    if (localExpandDrag && localExpandState.active && localExpandState.mode === "free") {
      const pointer = readContentPointer(event, imageLayer, viewport);
      const selectedNode = readSelectedNode();
      if (!pointer || !selectedNode) return;
      const padding = dragExpandHandle(localExpandDrag, pointer);
      const sourceSize = readNodeSize(selectedNode);
      localExpandState = {
        ...localExpandState,
        padding,
        target: calculateExpandTarget(sourceSize, padding),
      };
      renderExpandOverlay();
      return;
    }

    if (activeTool === "mask" && currentMaskStroke) {
      const selectedNode = readSelectedNode();
      const point = selectedNode
        ? toImageLocalPoint(selectedNode, event, imageLayer, viewport)
        : null;
      if (!selectedNode || !point) return;

      currentMaskStroke = [...currentMaskStroke, point];
      renderMaskOverlay();
      return;
    }

    if (!(activeTool === "pan" && isPanning) || !panStart) return;
    const pointer = readPointer(event);
    if (!pointer) return;
    setViewport(
      {
        ...viewport,
        x: panStart.viewport.x + pointer.x - panStart.pointer.x,
        y: panStart.viewport.y + pointer.y - panStart.pointer.y,
      },
      false,
    );
  };

  const handlePointerUp = () => {
    if (localExpandDrag) {
      localExpandDrag = null;
      emitChange();
      return;
    }

    if (
      activeTool === "mask" &&
      currentMaskStroke &&
      activeMaskAssetId &&
      activeMaskVersionId
    ) {
      maskStrokes = [
        ...maskStrokes,
        {
          assetId: activeMaskAssetId,
          points: currentMaskStroke,
          versionId: activeMaskVersionId,
        },
      ];
      currentMaskStroke = null;
      renderMaskOverlay();
      pushLocalEditHistory(
        localEditGestureStartSnapshot ?? currentLocalEditHistorySnapshot,
      );
      localEditGestureStartSnapshot = null;
      emitChange();
      return;
    }

    if (!(activeTool === "pan" && isPanning)) return;
    isPanning = false;
    panStart = null;
    container.style.cursor = activeTool === "pan" ? "grab" : "";
    emitChange();
  };

  imageLayer.on(PointerEvent.TAP, handlePointerTap);
  app.on(PointerEvent.DOWN, handlePointerDown);
  app.on(PointerEvent.MOVE, handlePointerMove);
  app.on(PointerEvent.UP, handlePointerUp);

  const notifyReady = () => {
    if (!destroyed) events.onReady();
  };
  window.requestAnimationFrame(notifyReady);

  const controller: CanvasController = {
    clearLocalExpandOverlay: () => clearLocalExpandOverlay(),
    clearLocalEditOverlay: () => clearLocalEditOverlay(),
    clearSelection: () => {
      clearLocalExpandOverlay(false);
      clearLocalEditOverlay(false);
      applySelectionToEditor(null);
      emitSelection(emptySelection());
    },
    deleteSelection: () => {
      const selectedNode = readSelectedNode();
      if (!selectedNode) return;
      clearLocalExpandOverlay(false);
      clearLocalEditOverlay(false);
      selectedNode.remove();
      applySelectionToEditor(null);
      emitSelection(emptySelection());
      emitChange();
    },
    destroy: () => {
      destroyed = true;
      resizeObserver.disconnect();
      imageLayer.off(PointerEvent.TAP, handlePointerTap);
      app.off(PointerEvent.DOWN, handlePointerDown);
      app.off(PointerEvent.MOVE, handlePointerMove);
      app.off(PointerEvent.UP, handlePointerUp);
      safeCall(() => app.destroy());
      changeListeners.clear();
      container.style.cursor = "";
    },
    exportLocalExpandInput: (input) => {
      const selectedNode = readSelectedNode();
      if (
        !selectedNode ||
        selectedNode.__mira?.miraAssetId !== input.assetId ||
        selectedNode.__mira?.miraVersionId !== input.versionId
      ) {
        return null;
      }

      const sourceSize = {
        width: normalizePositiveNumber(input.width, readNodeSize(selectedNode).width),
        height: normalizePositiveNumber(input.height, readNodeSize(selectedNode).height),
      };
      const padding = getModeExpandPadding(localExpandState, sourceSize);
      const normalizedPadding = normalizeExpandPadding(padding);
      const target = {
        width: sourceSize.width + normalizedPadding.left + normalizedPadding.right,
        height: sourceSize.height + normalizedPadding.top + normalizedPadding.bottom,
      };
      if (!hasExpandPadding(normalizedPadding)) {
        throw new Error("请先设置图片扩展范围");
      }
      localExpandState = {
        ...localExpandState,
        active: true,
        assetId: input.assetId,
        versionId: input.versionId,
        padding: normalizedPadding,
        target,
      };
      renderExpandOverlay();

      return {
        promptDefaults: EXPAND_PROMPT_DEFAULTS,
        versionId: input.versionId,
        mode: localExpandState.mode,
        ...(localExpandState.mode === "ratio"
          ? { aspectRatio: localExpandState.aspectRatio }
          : {}),
        ...(localExpandState.mode === "direction"
          ? {
              direction: localExpandState.direction,
              percent: localExpandState.percent,
            }
          : {}),
        padding: normalizedPadding,
        target: {
          width: sourceSize.width + normalizedPadding.left + normalizedPadding.right,
          height: sourceSize.height + normalizedPadding.top + normalizedPadding.bottom,
        },
      };
    },
    fitView: () => {
      const bounds = getObjectBounds(readMiraImageNodes(imageLayer));
      if (!bounds) return;
      const padding = 56;
      const availableWidth = Math.max(1, container.clientWidth - padding * 2);
      const availableHeight = Math.max(1, container.clientHeight - padding * 2);
      const zoom = clamp(
        Math.min(availableWidth / bounds.width, availableHeight / bounds.height, 1),
        MIN_ZOOM,
        MAX_ZOOM,
      );
      setViewport({
        x: padding - bounds.x * zoom + Math.max(0, availableWidth - bounds.width * zoom) / 2,
        y:
          padding -
          bounds.y * zoom +
          Math.max(0, availableHeight - bounds.height * zoom) / 2,
        zoom,
      });
    },
    getActiveTool: () => activeTool,
    getCanRedo: () => localEditRedoStack.length > 0,
    getCanUndo: () => localEditUndoStack.length > 0,
    getLocalExpandState: () => getLocalExpandState(),
    getLocalEditOverlayState: () => getLocalEditOverlayState(),
    hydrateWorkspace: (workspace) => {
      if (!workspace) {
        latestAssetsById = new Map();
        removeStaleMiraImageNodes(imageLayer, new Set());
        applySelectionToEditor(null);
        emitSelection(emptySelection());
        setViewport(DEFAULT_VIEWPORT);
        clearLocalExpandOverlay(false);
        clearLocalEditOverlay(false);
        return;
      }

      const nextViewport = parseViewport(workspace.viewport);
      setViewport(nextViewport, false);

      const previousAssetsById = latestAssetsById;
      const assetsById = new Map(workspace.assets.map((asset) => [asset.id, asset]));
      const workspaceAssetIds = new Set(assetsById.keys());
      const workspaceObjectIds = new Set(workspace.objects.map((object) => object.id));
      const workspaceVersionIds = new Set(
        workspace.assets.flatMap((asset) =>
          asset.versions.map((version) => version.id),
        ),
      );
      const selectionStillValid = selectionBelongsToWorkspace(
        {
          assetId: selectedAssetId,
          objectId: selectedObjectId,
          selectedVersionId,
        },
        {
          assetIds: workspaceAssetIds,
          objectIds: workspaceObjectIds,
          versionIds: workspaceVersionIds,
        },
      );
      if (!selectionStillValid) {
        selectedAssetId = null;
        selectedObjectId = null;
        selectedVersionId = null;
        clearLocalExpandOverlay(false);
        clearLocalEditOverlay(false);
        applySelectionToEditor(null);
      }
      latestAssetsById = assetsById;
      const validObjectIds = new Set<string>();
      const imageObjects = workspace.objects
        .filter((object) => object.type === "image" && object.assetId)
        .sort((a, b) => a.zIndex - b.zIndex);

      for (const object of imageObjects) {
        const asset = object.assetId ? assetsById.get(object.assetId) : null;
        const previousAsset = asset ? previousAssetsById.get(asset.id) : null;
        const version = asset
          ? getCanvasObjectVersion(asset, object, previousAsset)
          : null;
        if (!asset || !version) continue;

        validObjectIds.add(object.id);
        const node = findMiraImageNodeByObjectId(imageLayer, object.id);
        if (node) {
          node.set({
            height: object.height,
            rotation: object.rotation,
            url: createCanvasImageUrl(asset, version),
            width: object.width,
            x: object.x,
            y: object.y,
            zIndex: object.zIndex,
          });
          node.__mira = {
            miraAssetId: asset.id,
            miraObjectId: object.id,
            miraProps: normalizeCanvasObjectProps(object.props),
            miraVersionId: version.id,
          };
          node.draggable = activeTool === "select";
          node.editable = activeTool === "select";
          continue;
        }

        const imageNode = new Image({
          draggable: true,
          editable: true,
          height: object.height,
          rotation: object.rotation,
          url: createCanvasImageUrl(asset, version),
          width: object.width,
          x: object.x,
          y: object.y,
          zIndex: object.zIndex,
        }) as MiraImageNode;
        imageNode.draggable = true;
        imageNode.editable = true;
        imageNode.__mira = {
          miraAssetId: asset.id,
          miraObjectId: object.id,
          miraProps: normalizeCanvasObjectProps(object.props),
          miraVersionId: version.id,
        };
        imageNode.draggable = activeTool === "select";
        imageNode.editable = activeTool === "select";
        imageLayer.add(imageNode);
      }

      removeStaleMiraImageNodes(imageLayer, validObjectIds);

      const selectedNode = selectedAssetId
        ? findMiraImageNodeBySelection(imageLayer, {
            assetId: selectedAssetId,
            objectId: selectedObjectId,
            selectedVersionId,
          })
        : null;
      if (selectedAssetId && selectedNode) {
        clearLocalEditIfNodeChanged(selectedNode);
        clearLocalExpandIfNodeChanged(selectedNode);
        applySelectionToEditor(selectedNode);
        renderExpandOverlay();
        renderMaskOverlay();
        renderMarkerOverlay();
      }
      if (selectedAssetId && !selectedNode) {
        applySelectionToEditor(null);
        emitSelection(emptySelection());
        clearLocalExpandOverlay(false);
        clearLocalEditOverlay(false);
      }
      emitChange();
    },
    redo: () => {
      const nextSnapshot = localEditRedoStack.at(-1);
      if (!nextSnapshot) return;
      localEditRedoStack = localEditRedoStack.slice(0, -1);
      localEditUndoStack = [
        ...localEditUndoStack,
        captureLocalEditSnapshot(),
      ];
      applyLocalEditSnapshot(nextSnapshot);
      currentLocalEditHistorySnapshot = captureLocalEditSnapshot();
      emitChange();
    },
    selectAsset: (selection) => {
      const nextSelection = normalizeSelectionInput(selection);
      if (!nextSelection.assetId) {
        applySelectionToEditor(null);
        clearLocalExpandOverlay(false);
        emitSelection(emptySelection());
        return;
      }
      selectNode(findMiraImageNodeBySelection(imageLayer, nextSelection));
    },
    serializeSnapshot: () => serializeSnapshot(imageLayer, viewport),
    setSelectedAssetVersion: (versionId) => {
      const selectedNode = readSelectedNode();
      const assetId = selectedNode?.__mira?.miraAssetId;
      if (!selectedNode || !assetId) return;

      const asset = latestAssetsById.get(assetId);
      const version = asset?.versions.find((item) => item.id === versionId);
      if (!asset || !version) return;

      selectedNode.set({
        url: createCanvasImageUrl(asset, version),
      });
      selectedNode.__mira = {
        ...selectedNode.__mira,
        miraAssetId: asset.id,
        miraObjectId: selectedNode.__mira?.miraObjectId ?? "",
        miraProps: selectedNode.__mira?.miraProps ?? {},
        miraVersionId: version.id,
      };
      clearLocalExpandIfNodeChanged(selectedNode);
      clearLocalEditIfNodeChanged(selectedNode);
      renderExpandOverlay();
      renderMaskOverlay();
      renderMarkerOverlay();
      emitSelection(selectionFromNode(selectedNode));
    },
    exportLocalEditMask: (input) => {
      const selectedNode = findMiraImageNodeByAssetId(imageLayer, input.assetId);
      if (!selectedNode) return { dataUrl: null, source: null };
      if (
        marker &&
        marker.assetId === input.assetId &&
        marker.versionId === input.versionId
      ) {
        return {
          dataUrl: createEditableMaskDataUrl(input, selectedNode, {
            marker,
            strokes: [],
          }),
          source: "marker",
        };
      }

      const committedStrokes = maskStrokes.filter((stroke) => {
        return stroke.assetId === input.assetId && stroke.versionId === input.versionId;
      });
      const pendingStroke =
        activeMaskAssetId === input.assetId &&
        activeMaskVersionId === input.versionId &&
        currentMaskStroke?.length
          ? [
              {
                assetId: input.assetId,
                points: currentMaskStroke,
                versionId: input.versionId,
              },
            ]
          : [];
      const strokes = [...committedStrokes, ...pendingStroke];
      if (!strokes.length) return { dataUrl: null, source: null };

      return {
        dataUrl: createEditableMaskDataUrl(input, selectedNode, {
          marker: null,
          strokes,
        }),
        source: "mask",
      };
    },
    setLocalExpandAspectRatio: (aspectRatio) => {
      localExpandState = {
        ...localExpandState,
        aspectRatio,
        mode: "ratio",
      };
      activateLocalExpandOverlay(readSelectedNode());
      emitChange();
    },
    setLocalExpandDirection: (direction) => {
      localExpandState = {
        ...localExpandState,
        direction,
        mode: "direction",
      };
      activateLocalExpandOverlay(readSelectedNode());
      emitChange();
    },
    setLocalExpandMode: (mode) => {
      localExpandState = {
        ...localExpandState,
        mode,
      };
      activateLocalExpandOverlay(readSelectedNode());
      emitChange();
    },
    setLocalExpandPadding: (padding) => {
      const selectedNode = readSelectedNode();
      const normalizedPadding = normalizeExpandPadding({
        ...localExpandState.padding,
        ...padding,
      });
      localExpandState = {
        ...localExpandState,
        mode: "free",
        padding: normalizedPadding,
        target: selectedNode
          ? calculateExpandTarget(readNodeSize(selectedNode), normalizedPadding)
          : null,
      };
      activateLocalExpandOverlay(selectedNode);
      emitChange();
    },
    setLocalExpandPercent: (percent) => {
      localExpandState = {
        ...localExpandState,
        mode: "direction",
        percent: normalizeExpandPercent(percent),
      };
      activateLocalExpandOverlay(readSelectedNode());
      emitChange();
    },
    setLocalEditMarkerRadius: (radius) => {
      markerRadius = clamp(
        normalizeFiniteNumber(radius, DEFAULT_MARKER_RADIUS),
        MIN_MARKER_RADIUS,
        MAX_MARKER_RADIUS,
      );
      if (marker) {
        marker = {
          ...marker,
          radius: markerRadius,
        };
        renderMarkerOverlay();
      }
      currentLocalEditHistorySnapshot = captureLocalEditSnapshot();
      emitChange();
    },
    setTool: (tool) => {
      if (currentMaskStroke && localEditGestureStartSnapshot) {
        applyLocalEditSnapshot(localEditGestureStartSnapshot);
        localEditGestureStartSnapshot = null;
      }
      activeTool = tool;
      isPanning = false;
      panStart = null;
      currentMaskStroke = null;
      if (activeTool !== "select") {
        clearLocalExpandOverlay(false);
      }
      container.style.cursor =
        tool === "pan" ? "grab" : tool === "mask" || tool === "marker" ? "crosshair" : "";
      applyToolInteractionState();
      if (tool !== "select") applySelectionToEditor(null);
      emitChange();
    },
    subscribeChange: (listener) => {
      changeListeners.add(listener);
      return () => {
        changeListeners.delete(listener);
      };
    },
    undo: () => {
      const previousSnapshot = localEditUndoStack.at(-1);
      if (!previousSnapshot) return;
      localEditUndoStack = localEditUndoStack.slice(0, -1);
      localEditRedoStack = [
        ...localEditRedoStack,
        captureLocalEditSnapshot(),
      ];
      applyLocalEditSnapshot(previousSnapshot);
      currentLocalEditHistorySnapshot = captureLocalEditSnapshot();
      emitChange();
    },
    zoomIn: () => {
      setViewport({ ...viewport, zoom: viewport.zoom * 1.12 });
    },
    zoomOut: () => {
      setViewport({ ...viewport, zoom: viewport.zoom / 1.12 });
    },
  };

  return controller;
}

function createDefaultLocalExpandState(): LocalExpandOverlayState {
  return {
    active: false,
    assetId: null,
    versionId: null,
    mode: "free",
    aspectRatio: "1:1",
    direction: "around",
    percent: DEFAULT_EXPAND_PERCENT,
    padding: createEmptyExpandPadding(),
    target: null,
  };
}

function createEmptyExpandPadding(): LocalExpandPadding {
  return { left: 0, right: 0, top: 0, bottom: 0 };
}

function cloneLocalExpandState(
  state: LocalExpandOverlayState,
): LocalExpandOverlayState {
  return {
    ...state,
    padding: { ...state.padding },
    target: state.target ? { ...state.target } : null,
  };
}

function readNodeSize(node: MiraImageNode) {
  return {
    width: normalizePositiveNumber(node.width, DEFAULT_OBJECT_SIZE),
    height: normalizePositiveNumber(node.height, DEFAULT_OBJECT_SIZE),
  };
}

function getModeExpandPadding(
  state: LocalExpandOverlayState,
  sourceSize: { width: number; height: number },
) {
  if (state.mode === "ratio") {
    return calculateRatioExpandPadding(
      sourceSize.width,
      sourceSize.height,
      state.aspectRatio,
    );
  }
  if (state.mode === "direction") {
    return calculateDirectionalExpandPadding(
      sourceSize.width,
      sourceSize.height,
      state.direction,
      state.percent,
    );
  }
  return normalizeExpandPadding(state.padding);
}

function normalizeExpandPadding(
  padding: Partial<LocalExpandPadding>,
): LocalExpandPadding {
  return {
    left: normalizeExpandPaddingValue(padding.left),
    right: normalizeExpandPaddingValue(padding.right),
    top: normalizeExpandPaddingValue(padding.top),
    bottom: normalizeExpandPaddingValue(padding.bottom),
  };
}

function normalizeExpandPaddingValue(value: unknown) {
  return Math.round(
    clamp(normalizeFiniteNumber(value, 0), 0, MAX_EXPAND_PADDING),
  );
}

function hasExpandPadding(padding: LocalExpandPadding) {
  return padding.left > 0 || padding.right > 0 || padding.top > 0 || padding.bottom > 0;
}

function normalizeExpandPercent(value: unknown) {
  return clamp(
    normalizeFiniteNumber(value, DEFAULT_EXPAND_PERCENT),
    MIN_EXPAND_PERCENT,
    MAX_EXPAND_PERCENT,
  );
}

function calculateExpandTarget(
  sourceSize: { width: number; height: number },
  padding: LocalExpandPadding,
) {
  const normalizedPadding = normalizeExpandPadding(padding);
  return {
    width: sourceSize.width + normalizedPadding.left + normalizedPadding.right,
    height: sourceSize.height + normalizedPadding.top + normalizedPadding.bottom,
  };
}

export function calculateRatioExpandPadding(
  width: number,
  height: number,
  aspectRatio: LocalExpandOverlayState["aspectRatio"],
): LocalExpandPadding {
  const sourceWidth = normalizePositiveNumber(width, DEFAULT_OBJECT_SIZE);
  const sourceHeight = normalizePositiveNumber(height, DEFAULT_OBJECT_SIZE);
  const ratio = parseAspectRatio(aspectRatio);
  const ratioScale = Math.ceil(
    Math.max(
      sourceWidth / ratio.width,
      sourceHeight / ratio.height,
    ),
  );
  const targetWidth = ratio.width * ratioScale;
  const targetHeight = ratio.height * ratioScale;
  const horizontal = Math.round(targetWidth - sourceWidth);
  const vertical = Math.round(targetHeight - sourceHeight);

  return normalizeExpandPadding({
    left: Math.floor(horizontal / 2),
    right: Math.ceil(horizontal / 2),
    top: Math.floor(vertical / 2),
    bottom: Math.ceil(vertical / 2),
  });
}

export function calculateDirectionalExpandPadding(
  width: number,
  height: number,
  direction: LocalExpandDirection,
  percent: number,
): LocalExpandPadding {
  const sourceWidth = normalizePositiveNumber(width, DEFAULT_OBJECT_SIZE);
  const sourceHeight = normalizePositiveNumber(height, DEFAULT_OBJECT_SIZE);
  const normalizedPercent = normalizeExpandPercent(percent);
  const horizontal = Math.round(sourceWidth * normalizedPercent);
  const vertical = Math.round(sourceHeight * normalizedPercent);

  if (direction === "left") return normalizeExpandPadding({ left: horizontal });
  if (direction === "right") return normalizeExpandPadding({ right: horizontal });
  if (direction === "top") return normalizeExpandPadding({ top: vertical });
  if (direction === "bottom") return normalizeExpandPadding({ bottom: vertical });
  return normalizeExpandPadding({
    left: horizontal,
    right: horizontal,
    top: vertical,
    bottom: vertical,
  });
}

function parseAspectRatio(
  aspectRatio: LocalExpandOverlayState["aspectRatio"],
): ParsedExpandAspectRatio {
  const [width = 1, height = 1] = aspectRatio.split(":").map(Number);
  return {
    width: normalizePositiveNumber(width, 1),
    height: normalizePositiveNumber(height, 1),
  };
}

function createExpandHandles(x: number, y: number, width: number, height: number) {
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const right = x + width;
  const bottom = y + height;
  return [
    { position: "top-left", x, y, corner: true },
    { position: "top", x: centerX, y, corner: false },
    { position: "top-right", x: right, y, corner: true },
    { position: "right", x: right, y: centerY, corner: false },
    { position: "bottom-right", x: right, y: bottom, corner: true },
    { position: "bottom", x: centerX, y: bottom, corner: false },
    { position: "bottom-left", x, y: bottom, corner: true },
    { position: "left", x, y: centerY, corner: false },
  ] satisfies Array<{
    position: ExpandHandlePosition;
    x: number;
    y: number;
    corner: boolean;
  }>;
}

function readExpandHandle(target: unknown): ExpandHandlePosition | null {
  if (!target || typeof target !== "object") return null;
  const handleNode = target as ExpandHandleNode;
  return handleNode.__miraExpandHandle ?? null;
}

function dragExpandHandle(
  drag: LocalExpandDrag,
  pointer: LocalEditPoint,
): LocalExpandPadding {
  const dx = pointer.x - drag.startPointer.x;
  const dy = pointer.y - drag.startPointer.y;
  const padding = { ...drag.startPadding };

  if (drag.handle.includes("left")) padding.left -= dx;
  if (drag.handle.includes("right")) padding.right += dx;
  if (drag.handle.includes("top")) padding.top -= dy;
  if (drag.handle.includes("bottom")) padding.bottom += dy;

  return normalizeExpandPadding(padding);
}

function removeStaleMiraImageNodes(
  imageLayer: IGroup,
  validObjectIds: Set<string>,
) {
  for (const node of readMiraImageNodes(imageLayer)) {
    const miraObjectId = node.__mira?.miraObjectId;
    if (miraObjectId && !validObjectIds.has(miraObjectId)) {
      node.remove();
    }
  }
}

function serializeSnapshot(
  imageLayer: IGroup,
  viewport: CanvasViewport,
): CanvasSnapshot {
  const objects = readMiraImageNodes(imageLayer).map((node, index) => ({
    id: node.__mira?.miraObjectId ?? `mira-object-${index}`,
    assetId: node.__mira?.miraAssetId ?? null,
    type: "image",
    x: normalizeFiniteNumber(node.x, 0),
    y: normalizeFiniteNumber(node.y, 0),
    width: normalizeFiniteNumber(node.width, DEFAULT_OBJECT_SIZE),
    height: normalizeFiniteNumber(node.height, DEFAULT_OBJECT_SIZE),
    rotation: normalizeFiniteNumber(node.rotation, 0),
    zIndex: index,
    props: {
      ...(node.__mira?.miraProps ?? {}),
      ...(node.__mira?.miraVersionId
        ? { versionId: node.__mira.miraVersionId }
        : {}),
    },
  }));

  return {
    viewport: {
      x: normalizeFiniteNumber(viewport.x, DEFAULT_VIEWPORT.x),
      y: normalizeFiniteNumber(viewport.y, DEFAULT_VIEWPORT.y),
      zoom: normalizeFiniteNumber(viewport.zoom, DEFAULT_VIEWPORT.zoom),
    },
    objects,
  };
}

function readMiraImageNodes(imageLayer: IGroup) {
  return imageLayer.children
    .map((node) => toMiraImageNode(node))
    .filter((node): node is MiraImageNode => Boolean(node));
}

function toMiraImageNode(node: unknown): MiraImageNode | null {
  if (!node || typeof node !== "object") return null;
  const imageNode = node as Partial<MiraImageNode>;
  return imageNode.__mira ? (imageNode as MiraImageNode) : null;
}

function findMiraImageNodeByObjectId(imageLayer: IGroup, objectId: string) {
  return readMiraImageNodes(imageLayer).find((node) => {
    return node.__mira?.miraObjectId === objectId;
  }) ?? null;
}

function findMiraImageNodeByAssetId(imageLayer: IGroup, assetId: string) {
  return readMiraImageNodes(imageLayer).find((node) => {
    return node.__mira?.miraAssetId === assetId;
  }) ?? null;
}

function findMiraImageNodeBySelection(
  imageLayer: IGroup,
  selection: CanvasAssetSelection,
) {
  const nodes = readMiraImageNodes(imageLayer);
  if (selection.objectId) {
    const node = nodes.find((item) => item.__mira?.miraObjectId === selection.objectId);
    if (node) return node;
  }
  if (selection.assetId && selection.selectedVersionId) {
    const node = nodes.find((item) => {
      return (
        item.__mira?.miraAssetId === selection.assetId &&
        item.__mira?.miraVersionId === selection.selectedVersionId
      );
    });
    if (node) return node;
  }
  return selection.assetId ? findMiraImageNodeByAssetId(imageLayer, selection.assetId) : null;
}

function selectionFromNode(node: MiraImageNode | null): CanvasAssetSelection {
  if (!node?.__mira) return emptySelection();
  return {
    assetId: node.__mira.miraAssetId,
    objectId: node.__mira.miraObjectId,
    selectedVersionId: node.__mira.miraVersionId,
  };
}

function emptySelection(): CanvasAssetSelection {
  return {
    assetId: null,
    objectId: null,
    selectedVersionId: null,
  };
}

function normalizeSelectionInput(
  selection: CanvasAssetSelection | string | null,
): CanvasAssetSelection {
  if (!selection) return emptySelection();
  if (typeof selection === "string") {
    return {
      assetId: selection,
      objectId: null,
      selectedVersionId: null,
    };
  }
  return selection;
}

function selectionBelongsToWorkspace(
  selection: CanvasAssetSelection,
  workspaceIds: {
    assetIds: Set<string>;
    objectIds: Set<string>;
    versionIds: Set<string>;
  },
) {
  if (selection.assetId && !workspaceIds.assetIds.has(selection.assetId)) {
    return false;
  }
  if (selection.objectId && !workspaceIds.objectIds.has(selection.objectId)) {
    return false;
  }
  if (
    selection.selectedVersionId &&
    !workspaceIds.versionIds.has(selection.selectedVersionId)
  ) {
    return false;
  }
  return true;
}

function parseViewport(value: ImageWorkspace["viewport"]): CanvasViewport {
  if (!value) return { ...DEFAULT_VIEWPORT };

  return {
    x: normalizeFiniteNumber(value.x, DEFAULT_VIEWPORT.x),
    y: normalizeFiniteNumber(value.y, DEFAULT_VIEWPORT.y),
    zoom: normalizeFiniteNumber(value.zoom, DEFAULT_VIEWPORT.zoom),
  };
}

function getCurrentVersion(asset: ImageAsset) {
  return (
    asset.versions.find((version) => version.id === asset.currentVersionId) ??
    asset.versions[0] ??
    null
  );
}

function getCanvasObjectVersion(
  asset: ImageAsset,
  object: CanvasObject,
  previousAsset?: ImageAsset | null,
) {
  const currentVersion = getCurrentVersion(asset);
  const assetCurrentVersionChanged =
    Boolean(previousAsset) &&
    previousAsset?.currentVersionId !== asset.currentVersionId;
  if (assetCurrentVersionChanged && currentVersion) return currentVersion;

  const objectVersionId = readCanvasObjectVersionId(object);
  return (
    asset.versions.find((version) => version.id === objectVersionId) ??
    currentVersion
  );
}

function readCanvasObjectVersionId(object: CanvasObject) {
  const versionId = object.props.versionId;
  return typeof versionId === "string" && versionId.trim()
    ? versionId.trim()
    : null;
}

function normalizeCanvasObjectProps(props: CanvasObject["props"]) {
  return props && typeof props === "object" && !Array.isArray(props) ? props : {};
}

function createCanvasImageUrl(asset: ImageAsset, version: ReturnType<typeof getCurrentVersion>) {
  return version
    ? createImageVersionPreviewUrl(asset.id, version.id)
    : createImageAssetPreviewUrl(asset.id);
}

function getObjectBounds(nodes: MiraImageNode[]) {
  if (!nodes.length) return null;

  return nodes.reduce<CanvasObject | null>((bounds, node) => {
    const x = normalizeFiniteNumber(node.x, 0);
    const y = normalizeFiniteNumber(node.y, 0);
    const width = normalizeFiniteNumber(node.width, DEFAULT_OBJECT_SIZE);
    const height = normalizeFiniteNumber(node.height, DEFAULT_OBJECT_SIZE);
    if (!bounds) {
      return {
        assetId: null,
        height,
        id: "bounds",
        props: {},
        rotation: 0,
        type: "image",
        width,
        x,
        y,
        zIndex: 0,
      };
    }

    const minX = Math.min(bounds.x, x);
    const minY = Math.min(bounds.y, y);
    const maxX = Math.max(bounds.x + bounds.width, x + width);
    const maxY = Math.max(bounds.y + bounds.height, y + height);
    return {
      ...bounds,
      height: maxY - minY,
      width: maxX - minX,
      x: minX,
      y: minY,
    };
  }, null);
}

function readPointer(event: unknown) {
  const pointerEvent = event as PointerLike;
  const x = pointerEvent.current?.x ?? pointerEvent.x;
  const y = pointerEvent.current?.y ?? pointerEvent.y;
  if (typeof x !== "number" || typeof y !== "number") return null;
  return { x, y };
}

function readContentPointer(
  event: unknown,
  imageLayer: IGroup,
  viewport: CanvasViewport,
) {
  const pointerEvent = event as PointerLike;
  const innerPoint = pointerEvent.getInnerPoint?.(imageLayer);
  if (
    innerPoint &&
    typeof innerPoint.x === "number" &&
    typeof innerPoint.y === "number"
  ) {
    return { x: innerPoint.x, y: innerPoint.y };
  }

  const localPoint = pointerEvent.getLocalPoint?.(imageLayer);
  if (
    localPoint &&
    typeof localPoint.x === "number" &&
    typeof localPoint.y === "number"
  ) {
    return { x: localPoint.x, y: localPoint.y };
  }

  const pointer = readPointer(event);
  if (!pointer) return null;

  return {
    x: (pointer.x - viewport.x) / viewport.zoom,
    y: (pointer.y - viewport.y) / viewport.zoom,
  };
}

function toImageLocalPoint(
  node: MiraImageNode,
  event: unknown,
  imageLayer: IGroup,
  viewport: CanvasViewport,
) {
  const point = readContentPointer(event, imageLayer, viewport);
  if (!point) return null;

  const width = normalizeFiniteNumber(node.width, DEFAULT_OBJECT_SIZE);
  const height = normalizeFiniteNumber(node.height, DEFAULT_OBJECT_SIZE);
  const x = point.x - normalizeFiniteNumber(node.x, 0);
  const y = point.y - normalizeFiniteNumber(node.y, 0);

  return {
    x: clamp(x, 0, width),
    y: clamp(y, 0, height),
  };
}

function createEditableMaskDataUrl(
  input: LocalEditMaskExportInput,
  node: MiraImageNode,
  overlay: {
    marker: LocalEditMarker | null;
    strokes: LocalEditStroke[];
  },
) {
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = Math.max(1, Math.round(input.width));
  outputCanvas.height = Math.max(1, Math.round(input.height));

  const outputContext = outputCanvas.getContext("2d");
  if (!outputContext) return null;

  outputContext.fillStyle = "rgba(0, 0, 0, 1)";
  outputContext.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
  outputContext.globalCompositeOperation = "destination-out";
  outputContext.fillStyle = "rgba(0, 0, 0, 1)";
  outputContext.strokeStyle = "rgba(0, 0, 0, 1)";
  outputContext.lineCap = "round";
  outputContext.lineJoin = "round";

  if (overlay.marker) {
    drawMarkerMask(outputContext, outputCanvas, node, overlay.marker);
  } else {
    drawMaskStrokes(outputContext, outputCanvas, node, overlay.strokes);
  }

  return outputCanvas.toDataURL("image/png");
}

function drawMaskStrokes(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  node: MiraImageNode,
  strokes: LocalEditStroke[],
) {
  const scale = getSourceScale(canvas, node);
  context.lineWidth = MASK_BRUSH_RADIUS * 2 * Math.max(scale.x, scale.y);

  for (const stroke of strokes) {
    if (!stroke.points.length) continue;
    const firstPoint = toSourcePoint(stroke.points[0], scale);
    context.beginPath();
    context.arc(
      firstPoint.x,
      firstPoint.y,
      (MASK_BRUSH_RADIUS * Math.max(scale.x, scale.y)),
      0,
      Math.PI * 2,
    );
    context.fill();

    if (stroke.points.length < 2) continue;
    context.beginPath();
    context.moveTo(firstPoint.x, firstPoint.y);
    for (const point of stroke.points.slice(1)) {
      const nextPoint = toSourcePoint(point, scale);
      context.lineTo(nextPoint.x, nextPoint.y);
    }
    context.stroke();
  }
}

function drawMaskStrokePen(
  pen: IPen,
  points: LocalEditPoint[],
  origin: LocalEditPoint,
): IPen | null {
  if (!points.length) return null;
  const firstPoint = points[0];
  pen.moveTo(origin.x + firstPoint.x, origin.y + firstPoint.y);

  if (points.length === 1) {
    pen.lineTo(origin.x + firstPoint.x + 0.01, origin.y + firstPoint.y + 0.01);
  } else {
    for (const point of points.slice(1)) {
      pen.lineTo(origin.x + point.x, origin.y + point.y);
    }
  }

  pen.paint();
  return pen;
}

function drawMarkerMask(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  node: MiraImageNode,
  marker: LocalEditMarker,
) {
  const scale = getSourceScale(canvas, node);
  const center = toSourcePoint(marker.center, scale);
  context.beginPath();
  context.ellipse(
    center.x,
    center.y,
    marker.radius * scale.x,
    marker.radius * scale.y,
    0,
    0,
    Math.PI * 2,
  );
  context.fill();
}

function getSourceScale(canvas: HTMLCanvasElement, node: MiraImageNode) {
  return {
    x: canvas.width / Math.max(1, normalizeFiniteNumber(node.width, DEFAULT_OBJECT_SIZE)),
    y: canvas.height / Math.max(1, normalizeFiniteNumber(node.height, DEFAULT_OBJECT_SIZE)),
  };
}

function toSourcePoint(point: LocalEditPoint, scale: { x: number; y: number }) {
  return {
    x: point.x * scale.x,
    y: point.y * scale.y,
  };
}

function normalizeFiniteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizePositiveNumber(value: unknown, fallback: number) {
  return Math.max(1, normalizeFiniteNumber(value, fallback));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function safeCall(run: () => void) {
  try {
    run();
  } catch {
    // Leafer can throw during strict-mode teardown; React will recreate the canvas.
  }
}
