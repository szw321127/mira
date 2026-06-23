import type { Prisma } from "@prisma/client";

export type CanvasViewport = {
  x: number;
  y: number;
  zoom: number;
};

export type CanvasObjectInput = {
  id: string;
  assetId: string | null;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  props: Record<string, unknown>;
};

export type CanvasSnapshot = {
  viewport: CanvasViewport | null;
  objects: CanvasObjectInput[];
};

export type ImageTaskRequest = {
  type: "generate" | "edit" | "variation" | "upscale" | "background_removal";
  prompt: string;
  target?: {
    x: number;
    y: number;
  };
  assetId?: string;
  versionId?: string;
  maskKey?: string;
  size?: "1024x1024" | "1024x1536" | "1536x1024" | "auto";
  quality?: "low" | "medium" | "high" | "auto";
  background?: "transparent" | "opaque" | "auto";
};

type CanvasObjectRecord = Omit<CanvasObjectInput, "props"> & {
  workspaceId: string;
  props: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type ImageVersionRecord = {
  id: string;
  assetId: string;
  parentId: string | null;
  storageKey: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  prompt: string | null;
  editPrompt: string | null;
  maskKey: string | null;
  provider: string;
  providerJob: string | null;
  metadata: unknown;
  createdAt: Date;
};

type ImageAssetRecord = {
  id: string;
  workspaceId: string;
  userId: string;
  currentVersionId: string | null;
  title: string | null;
  prompt: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  versions?: ImageVersionRecord[];
};

type ImageTaskRecord = {
  id: string;
  workspaceId: string;
  userId: string;
  type: ImageTaskRequest["type"];
  status: "queued" | "running" | "complete" | "failed" | "canceled";
  input: unknown;
  output: unknown;
  error: string | null;
  cost: unknown;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

type ImageWorkspaceRecord = {
  id: string;
  userId: string;
  title: string;
  status: "active" | "archived";
  viewport: unknown;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  objects?: CanvasObjectRecord[];
  assets?: ImageAssetRecord[];
  tasks?: ImageTaskRecord[];
};

export function parseWorkspaceTitle(value: unknown): string | null {
  if (!isRecord(value)) return null;
  if (typeof value.title !== "string") return null;
  const title = value.title.trim();
  return title ? title : null;
}

export function parseCanvasSnapshot(value: unknown): CanvasSnapshot | null {
  if (!isRecord(value) || !Array.isArray(value.objects)) return null;

  const viewport = parseViewport(value.viewport);
  if (value.viewport !== undefined && !viewport) return null;

  const objects: CanvasObjectInput[] = [];
  for (const rawObject of value.objects) {
    const object = parseCanvasObject(rawObject);
    if (!object) return null;
    objects.push(object);
  }

  return {
    viewport,
    objects
  };
}

export function parseImageTaskRequest(value: unknown): ImageTaskRequest | null {
  if (!isRecord(value)) return null;
  if (!isTaskType(value.type)) return null;
  if (typeof value.prompt !== "string") return null;

  const prompt = value.prompt.trim();
  if (!prompt) return null;

  const target = parsePoint(value.target);
  if (value.target !== undefined && !target) return null;
  const size = parseImageSize(value.size);
  if (value.size !== undefined && !size) return null;
  const quality = parseImageQuality(value.quality);
  if (value.quality !== undefined && !quality) return null;
  const background = parseImageBackground(value.background);
  if (value.background !== undefined && !background) return null;

  return {
    type: value.type,
    prompt,
    ...(target ? { target } : {}),
    ...(typeof value.assetId === "string" && value.assetId.trim()
      ? { assetId: value.assetId.trim() }
      : {}),
    ...(typeof value.versionId === "string" && value.versionId.trim()
      ? { versionId: value.versionId.trim() }
      : {}),
    ...(typeof value.maskKey === "string" && value.maskKey.trim()
      ? { maskKey: value.maskKey.trim() }
      : {}),
    ...(size ? { size } : {}),
    ...(quality ? { quality } : {}),
    ...(background ? { background } : {})
  };
}

export function serializeImageWorkspace(workspace: ImageWorkspaceRecord) {
  return {
    id: workspace.id,
    title: workspace.title,
    status: workspace.status,
    viewport: isRecord(workspace.viewport) ? workspace.viewport : null,
    createdAt: workspace.createdAt.toISOString(),
    updatedAt: workspace.updatedAt.toISOString(),
    objects: (workspace.objects ?? []).map(serializeCanvasObject),
    assets: (workspace.assets ?? [])
      .filter((asset) => !isMaskAsset(asset))
      .map(serializeImageAsset),
    tasks: (workspace.tasks ?? []).map(serializeImageTask)
  };
}

export function serializeImageTask(task: ImageTaskRecord) {
  return {
    id: task.id,
    workspaceId: task.workspaceId,
    type: task.type,
    status: task.status,
    input: sanitizeImageTaskInput(task.input),
    output: sanitizeImageTaskOutput(task.output),
    error: task.error,
    cost: task.cost,
    createdAt: task.createdAt.toISOString(),
    startedAt: task.startedAt?.toISOString() ?? null,
    finishedAt: task.finishedAt?.toISOString() ?? null
  };
}

export function toInputJson(value: unknown): Prisma.InputJsonValue {
  return (isRecord(value) || Array.isArray(value) ? value : {}) as Prisma.InputJsonValue;
}

function serializeCanvasObject(object: CanvasObjectRecord) {
  return {
    id: object.id,
    assetId: object.assetId,
    type: object.type,
    x: object.x,
    y: object.y,
    width: object.width,
    height: object.height,
    rotation: object.rotation,
    zIndex: object.zIndex,
    props: isRecord(object.props) ? object.props : {},
    createdAt: object.createdAt.toISOString(),
    updatedAt: object.updatedAt.toISOString()
  };
}

function serializeImageAsset(asset: ImageAssetRecord) {
  return {
    id: asset.id,
    title: asset.title,
    prompt: asset.prompt,
    currentVersionId: asset.currentVersionId,
    metadata: isRecord(asset.metadata) ? asset.metadata : {},
    createdAt: asset.createdAt.toISOString(),
    updatedAt: asset.updatedAt.toISOString(),
    versions: (asset.versions ?? []).map(serializeImageVersion)
  };
}

function serializeImageVersion(version: ImageVersionRecord) {
  return {
    id: version.id,
    assetId: version.assetId,
    parentId: version.parentId,
    mimeType: version.mimeType,
    width: version.width,
    height: version.height,
    sizeBytes: version.sizeBytes,
    prompt: version.prompt,
    editPrompt: version.editPrompt,
    provider: version.provider,
    metadata: isRecord(version.metadata) ? version.metadata : {},
    createdAt: version.createdAt.toISOString()
  };
}

function sanitizeImageTaskInput(input: unknown): Record<string, unknown> {
  if (!isRecord(input)) return {};
  return copyKnownFields(input, [
    "prompt",
    "assetId",
    "versionId",
    "type",
    "size",
    "quality",
    "background",
    "target"
  ]);
}

function sanitizeImageTaskOutput(output: unknown): Record<string, unknown> {
  if (!isRecord(output)) return {};
  return copyKnownFields(output, ["assetId", "versionId", "objectId"]);
}

function copyKnownFields(
  source: Record<string, unknown>,
  keys: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (source[key] !== undefined) result[key] = source[key];
  }
  return result;
}

function isMaskAsset(asset: ImageAssetRecord) {
  return isRecord(asset.metadata) && asset.metadata.kind === "mask";
}

function parseCanvasObject(value: unknown): CanvasObjectInput | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== "string" || !value.id.trim()) return null;
  if (typeof value.type !== "string" || !value.type.trim()) return null;
  if (!isFiniteNumber(value.x) || !isFiniteNumber(value.y)) return null;
  if (!isFiniteNumber(value.width) || value.width <= 0) return null;
  if (!isFiniteNumber(value.height) || value.height <= 0) return null;

  const rotation = isFiniteNumber(value.rotation) ? value.rotation : 0;
  const zIndex =
    typeof value.zIndex === "number" && Number.isSafeInteger(value.zIndex)
      ? value.zIndex
      : 0;

  return {
    id: value.id.trim(),
    assetId:
      typeof value.assetId === "string" && value.assetId.trim()
        ? value.assetId.trim()
        : null,
    type: value.type.trim(),
    x: value.x,
    y: value.y,
    width: value.width,
    height: value.height,
    rotation,
    zIndex,
    props: isRecord(value.props) ? value.props : {}
  };
}

