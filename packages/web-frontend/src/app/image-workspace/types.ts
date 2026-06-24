export type CanvasViewport = {
  x: number;
  y: number;
  zoom: number;
};

export type CanvasObject = {
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
  createdAt?: string;
  updatedAt?: string;
};

export type CanvasSnapshot = {
  viewport: CanvasViewport | null;
  objects: CanvasObject[];
};

export type ImageVersion = {
  id: string;
  assetId: string;
  parentId: string | null;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  prompt: string | null;
  editPrompt: string | null;
  provider: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type ImageAsset = {
  id: string;
  title: string | null;
  prompt: string | null;
  currentVersionId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  versions: ImageVersion[];
};

export type ImageTask = {
  id: string;
  workspaceId: string;
  type: "generate" | "edit" | "variation" | "upscale" | "background_removal" | "expand";
  status: "queued" | "running" | "complete" | "failed" | "canceled";
  input: Record<string, unknown>;
  output: unknown;
  error: string | null;
  cost: unknown;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type ImageGenerationSettings = {
  aspectRatio: "1:1" | "2:1" | "4:3" | "16:9" | "1:2" | "3:4" | "9:16";
  quality: "low" | "medium" | "high" | "auto";
  background: "transparent" | "opaque" | "auto";
};

export type ImageTaskEvent =
  | {
      type: "task-created";
      taskId: string;
      taskType: ImageTask["type"];
    }
  | {
      type: "task-progress";
      taskId: string;
      status: ImageTask["status"];
      message: string;
    }
  | {
      type: "asset-placeholder";
      taskId: string;
      objectId: string;
      x: number;
      y: number;
    }
  | {
      type: "asset-created";
      taskId: string;
      assetId: string;
      versionId: string;
      objectId: string;
    }
  | {
      type: "asset-updated";
      taskId: string;
      assetId: string;
      versionId: string;
    }
  | {
      type: "asset-version-created";
      taskId: string;
      assetId: string;
      versionId: string;
    }
  | {
      type: "canvas-updated";
      workspaceId: string;
      objectIds: string[];
    }
  | {
      type: "usage";
      taskId: string;
      provider: string;
      cost?: string;
    }
  | {
      type: "error";
      taskId: string;
      message: string;
    };

export type ImageWorkspace = {
  id: string;
  title: string;
  status: "active" | "archived";
  viewport: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  objects: CanvasObject[];
  assets: ImageAsset[];
  tasks: ImageTask[];
};
