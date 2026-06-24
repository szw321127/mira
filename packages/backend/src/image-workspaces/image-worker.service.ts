import { Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service.js";
import {
  IMAGE_PROVIDER,
  imageGenerateSizeForAspectRatio,
  isImageBackground,
  isImageAspectRatio,
  isImageGenerateQuality,
  isImageGenerateSize,
  type ImageAspectRatio,
  type ImageGenerateSize,
  type ImageProviderAdapter
} from "./image-provider.types.js";
import { ImageQueueService } from "./image-queue.service.js";
import {
  IMAGE_STORAGE,
  normalizeImageMimeType,
  type StoredImageRef,
  type ImageStorageService
} from "./image-storage.types.js";
import { toInputJson } from "./image-workspaces.types.js";

type ImageTaskRow = {
  id: string;
  workspaceId: string;
  userId: string;
  type: "generate" | "edit" | "variation" | "upscale" | "background_removal";
  status: "queued" | "running" | "complete" | "failed" | "canceled";
  input: unknown;
};

type ImageVersionRow = {
  id: string;
  assetId: string;
  storageKey: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  prompt: string | null;
};

@Injectable()
export class ImageWorkerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: ImageQueueService,
    @Inject(IMAGE_PROVIDER)
    private readonly provider: ImageProviderAdapter,
    @Inject(IMAGE_STORAGE)
    private readonly storage: ImageStorageService
  ) {}

  async processNext(): Promise<boolean> {
    const payload = await this.queue.claimNext();
    if (!payload) return false;
    await this.processTask(payload.taskId);
    return true;
  }

  async processTask(taskId: string): Promise<void> {
    const task = (await this.prisma.imageTask.findUnique({
      where: { id: taskId }
    })) as ImageTaskRow | null;

    if (!task) return;
    if (task.status === "canceled") return;

    try {
      await this.ensureWorkspaceExists(task);
      await this.markRunning(task);

      if (task.type === "generate") {
        await this.processGenerateTask(task);
        return;
      }

      if (
        task.type === "edit" ||
        task.type === "variation" ||
        task.type === "upscale" ||
        task.type === "background_removal"
      ) {
        await this.processImageEditTask(task);
        return;
      }

      throw new Error("Unsupported image task type");
    } catch (error) {
      await this.markFailed(task, error);
    }
  }

  private async processGenerateTask(task: ImageTaskRow): Promise<void> {
    const input = parseGenerateTaskInput(task.input);
    await this.emitAssetPlaceholder(task, input.target);
    const generated = await this.provider.generate({
      prompt: input.prompt,
      ...(input.aspectRatio ? { aspectRatio: input.aspectRatio } : {}),
      size: input.size,
      quality: input.quality,
      background: input.background
    });
    if (await this.isTaskCanceled(task.id)) return;

    const stored = await this.storage.putImage({
      userId: task.userId,
      workspaceId: task.workspaceId,
      taskId: task.id,
      filename: `${task.id}.png`,
      bytes: generated.bytes,
      mimeType: generated.mimeType
    });
    if (await this.cleanupStoredImageIfCanceled(task.id, stored)) return;

    const placement = await this.createGeneratedAsset(task, input, generated, stored);

    await this.queue.emitEvent(task.id, {
      type: "asset-created",
      taskId: task.id,
      assetId: placement.assetId,
      versionId: placement.versionId,
      objectId: placement.objectId
    });
    await this.queue.emitEvent(task.id, {
      type: "canvas-updated",
      workspaceId: task.workspaceId,
      objectIds: [placement.objectId]
    });
    await this.emitUsageEvent(task, generated, {
      aspectRatio: input.aspectRatio,
      quality: input.quality,
      size: input.size
    });
    await this.queue.emitEvent(task.id, {
      type: "task-progress",
      taskId: task.id,
      status: "complete",
      message: getImageTaskProgressCopy(task.type).complete
    });
  }

  private async processImageEditTask(task: ImageTaskRow): Promise<void> {
    const input = parseEditTaskInput(task.input);
    const sourceVersion = await this.findTaskVersion(task, input);
    const mask = input.maskKey
      ? await this.findMaskVersion(task, input.maskKey)
      : null;
    const generated = await this.provider.edit({
      prompt: input.prompt,
      image: toStoredImageRef(sourceVersion),
      ...(mask ? { mask: toStoredImageRef(mask) } : {}),
      size: input.size
    });
    if (await this.isTaskCanceled(task.id)) return;

    const stored = await this.storage.putImage({
      userId: task.userId,
      workspaceId: task.workspaceId,
      taskId: task.id,
      filename: `${task.id}.png`,
      bytes: generated.bytes,
      mimeType: generated.mimeType
    });
    if (await this.cleanupStoredImageIfCanceled(task.id, stored)) return;

    const version = await this.createEditedVersion(
      task,
      input,
      sourceVersion,
      generated,
      stored
    );

    await this.queue.emitEvent(task.id, {
      type: "asset-version-created",
      taskId: task.id,
      assetId: input.assetId,
      versionId: version.versionId
    });
    await this.queue.emitEvent(task.id, {
      type: "asset-updated",
      taskId: task.id,
      assetId: input.assetId,
      versionId: version.versionId
    });
    await this.emitUsageEvent(task, generated, {
      quality: null,
      size: input.size
    });
    await this.queue.emitEvent(task.id, {
      type: "task-progress",
      taskId: task.id,
      status: "complete",
      message: getImageTaskProgressCopy(task.type).complete
    });
  }

  private async ensureWorkspaceExists(task: ImageTaskRow): Promise<void> {
    const workspace = await this.prisma.imageWorkspace.findFirst({
      where: {
        id: task.workspaceId,
        userId: task.userId,
        deletedAt: null
      }
    });
    if (!workspace) throw new Error("Image workspace not found.");
  }

  private async markRunning(task: ImageTaskRow): Promise<void> {
    await this.prisma.imageTask.update({
      where: { id: task.id },
      data: {
        status: "running",
        startedAt: new Date()
      }
    });
    await this.queue.emitEvent(task.id, {
      type: "task-progress",
      taskId: task.id,
      status: "running",
      message: getImageTaskProgressCopy(task.type).running
    });
  }

  private async emitAssetPlaceholder(
    task: ImageTaskRow,
    target: { x: number; y: number }
  ): Promise<void> {
    await this.queue.emitEvent(task.id, {
      type: "asset-placeholder",
      taskId: task.id,
      objectId: `placeholder-${task.id}`,
      x: target.x,
      y: target.y
    });
  }

  private async markFailed(task: ImageTaskRow, error: unknown): Promise<void> {
    const message = getSafeTaskFailureMessage(
      error,
      getImageTaskProgressCopy(task.type).failed
    );
    await this.prisma.imageTask.update({
      where: { id: task.id },
      data: {
        status: "failed",
        error: message,
        finishedAt: new Date()
      }
    });
    await this.queue.emitEvent(task.id, {
      type: "error",
      taskId: task.id,
      message
    });
  }

  private async isTaskCanceled(taskId: string): Promise<boolean> {
    const task = await this.prisma.imageTask.findUnique({
      where: { id: taskId },
      select: { status: true }
    });
    return !task || task.status === "canceled";
  }

  private async cleanupStoredImageIfCanceled(
    taskId: string,
    stored: StoredImageRef
  ): Promise<boolean> {
    if (!(await this.isTaskCanceled(taskId))) return false;
    try {
      await this.storage.deleteImage(stored);
    } catch {
      // The task is already canceled; do not turn a best-effort cleanup miss into
      // a user-visible failed task or persist a result after cancellation.
    }
    return true;
  }

  private async emitUsageEvent(
    task: ImageTaskRow,
    generated: {
      metadata: Record<string, unknown>;
      provider: string;
    },
    input: {
      aspectRatio?: GenerateTaskInput["aspectRatio"];
      quality: GenerateTaskInput["quality"] | null;
      size: GenerateTaskInput["size"];
    }
  ): Promise<void> {
    const cost = createImageTaskCost(generated, input);
    await this.queue.emitEvent(task.id, {
      type: "usage",
      taskId: task.id,
      provider: cost.provider,
      ...(cost.estimatedCostUsd === null
        ? {}
        : { cost: String(cost.estimatedCostUsd) })
    });
  }

  private async createGeneratedAsset(
    task: ImageTaskRow,
    input: GenerateTaskInput,
    generated: {
      metadata: Record<string, unknown>;
      provider: string;
      providerJob: string | null;
      width: number;
      height: number;
    },
    stored: {
      height: number;
      mimeType: string;
      sizeBytes: number;
      storageKey: string;
      width: number;
    }
  ): Promise<{ assetId: string; objectId: string; versionId: string }> {
    return this.prisma.$transaction(async (tx) => {
      const asset = await tx.imageAsset.create({
        data: {
          workspaceId: task.workspaceId,
          userId: task.userId,
          title: input.prompt.slice(0, 80),
          prompt: input.prompt,
          metadata: Prisma.JsonNull
        }
      });
      const width = stored.width || generated.width;
      const height = stored.height || generated.height;
      const version = await tx.imageVersion.create({
        data: {
          assetId: asset.id,
          storageKey: stored.storageKey,
          mimeType: stored.mimeType,
          width,
          height,
          sizeBytes: stored.sizeBytes,
          prompt: input.prompt,
          provider: generated.provider,
          providerJob: generated.providerJob,
          metadata: toInputJson(generated.metadata)
        }
      });
      await tx.imageAsset.update({
        where: { id: asset.id },
        data: {
          currentVersionId: version.id
        }
      });
      const object = await tx.canvasObject.create({
        data: {
          workspaceId: task.workspaceId,
          assetId: asset.id,
          type: "image",
          x: input.target.x,
          y: input.target.y,
          width,
          height,
          rotation: 0,
          zIndex: 0,
          props: toInputJson({
            versionId: version.id
          })
        }
      });
      await tx.imageTask.update({
        where: { id: task.id },
        data: {
          status: "complete",
          output: toInputJson({
            assetId: asset.id,
            versionId: version.id,
            objectId: object.id
          }),
          cost: toInputJson(createImageTaskCost(generated, {
            quality: input.quality,
            aspectRatio: input.aspectRatio,
            size: input.size
          })),
          finishedAt: new Date()
        }
      });

      return {
        assetId: asset.id,
        versionId: version.id,
        objectId: object.id
      };
    });
  }

  private async findTaskVersion(
    task: ImageTaskRow,
    input: EditTaskInput
  ): Promise<ImageVersionRow> {
    const version = (await this.prisma.imageVersion.findFirst({
      where: {
        id: input.versionId,
        assetId: input.assetId,
        asset: {
          userId: task.userId,
          workspaceId: task.workspaceId
        }
      }
    })) as ImageVersionRow | null;
    if (!version) throw new Error("Image source version not found.");
    return version;
  }

  private async findMaskVersion(
    task: ImageTaskRow,
    maskKey: string
  ): Promise<ImageVersionRow> {
    const version = (await this.prisma.imageVersion.findFirst({
      where: {
        storageKey: maskKey,
        asset: {
          userId: task.userId,
          workspaceId: task.workspaceId
        }
      }
    })) as ImageVersionRow | null;
    if (!version) throw new Error("Image mask version not found.");
    return version;
  }

  private async createEditedVersion(
    task: ImageTaskRow,
    input: EditTaskInput,
    sourceVersion: ImageVersionRow,
    generated: {
      metadata: Record<string, unknown>;
      provider: string;
      providerJob: string | null;
      width: number;
      height: number;
    },
    stored: {
      height: number;
      mimeType: string;
      sizeBytes: number;
      storageKey: string;
      width: number;
    }
  ): Promise<{ versionId: string }> {
    return this.prisma.$transaction(async (tx) => {
      const width = stored.width || generated.width;
      const height = stored.height || generated.height;
      const version = await tx.imageVersion.create({
        data: {
          assetId: input.assetId,
          parentId: sourceVersion.id,
          storageKey: stored.storageKey,
          mimeType: stored.mimeType,
          width,
          height,
          sizeBytes: stored.sizeBytes,
          prompt: sourceVersion.prompt,
          editPrompt: input.prompt,
          maskKey: input.maskKey ?? null,
          provider: generated.provider,
          providerJob: generated.providerJob,
          metadata: toInputJson(generated.metadata)
        }
      });
      await tx.imageAsset.update({
        where: { id: input.assetId },
        data: {
          currentVersionId: version.id
        }
      });
      await tx.imageTask.update({
        where: { id: task.id },
        data: {
          status: "complete",
          output: toInputJson({
            assetId: input.assetId,
            versionId: version.id
          }),
          cost: toInputJson(createImageTaskCost(generated, {
            quality: null,
            size: input.size
          })),
          finishedAt: new Date()
        }
      });

      return {
        versionId: version.id
      };
    });
  }
}