function parseViewport(value: unknown): CanvasViewport | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) return null;
  if (
    !isFiniteNumber(value.x) ||
    !isFiniteNumber(value.y) ||
    !isFiniteNumber(value.zoom) ||
    value.zoom <= 0
  ) {
    return null;
  }
  return {
    x: value.x,
    y: value.y,
    zoom: value.zoom
  };
}

function parsePoint(value: unknown): { x: number; y: number } | null {
  if (value === undefined || value === null) return null;
  if (!isRecord(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y)) {
    return null;
  }
  return { x: value.x, y: value.y };
}

function isTaskType(value: unknown): value is ImageTaskRequest["type"] {
  return (
    value === "generate" ||
    value === "edit" ||
    value === "variation" ||
    value === "upscale" ||
    value === "background_removal"
  );
}

function parseImageSize(value: unknown): ImageTaskRequest["size"] | null {
  if (
    value === "1024x1024" ||
    value === "1024x1536" ||
    value === "1536x1024" ||
    value === "auto"
  ) {
    return value;
  }
  return null;
}

function parseImageQuality(value: unknown): ImageTaskRequest["quality"] | null {
  if (
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "auto"
  ) {
    return value;
  }
  return null;
}

function parseImageBackground(
  value: unknown
): ImageTaskRequest["background"] | null {
  if (value === "transparent" || value === "opaque" || value === "auto") {
    return value;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
