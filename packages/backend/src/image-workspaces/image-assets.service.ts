import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional
} from "@nestjs/common";
import { SOURCE_IMAGE_UPLOAD_BYTES } from "../config/request-body-limit.js";
import { PrismaService } from "../database/prisma.service.js";
import type { ImageGenerateSize } from "./image-provider.types.js";
import {
  IMAGE_TASK_HISTORY_LIMIT,
  pruneImageTaskHistory
} from "./image-task-history.js";
import { ImageQueueService } from "./image-queue.service.js";
import { ImageUsageService } from "./image-usage.service.js";
import {
  type ImageMimeType,
  type ImageStorageService,
  type SignedImagePreview,
  IMAGE_STORAGE,
  isImageMimeType,
  normalizeImageMimeType
} from "./image-storage.types.js";
import {
  serializeImageTask,
  serializeImageWorkspace,
  toInputJson
} from "./image-workspaces.types.js";

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

type ImageWorkspaceRecord = {
  id: string;
  userId: string;
  title: string;
  status: "active" | "archived";
  viewport: unknown;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  objects?: Array<{
    id: string;
    workspaceId: string;
    assetId: string | null;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    zIndex: number;
    props: unknown;
    createdAt: Date;
    updatedAt: Date;
  }>;
  assets?: ImageAssetRecord[];
  tasks?: Array<{
    id: string;
    workspaceId: string;
    userId: string;
    type: "generate" | "edit" | "variation" | "upscale" | "background_removal";
    status: "queued" | "running" | "complete" | "failed" | "canceled";
    input: unknown;
    output: unknown;
    error: string | null;
    cost: unknown;
    createdAt: Date;
    startedAt: Date | null;
    finishedAt: Date | null;
  }>;
};

export type ImageAssetEditRequest = {
  maskId?: unknown;
  prompt?: unknown;
};

export type ImageSourceUploadRequest = {
  dataUrl?: unknown;
  title?: unknown;
};

export type ImageAssetMaskUploadRequest = {
  dataUrl?: unknown;
};

export type ImageAssetRevertRequest = {
  versionId?: unknown;
};

const assetInclude = {
  versions: {
    orderBy: {
      createdAt: "desc" as const
    }
  }
};

const workspaceInclude = {
  objects: {
    orderBy: {
      zIndex: "asc" as const
    }
  },
  assets: {
    orderBy: {
      updatedAt: "desc" as const
    },
    include: {
      versions: {
        orderBy: {
          createdAt: "desc" as const
        }
      }
    }
  },
  tasks: {
    orderBy: {
      createdAt: "desc" as const
    },
    take: IMAGE_TASK_HISTORY_LIMIT
  }
};

const UPSCALE_PROMPT = "提升图片清晰度和细节，保持原始构图";
const BACKGROUND_REMOVAL_PROMPT = "移除背景并保留主体，输出透明背景图片";

