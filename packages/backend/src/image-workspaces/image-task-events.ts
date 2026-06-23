export type ImageTaskQueuePayload = {
  taskId: string;
  workspaceId: string;
  userId: string;
  type: "generate" | "edit" | "variation" | "upscale" | "background_removal";
};

export type ImageTaskEvent =
  | {
      type: "task-created";
      taskId: string;
      taskType: ImageTaskQueuePayload["type"];
    }
  | {
      type: "task-progress";
      taskId: string;
      status: string;
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

export function encodeImageTaskEvent(event: ImageTaskEvent): string {
  return `${JSON.stringify(event)}\n`;
}
