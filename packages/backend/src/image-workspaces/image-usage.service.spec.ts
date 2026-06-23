import {
  BadRequestException,
  HttpException,
  HttpStatus
} from "@nestjs/common";
import { jest } from "@jest/globals";
import type { PrismaService } from "../database/prisma.service.js";
import type { RuntimeSecretsService } from "../admin/runtime-secrets.service.js";
import { ImageUsageService } from "./image-usage.service.js";

describe("ImageUsageService", () => {
  it("blocks image tasks when image generation is disabled", async () => {
    const service = new ImageUsageService(
      createPrisma(0),
      createRuntimeSecrets({
        configured: false,
        provider: "disabled",
        model: null,
        missingKeys: []
      })
    );

    await expect(service.assertCanCreateTask("user-1")).rejects.toThrow(
      BadRequestException
    );
    await expect(service.assertCanCreateTask("user-1")).rejects.toThrow(
      "图像生成功能已关闭，请联系管理员"
    );
  });

  it("blocks image tasks when provider config is incomplete", async () => {
    const service = new ImageUsageService(
      createPrisma(0),
      createRuntimeSecrets({
        configured: false,
        provider: "openai",
        model: "gpt-image-1",
        missingKeys: ["OPENAI_IMAGE_API_KEY"]
      })
    );

    await expect(service.assertCanCreateTask("user-1")).rejects.toThrow(
      BadRequestException
    );
    await expect(service.assertCanCreateTask("user-1")).rejects.toThrow(
      "图像生成配置不完整，请联系管理员"
    );
  });

  it("enforces the per-user daily image task quota using the UTC day", async () => {
    const prisma = createPrisma(3);
    const service = new ImageUsageService(
      prisma,
      createRuntimeSecrets(
        {
          configured: true,
          provider: "openai",
          model: "gpt-image-1",
          missingKeys: []
        },
        { maxDailyTasksPerUser: "3" }
      ),
      () => new Date("2026-06-23T12:34:00.000Z")
    );

    await expect(service.assertCanCreateTask("user-1")).rejects.toThrow(
      new HttpException("今日图像任务次数已用完", HttpStatus.TOO_MANY_REQUESTS)
    );
    await expect(service.assertCanCreateTask("user-1")).rejects.toThrow(
      "今日图像任务次数已用完"
    );
    expect(prisma.imageTask.count).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        createdAt: {
          gte: new Date("2026-06-23T00:00:00.000Z")
        },
        status: {
          not: "canceled"
        }
      }
    });
  });

  it("enforces the per-IP daily image task quota when request IP is present", async () => {
    const prisma = createPrisma({ userTaskCount: 1, ipTaskCount: 3 });
    const service = new ImageUsageService(
      prisma,
      createRuntimeSecrets(
        {
          configured: true,
          provider: "openai",
          model: "gpt-image-1",
          missingKeys: []
        },
        { maxDailyTasksPerUser: "3" }
      ),
      () => new Date("2026-06-23T12:34:00.000Z")
    );

    await expect(
      service.assertCanCreateTask("user-1", {
        workspaceId: "workspace-1",
        requestIp: "203.0.113.9",
        request: {
          type: "generate",
          prompt: "make a cover"
        }
      } as never)
    ).rejects.toThrow(
      new HttpException(
        "当前网络的图像任务请求过多，请稍后再试",
        HttpStatus.TOO_MANY_REQUESTS
      )
    );
    expect(prisma.imageTask.count).toHaveBeenCalledWith({
      where: {
        requestIp: "203.0.113.9",
        createdAt: {
          gte: new Date("2026-06-23T00:00:00.000Z")
        },
        status: {
          not: "canceled"
        }
      }
    });
  });

  it("allows image tasks when provider config is complete and quota remains", async () => {
    const prisma = createPrisma(2);
    const runtimeSecrets = createRuntimeSecrets(
      {
        configured: true,
        provider: "openai",
        model: "gpt-image-1",
        missingKeys: []
      },
      { maxDailyTasksPerUser: "3" }
    );
    const service = new ImageUsageService(prisma, runtimeSecrets);

    await expect(service.assertCanCreateTask("user-1")).resolves.toBeUndefined();
    expect(runtimeSecrets.getImageProviderStatus).toHaveBeenCalled();
    expect(runtimeSecrets.getImageConfig).toHaveBeenCalled();
  });

  it("blocks unsafe image generation prompts before quota writes", async () => {
    const prisma = createPrisma(0);
    const service = new ImageUsageService(
      prisma,
      createRuntimeSecrets({
        configured: true,
        provider: "openai",
        model: "gpt-image-1",
        missingKeys: []
      })
    );

    await expect(
      service.assertCanCreateTask("user-1", {
        workspaceId: "workspace-1",
        request: {
          type: "generate",
          prompt: "生成儿童色情图像"
        }
      })
    ).rejects.toThrow("图像提示词包含不支持的内容，请调整后重试");
    expect(prisma.imageTask.count).not.toHaveBeenCalled();
  });

  it("blocks unsafe image edit prompts before source lookup", async () => {
    const prisma = createPrisma(0, [
      imageVersion({
        id: "version-source",
        assetId: "asset-1"
      })
    ]);
    const service = new ImageUsageService(
      prisma,
      createRuntimeSecrets({
        configured: true,
        provider: "openai",
        model: "gpt-image-1",
        missingKeys: []
      })
    );

    await expect(
      service.assertCanCreateTask("user-1", {
        workspaceId: "workspace-1",
        request: {
          type: "edit",
          prompt: "把人物改成血腥虐杀场面",
          assetId: "asset-1",
          versionId: "version-source"
        }
      })
    ).rejects.toThrow("图像提示词包含不支持的内容，请调整后重试");
    expect(prisma.imageVersion.findFirst).not.toHaveBeenCalled();
  });

  it("blocks edit tasks when the source image exceeds the configured size limit", async () => {
    const service = new ImageUsageService(
      createPrisma(0, [
        imageVersion({
          id: "version-big",
          assetId: "asset-1",
          sizeBytes: 3 * 1024 * 1024
        })
      ]),
      createRuntimeSecrets(
        {
          configured: true,
          provider: "openai",
          model: "gpt-image-1",
          missingKeys: []
        },
        { maxImageSizeMb: "2" }
      )
    );

    await expect(
      service.assertCanCreateTask("user-1", {
        workspaceId: "workspace-1",
        request: {
          type: "edit",
          prompt: "replace the background",
          assetId: "asset-1",
          versionId: "version-big"
        }
      })
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.assertCanCreateTask("user-1", {
        workspaceId: "workspace-1",
        request: {
          type: "edit",
          prompt: "replace the background",
          assetId: "asset-1",
          versionId: "version-big"
        }
      })
    ).rejects.toThrow("图片文件超过大小限制，请压缩后重试");
  });

  it("blocks edit tasks when the mask image exceeds the configured size limit", async () => {
    const service = new ImageUsageService(
      createPrisma(0, [
        imageVersion({
          id: "version-source",
          assetId: "asset-1",
          sizeBytes: 512 * 1024
        }),
        imageVersion({
          id: "version-mask",
          assetId: "mask-asset",
          storageKey: "local/user/workspace/mask.png",
          sizeBytes: 4 * 1024 * 1024
        })
      ]),
      createRuntimeSecrets(
        {
          configured: true,
          provider: "openai",
          model: "gpt-image-1",
          missingKeys: []
        },
        { maxImageSizeMb: "2" }
      )
    );

    await expect(
      service.assertCanCreateTask("user-1", {
        workspaceId: "workspace-1",
        request: {
          type: "edit",
          prompt: "replace the background",
          assetId: "asset-1",
          versionId: "version-source",
          maskKey: "local/user/workspace/mask.png"
        }
      })
    ).rejects.toThrow("蒙版文件超过大小限制，请压缩后重试");
  });

  it("blocks edit tasks when the source image MIME type is unsupported", async () => {
    const service = new ImageUsageService(
      createPrisma(0, [
        imageVersion({
          id: "version-gif",
          assetId: "asset-1",
          mimeType: "image/gif"
        })
      ]),
      createRuntimeSecrets({
        configured: true,
        provider: "openai",
        model: "gpt-image-1",
        missingKeys: []
      })
    );

    await expect(
      service.assertCanCreateTask("user-1", {
        workspaceId: "workspace-1",
        request: {
          type: "edit",
          prompt: "replace the background",
          assetId: "asset-1",
          versionId: "version-gif"
        }
      })
    ).rejects.toThrow("图片格式不支持，请上传 PNG、JPEG 或 WebP");
  });
});