@Injectable()
export class ImageAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: ImageQueueService,
    @Inject(IMAGE_STORAGE)
    private readonly storage: ImageStorageService,
    @Optional()
    private readonly usage?: ImageUsageService
  ) {}

  async uploadSourceAsset(
    userId: string,
    workspaceId: string,
    request: ImageSourceUploadRequest
  ) {
    await this.findOwnedWorkspace(userId, workspaceId);
    const upload = parseImageDataUrl(request.dataUrl, {
      empty: "源图不能为空",
      format: "请上传 PNG、JPEG 或 WebP 源图",
      tooLarge: "源图超过大小限制，请压缩后重试"
    });
    const title = parseOptionalString(request.title) ?? "上传源图";
    const metadata = {
      kind: "source_upload",
      originalName: title
    };
    const stored = await this.storage.putImage({
      userId,
      workspaceId,
      taskId: `source-upload-${workspaceId}`,
      filename: `source-upload.${extensionForMimeType(upload.mimeType)}`,
      bytes: upload.bytes,
      mimeType: upload.mimeType
    });

    const workspace = await this.prisma.$transaction(async (tx) => {
      const asset = await tx.imageAsset.create({
        data: {
          workspaceId,
          userId,
          title,
          prompt: null,
          metadata: toInputJson(metadata)
        }
      });
      const version = await tx.imageVersion.create({
        data: {
          assetId: asset.id,
          storageKey: stored.storageKey,
          mimeType: stored.mimeType,
          width: stored.width,
          height: stored.height,
          sizeBytes: stored.sizeBytes,
          prompt: null,
          editPrompt: null,
          maskKey: null,
          provider: "mira",
          providerJob: null,
          metadata: toInputJson(metadata)
        }
      });
      await tx.imageAsset.update({
        where: { id: asset.id },
        data: {
          currentVersionId: version.id
        }
      });
      await tx.canvasObject.create({
        data: {
          workspaceId,
          assetId: asset.id,
          type: "image",
          x: 160,
          y: 160,
          width: Math.max(stored.width, 1),
          height: Math.max(stored.height, 1),
          rotation: 0,
          zIndex: 0,
          props: toInputJson({
            source: "upload",
            versionId: version.id
          })
        }
      });
      const reloaded = await tx.imageWorkspace.findFirst({
        where: {
          id: workspaceId,
          userId,
          deletedAt: null
        },
        include: workspaceInclude
      });
      if (!reloaded) throw new NotFoundException("Image workspace not found.");
      return reloaded;
    });

    return {
      workspace: serializeImageWorkspace(workspace)
    };
  }

  async createEditTask(
    userId: string,
    assetId: string,
    request: ImageAssetEditRequest,
    requestIp?: string
  ) {
    const asset = await this.findOwnedAsset(userId, assetId);
    const prompt = parsePrompt(request.prompt);
    const sourceVersion = this.currentVersion(asset);
    if (!sourceVersion) {
      throw new BadRequestException("当前图片没有可编辑的源版本");
    }

    const maskKey = await this.resolveEditMaskKey(userId, asset, request);

    const normalizedRequestIp = requestIp?.trim() || undefined;
    await this.usage?.assertCanCreateTask(userId, {
      workspaceId: asset.workspaceId,
      ...(normalizedRequestIp ? { requestIp: normalizedRequestIp } : {}),
      request: {
        type: "edit",
        prompt,
        assetId: asset.id,
        versionId: sourceVersion.id,
        ...(maskKey ? { maskKey } : {})
      }
    });

    const task = await this.prisma.imageTask.create({
      data: {
        workspaceId: asset.workspaceId,
        userId,
        type: "edit",
        input: toInputJson({
          prompt,
          assetId: asset.id,
          versionId: sourceVersion.id,
          ...(maskKey ? { maskKey } : {})
        })
      }
    });
    await pruneImageTaskHistory(this.prisma, asset.workspaceId);

    await this.queue.enqueue({
      taskId: task.id,
      workspaceId: asset.workspaceId,
      userId,
      type: "edit"
    });

    return {
      task: serializeImageTask(task)
    };
  }

  async createVariationTask(userId: string, assetId: string, requestIp?: string) {
    const asset = await this.findOwnedAsset(userId, assetId);
    const sourceVersion = this.currentVersion(asset);
    if (!sourceVersion) {
      throw new BadRequestException("当前图片没有可生成变体的源版本");
    }

    const prompt = asset.prompt || "生成图片变体";
    const normalizedRequestIp = requestIp?.trim() || undefined;
    await this.usage?.assertCanCreateTask(userId, {
      workspaceId: asset.workspaceId,
      ...(normalizedRequestIp ? { requestIp: normalizedRequestIp } : {}),
      request: {
        type: "variation",
        prompt,
        assetId: asset.id,
        versionId: sourceVersion.id
      }
    });

    const task = await this.prisma.imageTask.create({
      data: {
        workspaceId: asset.workspaceId,
        userId,
        type: "variation",
        input: toInputJson({
          prompt,
          assetId: asset.id,
          versionId: sourceVersion.id
        })
      }
    });
    await pruneImageTaskHistory(this.prisma, asset.workspaceId);

    await this.queue.enqueue({
      taskId: task.id,
      workspaceId: asset.workspaceId,
      userId,
      type: "variation"
    });

    return {
      task: serializeImageTask(task)
    };
  }

  async createUpscaleTask(userId: string, assetId: string, requestIp?: string) {
    return this.createAssetTransformTask(
      userId,
      assetId,
      {
        prompt: UPSCALE_PROMPT,
        sizeForVersion: selectUpscaleSize,
        type: "upscale"
      },
      requestIp
    );
  }

  async createBackgroundRemovalTask(
    userId: string,
    assetId: string,
    requestIp?: string
  ) {
    return this.createAssetTransformTask(
      userId,
      assetId,
      {
        prompt: BACKGROUND_REMOVAL_PROMPT,
        sizeForVersion: () => "auto",
        type: "background_removal"
      },
      requestIp
    );
  }

  async uploadMask(
    userId: string,
    assetId: string,
    request: ImageAssetMaskUploadRequest
  ) {
    const asset = await this.findOwnedAsset(userId, assetId);
    const sourceVersion = this.currentVersion(asset);
    if (!sourceVersion) {
      throw new BadRequestException("当前图片没有可编辑的源版本");
    }
    const mask = parseMaskDataUrl(request.dataUrl);
    const stored = await this.storage.putImage({
      userId,
      workspaceId: asset.workspaceId,
      taskId: `mask-${asset.id}`,
      filename: `${asset.id}-mask.png`,
      bytes: mask.bytes,
      mimeType: mask.mimeType
    });
    const metadata = {
      kind: "mask",
      sourceAssetId: asset.id
    };

    const maskVersion = await this.prisma.$transaction(async (tx) => {
      const maskAsset = await tx.imageAsset.create({
        data: {
          workspaceId: asset.workspaceId,
          userId,
          title: "Mask upload",
          prompt: null,
          metadata: toInputJson(metadata)
        }
      });
      const version = await tx.imageVersion.create({
        data: {
          assetId: maskAsset.id,
          storageKey: stored.storageKey,
          mimeType: stored.mimeType,
          width: stored.width || sourceVersion.width,
          height: stored.height || sourceVersion.height,
          sizeBytes: stored.sizeBytes,
          prompt: null,
          editPrompt: null,
          maskKey: null,
          provider: "mira",
          providerJob: null,
          metadata: toInputJson(metadata)
        }
      });
      await tx.imageAsset.update({
        where: { id: maskAsset.id },
        data: {
          currentVersionId: version.id
        }
      });
      return version;
    });

    return {
      maskId: maskVersion.id,
      sizeBytes: stored.sizeBytes
    };
  }

  async revert(userId: string, assetId: string, request: ImageAssetRevertRequest) {
    const asset = await this.findOwnedAsset(userId, assetId);
    const versionId = parseVersionId(request.versionId);
    const version = await this.prisma.imageVersion.findFirst({
      where: {
        id: versionId,
        assetId: asset.id
      }
    });
    if (!version) {
      throw new BadRequestException("图片版本不存在");
    }

    const updated = await this.prisma.imageAsset.update({
      where: { id: asset.id },
      data: { currentVersionId: version.id },
      include: assetInclude
    });

    return {
      asset: serializeImageAsset(updated)
    };
  }

  async download(userId: string, assetId: string) {
    const asset = await this.findOwnedAsset(userId, assetId);
    const version = this.currentVersion(asset);
    if (!version) {
      throw new BadRequestException("当前图片没有可下载的版本");
    }

    return this.createDownloadUrl(version);
  }

  async downloadVersion(userId: string, assetId: string, versionId: string) {
    const asset = await this.findOwnedAsset(userId, assetId);
    const version = (asset.versions ?? []).find((item) => item.id === versionId);
    if (!version) {
      throw new BadRequestException("图片版本不存在");
    }

    return this.createDownloadUrl(version);
  }

  private async createDownloadUrl(version: ImageVersionRecord) {
    return {
      url: await this.storage.createSignedPreviewUrl({
        storageKey: version.storageKey,
        mimeType: normalizeImageMimeType(version.mimeType),
        width: version.width,
        height: version.height,
        sizeBytes: version.sizeBytes
      })
    };
  }

  async preview(token: unknown): Promise<SignedImagePreview> {
    const previewToken = parsePreviewToken(token);
    if (!this.storage.readSignedPreview) {
      throw new NotFoundException("Image preview not found.");
    }

    try {
      return await this.storage.readSignedPreview(previewToken);
    } catch {
      throw new BadRequestException("图片预览链接已失效");
    }
  }

  async remove(userId: string, assetId: string) {
    const asset = await this.findOwnedAsset(userId, assetId);
    const versionsToDelete = (asset.versions ?? []).map(toStoredImageRef);
    await this.prisma.$transaction(async (tx) => {
      await tx.canvasObject.updateMany({
        where: {
          assetId: asset.id
        },
        data: {
          assetId: null
        }
      });
      await tx.imageAsset.delete({
        where: { id: asset.id }
      });
    });
    await Promise.all(
      versionsToDelete.map((version) =>
        this.storage.deleteImage(version).catch(() => undefined)
      )
    );
    return { ok: true };
  }

  private async findOwnedAsset(userId: string, assetId: string): Promise<ImageAssetRecord> {
    const asset = await this.prisma.imageAsset.findFirst({
      where: {
        id: assetId,
        userId,
        workspace: {
          deletedAt: null
        }
      },
      include: assetInclude
    });
    if (!asset) throw new NotFoundException("Image asset not found.");
    return asset;
  }

  private async findOwnedWorkspace(
    userId: string,
    workspaceId: string
  ): Promise<ImageWorkspaceRecord> {
    const workspace = await this.prisma.imageWorkspace.findFirst({
      where: {
        id: workspaceId,
        userId,
        deletedAt: null
      },
      include: workspaceInclude
    });
    if (!workspace) throw new NotFoundException("Image workspace not found.");
    return workspace;
  }

  private currentVersion(asset: ImageAssetRecord) {
    const versions = asset.versions ?? [];
    return (
      versions.find((version) => version.id === asset.currentVersionId) ??
      versions[0] ??
      null
    );
  }

  private async requireMaskInWorkspace(
    userId: string,
    workspaceId: string,
    maskKey: string
  ): Promise<ImageVersionRecord> {
    const mask = await this.prisma.imageVersion.findFirst({
      where: {
        storageKey: maskKey,
        asset: {
          userId,
          workspaceId
        }
      }
    });
    if (!mask) {
      throw new BadRequestException("遮罩图片不存在或不属于当前工作区");
    }
    return mask;
  }

  private async resolveMaskIdInWorkspace(
    userId: string,
    workspaceId: string,
    maskId: string
  ): Promise<ImageVersionRecord> {
    const mask = await this.prisma.imageVersion.findFirst({
      where: {
        id: maskId,
        asset: {
          userId,
          workspaceId
        }
      }
    });
    if (!mask) {
      throw new BadRequestException("遮罩图片不存在或不属于当前工作区");
    }
    return mask;
  }

  private async resolveEditMaskKey(
    userId: string,
    asset: ImageAssetRecord,
    request: ImageAssetEditRequest
  ): Promise<string | null> {
    const maskId = parseOptionalString(request.maskId);
    if (maskId) {
      const mask = await this.resolveMaskIdInWorkspace(
        userId,
        asset.workspaceId,
        maskId
      );
      return mask.storageKey;
    }

    return null;
  }

  private async createAssetTransformTask(
    userId: string,
    assetId: string,
    action: {
      prompt: string;
      sizeForVersion: (version: ImageVersionRecord) => ImageGenerateSize;
      type: "upscale" | "background_removal";
    },
    requestIp?: string
  ) {
    const asset = await this.findOwnedAsset(userId, assetId);
    const sourceVersion = this.currentVersion(asset);
    if (!sourceVersion) {
      throw new BadRequestException("当前图片没有可处理的源版本");
    }
    const size = action.sizeForVersion(sourceVersion);

    const normalizedRequestIp = requestIp?.trim() || undefined;
    await this.usage?.assertCanCreateTask(userId, {
      workspaceId: asset.workspaceId,
      ...(normalizedRequestIp ? { requestIp: normalizedRequestIp } : {}),
      request: {
        type: action.type,
        prompt: action.prompt,
        assetId: asset.id,
        versionId: sourceVersion.id,
        size
      }
    });

    const task = await this.prisma.imageTask.create({
      data: {
        workspaceId: asset.workspaceId,
        userId,
        type: action.type,
        input: toInputJson({
          prompt: action.prompt,
          assetId: asset.id,
          versionId: sourceVersion.id,
          size
        })
      }
    });
    await pruneImageTaskHistory(this.prisma, asset.workspaceId);

    await this.queue.enqueue({
      taskId: task.id,
      workspaceId: asset.workspaceId,
      userId,
      type: action.type
    });

    return {
      task: serializeImageTask(task)
    };
  }
}

