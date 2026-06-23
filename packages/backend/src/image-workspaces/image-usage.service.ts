import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable
} from "@nestjs/common";
import { RuntimeSecretsService } from "../admin/runtime-secrets.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { isImageMimeType } from "./image-storage.types.js";
import type { ImageTaskRequest } from "./image-workspaces.types.js";

type ImageUsageTaskContext = {
  request: ImageTaskRequest;
  requestIp?: string;
  workspaceId: string;
};

type ImageVersionUsageRow = {
  mimeType: string;
  sizeBytes: number;
};

@Injectable()
export class ImageUsageService {
  private now: () => Date = () => new Date();

  constructor(
    private readonly prisma: PrismaService,
    private readonly runtimeSecrets: RuntimeSecretsService
  ) {}

  setClockForTesting(now: () => Date): void {
    this.now = now;
  }

  async assertCanCreateTask(
    userId: string,
    context?: ImageUsageTaskContext
  ): Promise<void> {
    const status = await this.runtimeSecrets.getImageProviderStatus();
    if (status.provider === "disabled") {
      throw new BadRequestException("图像生成功能已关闭，请联系管理员");
    }

    if (!status.configured) {
      throw new BadRequestException("图像生成配置不完整，请联系管理员");
    }

    const config = await this.runtimeSecrets.getImageConfig();
    assertSafeImagePrompt(context?.request.prompt);
    await this.assertImageInputsWithinLimits(userId, context, config.maxImageSizeMb);

    const dailyTaskLimit = parsePositiveInteger(config.maxDailyTasksPerUser, 50);
    const taskCount = await this.prisma.imageTask.count({
      where: {
        userId,
        createdAt: {
          gte: startOfUtcDay(this.now())
        },
        status: {
          not: "canceled"
        }
      }
    });

    if (taskCount >= dailyTaskLimit) {
      throw new HttpException("今日图像任务次数已用完", HttpStatus.TOO_MANY_REQUESTS);
    }

    const requestIp = context?.requestIp?.trim();
    if (!requestIp) return;

    const ipTaskCount = await this.prisma.imageTask.count({
      where: {
        requestIp,
        createdAt: {
          gte: startOfUtcDay(this.now())
        },
        status: {
          not: "canceled"
        }
      }
    });

    if (ipTaskCount >= dailyTaskLimit) {
      throw new HttpException(
        "当前网络的图像任务请求过多，请稍后再试",
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
  }

  private async assertImageInputsWithinLimits(
    userId: string,
    context: ImageUsageTaskContext | undefined,
    maxImageSizeMb: string
  ): Promise<void> {
    if (!context) return;
    const maxBytes = parsePositiveNumber(maxImageSizeMb, 20) * 1024 * 1024;

    if (context.request.assetId && context.request.versionId) {
      const source = await this.findOwnedVersion(userId, context.workspaceId, {
        assetId: context.request.assetId,
        id: context.request.versionId
      });
      if (source) {
        assertSupportedImage(source, maxBytes, {
          mime: "图片格式不支持，请上传 PNG、JPEG 或 WebP",
          size: "图片文件超过大小限制，请压缩后重试"
        });
      }
    }

    if (context.request.maskKey) {
      const mask = await this.findOwnedVersion(userId, context.workspaceId, {
        storageKey: context.request.maskKey
      });
      if (mask) {
        assertSupportedImage(mask, maxBytes, {
          mime: "蒙版格式不支持，请上传 PNG、JPEG 或 WebP",
          size: "蒙版文件超过大小限制，请压缩后重试"
        });
      }
    }
  }

  private async findOwnedVersion(
    userId: string,
    workspaceId: string,
    where: {
      assetId?: string;
      id?: string;
      storageKey?: string;
    }
  ): Promise<ImageVersionUsageRow | null> {
    return this.prisma.imageVersion.findFirst({
      where: {
        ...where,
        asset: {
          userId,
          workspaceId
        }
      },
      select: {
        mimeType: true,
        sizeBytes: true
      }
    });
  }
}

function parsePositiveInteger(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePositiveNumber(value: string, fallback: number): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function assertSupportedImage(
  version: ImageVersionUsageRow,
  maxBytes: number,
  messages: {
    mime: string;
    size: string;
  }
): void {
  if (!isImageMimeType(version.mimeType)) {
    throw new BadRequestException(messages.mime);
  }
  if (version.sizeBytes > maxBytes) {
    throw new BadRequestException(messages.size);
  }
}

function assertSafeImagePrompt(prompt: string | undefined): void {
  if (!prompt) return;
  const normalized = prompt.toLowerCase().replace(/\s+/g, "");
  const unsafePatterns = [
    /儿童色情|未成年色情|childporn|csam/,
    /色情|露点|裸露|sexuallyexplicit|porn/,
    /自杀|自残|suicide|selfharm/,
    /血腥|虐杀|肢解|斩首|gore|dismember|beheading/
  ];

  if (unsafePatterns.some((pattern) => pattern.test(normalized))) {
    throw new BadRequestException("图像提示词包含不支持的内容，请调整后重试");
  }
}

function startOfUtcDay(value: Date): Date {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())
  );
}