type ImageVersionFixture = {
  assetId: string;
  id: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  workspaceId: string;
  userId: string;
};

function imageVersion(
  overrides: Partial<ImageVersionFixture>
): ImageVersionFixture {
  return {
    assetId: "asset-1",
    id: "version-source",
    mimeType: "image/png",
    sizeBytes: 1024,
    storageKey: "local/user/workspace/source.png",
    userId: "user-1",
    workspaceId: "workspace-1",
    ...overrides
  };
}

function createPrisma(
  taskCounts: number | { userTaskCount: number; ipTaskCount: number },
  versions: ImageVersionFixture[] = []
) {
  const userTaskCount =
    typeof taskCounts === "number" ? taskCounts : taskCounts.userTaskCount;
  const ipTaskCount =
    typeof taskCounts === "number" ? taskCounts : taskCounts.ipTaskCount;

  return {
    imageTask: {
      count: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(where.requestIp ? ipTaskCount : userTaskCount)
      )
    },
    imageVersion: {
      findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) => {
        const assetWhere = where.asset as
          | { userId?: string; workspaceId?: string }
          | undefined;
        const match = versions.find((version) => {
          if (where.id && version.id !== where.id) return false;
          if (where.assetId && version.assetId !== where.assetId) return false;
          if (where.storageKey && version.storageKey !== where.storageKey) return false;
          if (assetWhere?.userId && version.userId !== assetWhere.userId) return false;
          if (
            assetWhere?.workspaceId &&
            version.workspaceId !== assetWhere.workspaceId
          ) {
            return false;
          }
          return true;
        });
        return Promise.resolve(match ?? null);
      })
    }
  } as unknown as jest.Mocked<PrismaService>;
}

function createRuntimeSecrets(
  status: Awaited<ReturnType<RuntimeSecretsService["getImageProviderStatus"]>>,
  imageConfigOverrides: Partial<
    Awaited<ReturnType<RuntimeSecretsService["getImageConfig"]>>
  > = {}
) {
  return {
    getImageProviderStatus: jest.fn(() => Promise.resolve(status)),
    getImageConfig: jest.fn(() =>
      Promise.resolve({
        provider: "openai",
        openaiApiKey: "sk-live-secret",
        openaiModel: "gpt-image-1",
        storageProvider: "local",
        storageBucket: "",
        storageRegion: "",
        storageEndpoint: "",
        storageAccessKey: "",
        storageSecretKey: "",
        maxDailyTasksPerUser: "50",
        maxImageSizeMb: "20",
        defaultQuality: "auto",
        ...imageConfigOverrides
      })
    )
  } as unknown as jest.Mocked<RuntimeSecretsService>;
}