function parsePrompt(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequestException("请输入图片编辑提示词");
  }
  return value.trim();
}

function parseOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parseMaskDataUrl(value: unknown): {
  bytes: Buffer;
  mimeType: ImageMimeType;
} {
  return parseImageDataUrl(value, {
    empty: "蒙版图片不能为空",
    format: "请上传 PNG、JPEG 或 WebP 蒙版",
    tooLarge: "蒙版文件超过大小限制，请压缩后重试"
  });
}

function parseImageDataUrl(
  value: unknown,
  messages: {
    empty: string;
    format: string;
    tooLarge?: string;
  }
): {
  bytes: Buffer;
  mimeType: ImageMimeType;
} {
  if (typeof value !== "string") {
    throw new BadRequestException(messages.format);
  }
  const match = value.match(/^data:([^;]+);base64,([A-Za-z0-9+/=\s]*)$/);
  if (!match || !isImageMimeType(match[1])) {
    throw new BadRequestException(messages.format);
  }
  const bytes = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (bytes.byteLength === 0) {
    throw new BadRequestException(messages.empty);
  }
  if (messages.tooLarge && bytes.byteLength > SOURCE_IMAGE_UPLOAD_BYTES) {
    throw new BadRequestException(messages.tooLarge);
  }
  return {
    bytes,
    mimeType: match[1]
  };
}

function parseVersionId(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequestException("请选择要恢复的图片版本");
  }
  return value.trim();
}

function parsePreviewToken(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new BadRequestException("图片预览链接无效");
  }
  return value.trim();
}

function extensionForMimeType(mimeType: ImageMimeType) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/webp") return "webp";
  return "png";
}

function selectUpscaleSize(version: ImageVersionRecord): ImageGenerateSize {
  if (version.width > version.height) return "1536x1024";
  if (version.height > version.width) return "1024x1536";
  return "1024x1024";
}

function toStoredImageRef(version: ImageVersionRecord) {
  return {
    storageKey: version.storageKey,
    mimeType: normalizeImageMimeType(version.mimeType),
    width: version.width,
    height: version.height,
    sizeBytes: version.sizeBytes
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
    versions: (asset.versions ?? []).map((version) => ({
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
    }))
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
