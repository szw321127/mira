import {
  App,
  Group,
  Image,
  PointerEvent,
  type IApp,
  type IGroup,
  type IImage,
  type IUI,
} from "leafer-ui";
import { Editor } from "leafer-editor";
import type {
  CanvasController,
  CanvasControllerEvents,
  CanvasTool,
} from "./leafer-canvas-types";
import type {
  CanvasObject,
  CanvasSnapshot,
  CanvasViewport,
  ImageAsset,
  ImageWorkspace,
} from "./types";
import { createImageAssetPreviewUrl } from "./workspace-api";

type MiraImageMeta = {
  miraAssetId: string;
  miraObjectId: string;
  miraVersionId: string;
};

type MiraImageNode = IImage & {
  __mira?: MiraImageMeta;
  draggable?: boolean;
  editable?: boolean;
  remove: () => void;
};

type LeaferEditor = Editor & {
  cancel: () => void;
  select: (target: IUI | IUI[]) => void;
  target?: IUI | IUI[];
};

type ControllerOptions = {
  container: HTMLDivElement;
  events: CanvasControllerEvents;
};

type PointerLike = {
  current?: { x?: number; y?: number };
  x?: number;
  y?: number;
};

const DEFAULT_OBJECT_SIZE = 320;
const DEFAULT_VIEWPORT: CanvasViewport = { x: 0, y: 0, zoom: 1 };
const MIN_ZOOM = 0.18;
const MAX_ZOOM = 4;

export function createLeaferCanvasController({
  container,
  events,
}: ControllerOptions): CanvasController {
  let activeTool: CanvasTool = "select";
  let destroyed = false;
  let viewport: CanvasViewport = { ...DEFAULT_VIEWPORT };
  let selectedAssetId: string | null = null;
  let isPanning = false;
  let panStart: { pointer: { x: number; y: number }; viewport: CanvasViewport } | null =
    null;
  const changeListeners = new Set<() => void>();

  const app = new App({
    height: Math.max(1, container.clientHeight),
    view: container,
    width: Math.max(1, container.clientWidth),
  }) as IApp;
  const imageLayer = new Group({ x: 0, y: 0 }) as IGroup;
  const editor = new Editor() as LeaferEditor;

  app.add(imageLayer);
  app.add(editor);

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

  const emitSelection = (assetId: string | null) => {
    if (selectedAssetId === assetId) return;
    selectedAssetId = assetId;
    events.onSelectAsset(assetId);
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
    if (Array.isArray(target)) return toMiraImageNode(target[0]);
    return toMiraImageNode(target);
  };

  const selectNode = (node: MiraImageNode | null) => {
    applySelectionToEditor(node);
    emitSelection(node?.__mira?.miraAssetId ?? null);
  };

  const handlePointerTap = (event: unknown) => {
    if (activeTool !== "select") return;
    const target = (event as { target?: unknown }).target;
    const node = toMiraImageNode(target);
    selectNode(node);
  };

  const handlePointerDown = (event: unknown) => {
    if (activeTool !== "pan") return;
    const pointer = readPointer(event);
    if (!pointer) return;
    isPanning = true;
    panStart = { pointer, viewport: { ...viewport } };
    container.style.cursor = "grabbing";
  };

  const handlePointerMove = (event: unknown) => {
    if (!isPanning || !panStart) return;
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
    if (!isPanning) return;
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
    clearSelection: () => {
      applySelectionToEditor(null);
      emitSelection(null);
    },
    deleteSelection: () => {
      const selectedNode = readSelectedNode();
      if (!selectedNode) return;
      selectedNode.remove();
      applySelectionToEditor(null);
      emitSelection(null);
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
    getCanRedo: () => false,
    getCanUndo: () => false,
    hydrateWorkspace: (workspace) => {
      if (!workspace) {
        removeStaleMiraImageNodes(imageLayer, new Set());
        applySelectionToEditor(null);
        emitSelection(null);
        setViewport(DEFAULT_VIEWPORT);
        return;
      }

      const nextViewport = parseViewport(workspace.viewport);
      setViewport(nextViewport, false);

      const assetsById = new Map(workspace.assets.map((asset) => [asset.id, asset]));
      const validObjectIds = new Set<string>();
      const imageObjects = workspace.objects
        .filter((object) => object.type === "image" && object.assetId)
        .sort((a, b) => a.zIndex - b.zIndex);

      for (const object of imageObjects) {
        const asset = object.assetId ? assetsById.get(object.assetId) : null;
        const version = asset ? getCurrentVersion(asset) : null;
        if (!asset || !version) continue;

        validObjectIds.add(object.id);
        const node = findMiraImageNodeByObjectId(imageLayer, object.id);
        if (node) {
          node.set({
            height: object.height,
            rotation: object.rotation,
            url: createImageAssetPreviewUrl(asset.id),
            width: object.width,
            x: object.x,
            y: object.y,
            zIndex: object.zIndex,
          });
          node.__mira = {
            miraAssetId: asset.id,
            miraObjectId: object.id,
            miraVersionId: version.id,
          };
          continue;
        }

        const imageNode = new Image({
          draggable: true,
          editable: true,
          height: object.height,
          rotation: object.rotation,
          url: createImageAssetPreviewUrl(asset.id),
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
          miraVersionId: version.id,
        };
        imageLayer.add(imageNode);
      }

      removeStaleMiraImageNodes(imageLayer, validObjectIds);

      const selectedNode = selectedAssetId
        ? findMiraImageNodeByAssetId(imageLayer, selectedAssetId)
        : null;
      if (selectedAssetId && selectedNode) {
        applySelectionToEditor(selectedNode);
      }
      if (selectedAssetId && !selectedNode) {
        applySelectionToEditor(null);
        emitSelection(null);
      }
      emitChange();
    },
    redo: () => undefined,
    selectAsset: (assetId) => {
      if (!assetId) {
        applySelectionToEditor(null);
        emitSelection(null);
        return;
      }
      selectNode(findMiraImageNodeByAssetId(imageLayer, assetId));
    },
    serializeSnapshot: () => serializeSnapshot(imageLayer, viewport),
    setTool: (tool) => {
      activeTool = tool;
      container.style.cursor = tool === "pan" ? "grab" : "";
      if (tool === "pan") applySelectionToEditor(null);
      emitChange();
    },
    subscribeChange: (listener) => {
      changeListeners.add(listener);
      return () => {
        changeListeners.delete(listener);
      };
    },
    undo: () => undefined,
    zoomIn: () => {
      setViewport({ ...viewport, zoom: viewport.zoom * 1.12 });
    },
    zoomOut: () => {
      setViewport({ ...viewport, zoom: viewport.zoom / 1.12 });
    },
  };

  return controller;
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
    props: {},
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

function normalizeFiniteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
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