type GenerateTaskInput = {
  prompt: string;
  aspectRatio: ImageAspectRatio | null;
  size: ImageGenerateSize;
  quality: "low" | "medium" | "high" | "auto";
  background: "transparent" | "opaque" | "auto";
  target: {
    x: number;
    y: number;
  };
};

type EditTaskInput = {
  prompt: string;
  assetId: string;
  versionId: string;
  maskKey?: string;
  size: ImageGenerateSize;
};

function parseGenerateTaskInput(input: unknown): GenerateTaskInput {
  const record = isRecord(input) ? input : {};
  const aspectRatio = isImageAspectRatio(record.aspectRatio)
    ? record.aspectRatio
    : null;
  const legacySize = isImageGenerateSize(record.size) ? record.size : null;
  return {
    prompt: typeof record.prompt === "string" && record.prompt.trim()
      ? record.prompt.trim()
      : "生成图像",
    aspectRatio,
    size: aspectRatio
      ? imageGenerateSizeForAspectRatio(aspectRatio)
      : legacySize ?? "1024x1024",
    quality: isImageGenerateQuality(record.quality) ? record.quality : "auto",
    background: isImageBackground(record.background) ? record.background : "auto",
    target: parseTarget(record.target)
  };
}

function parseEditTaskInput(input: unknown): EditTaskInput {
  const record = isRecord(input) ? input : {};
  return {
    prompt: typeof record.prompt === "string" && record.prompt.trim()
      ? record.prompt.trim()
      : "编辑图片",
    assetId: typeof record.assetId === "string" && record.assetId.trim()
      ? record.assetId.trim()
      : "",
    versionId: typeof record.versionId === "string" && record.versionId.trim()
      ? record.versionId.trim()
      : "",
    ...(typeof record.maskKey === "string" && record.maskKey.trim()
      ? { maskKey: record.maskKey.trim() }
      : {}),
    size: isImageGenerateSize(record.size) ? record.size : "auto"
  };
}

function toStoredImageRef(version: ImageVersionRow): StoredImageRef {
  return {
    storageKey: version.storageKey,
    mimeType: normalizeImageMimeType(version.mimeType),
    width: version.width,
    height: version.height,
    sizeBytes: version.sizeBytes
  };
}

function createImageTaskCost(
  generated: {
    metadata: Record<string, unknown>;
    provider: string;
  },
  input: {
    aspectRatio?: GenerateTaskInput["aspectRatio"];
    quality: GenerateTaskInput["quality"] | null;
    size: GenerateTaskInput["size"];
  }
): {
  aspectRatio?: string;
  estimatedCostUsd: number | null;
  model: string | null;
  provider: string;
  quality: string | null;
  size: string;
} {
  const aspectRatio =
    readNonEmptyString(generated.metadata.aspectRatio) ?? input.aspectRatio;
  return {
    provider: generated.provider,
    model: readNonEmptyString(generated.metadata.model),
    ...(aspectRatio ? { aspectRatio } : {}),
    size: readNonEmptyString(generated.metadata.size) ?? input.size,
    quality: readNonEmptyString(generated.metadata.quality) ?? input.quality,
    estimatedCostUsd: readFiniteNumber(generated.metadata.estimatedCostUsd)
  };
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getImageTaskProgressCopy(type: ImageTaskRow["type"]): {
  complete: string;
  failed: string;
  running: string;
} {
  switch (type) {
    case "edit":
      return {
        running: "正在编辑图片",
        complete: "图片编辑已完成",
        failed: "图片编辑失败，请稍后再试"
      };
    case "variation":
      return {
        running: "正在生成图片变体",
        complete: "图片变体已生成",
        failed: "图片变体生成失败，请稍后再试"
      };
    case "upscale":
      return {
        running: "正在放大图片",
        complete: "图片已放大",
        failed: "图片放大失败，请稍后再试"
      };
    case "background_removal":
      return {
        running: "正在移除背景",
        complete: "背景已移除",
        failed: "背景移除失败，请稍后再试"
      };
    case "generate":
    default:
      return {
        running: "正在生成图像",
        complete: "图像已生成",
        failed: "图像生成失败，请稍后再试"
      };
  }
}

function getSafeTaskFailureMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message.trim() : "";
  if (
    message === "提示词可能包含平台限制内容，请调整后再试" ||
    message === "图像模型通道暂不可用，请稍后重试或在后台切换模型" ||
    message === "图像生成服务未配置，请联系管理员"
  ) {
    return message;
  }
  return fallback;
}

function parseTarget(value: unknown): { x: number; y: number } {
  if (!isRecord(value)) return { x: 0, y: 0 };
  return {
    x: typeof value.x === "number" && Number.isFinite(value.x) ? value.x : 0,
    y: typeof value.y === "number" && Number.isFinite(value.y) ? value.y : 0
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
