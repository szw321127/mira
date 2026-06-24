import { BadRequestException, NotFoundException } from "@nestjs/common";
import { jest } from "@jest/globals";
import type { PrismaService } from "../database/prisma.service.js";
import type { ImageStorageService } from "./image-storage.types.js";
import type { ImageQueueService } from "./image-queue.service.js";
import type { ImageUsageService } from "./image-usage.service.js";
import { ImageAssetsService } from "./image-assets.service.js";

type VersionRow = {
  id: string;
  assetId: string;
  parentId: string | null;
  storageKey: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
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

type AssetRow = {
  id: string;
  workspaceId: string;
  userId: string;
  currentVersionId: string | null;
  title: string | null;
  prompt: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  versions: VersionRow[];
};

type WorkspaceRow = {
  id: string;
  userId: string;
  title: string;
  status: "active" | "archived";
  viewport: unknown;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
  objects: CanvasObjectRow[];
  assets: AssetRow[];
  tasks: ImageTaskRow[];
};

type CanvasObjectRow = {
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
};

type ImageTaskRow = {
  id: string;
  workspaceId: string;
  userId: string;
  type: "generate" | "edit" | "variation" | "upscale" | "background_removal" | "expand";
  status: "queued" | "running" | "complete" | "failed" | "canceled";
  input: unknown;
  output: unknown;
  error: string | null;
  cost: unknown;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

function createVersion(
  id: string,
  assetId: string,
  storageKey = `local/user/workspace/task/${id}.png`
): VersionRow {
  return {
    id,
    assetId,
    parentId: null,
    storageKey,
    mimeType: "image/png",
    width: 1024,
    height: 1024,
    sizeBytes: 128,
    prompt: "source prompt",
    editPrompt: null,
    maskKey: null,
    provider: "openai",
    providerJob: "job-1",
    metadata: {},
    createdAt: new Date("2026-06-23T08:00:00.000Z")
  };
}

function createAsset(
  id: string,
  userId: string,
  workspaceId: string,
  versions: VersionRow[] = [createVersion("version-1", id)]
): AssetRow {
  return {
    id,
    workspaceId,
    userId,
    currentVersionId: versions[0]?.id ?? null,
    title: "Hero",
    prompt: "source prompt",
    metadata: {},
    createdAt: new Date("2026-06-23T08:00:00.000Z"),
    updatedAt: new Date("2026-06-23T08:00:00.000Z"),
    versions
  };
}

function createWorkspace(
  id: string,
  userId: string,
  assets: AssetRow[] = [],
  overrides: Partial<Pick<WorkspaceRow, "deletedAt" | "status">> = {}
): WorkspaceRow {
  return {
    id,
    userId,
    title: "视觉草稿",
    status: overrides.status ?? "active",
    viewport: null,
    createdAt: new Date("2026-06-23T08:00:00.000Z"),
    updatedAt: new Date("2026-06-23T08:00:00.000Z"),
    deletedAt: overrides.deletedAt ?? null,
    objects: [],
    assets,
    tasks: []
  };
}

function createPrisma(assets: AssetRow[], workspaces: WorkspaceRow[] = []) {
  for (const asset of assets) {
    const workspace = workspaces.find((row) => row.id === asset.workspaceId);
    if (workspace) {
      if (!workspace.assets.some((row) => row.id === asset.id)) {
        workspace.assets.push(asset);
      }
      continue;
    }
    workspaces.push(createWorkspace(asset.workspaceId, asset.userId, [asset]));
  }

  let taskCount = 0;
  const prisma = {
    imageWorkspace: {
      findFirst: jest.fn(({ where }: Record<string, unknown>) => {
        const typedWhere = where as {
          id?: string;
          userId?: string;
          deletedAt?: null;
        };
        const workspace =
          workspaces.find((row) => {
            if (typedWhere.id && row.id !== typedWhere.id) return false;
            if (typedWhere.userId && row.userId !== typedWhere.userId) return false;
            if (typedWhere.deletedAt === null && row.deletedAt !== null) return false;
            return true;
          }) ?? null;
        return Promise.resolve(workspace ? includeWorkspace(workspace) : null);
      })
    },
    imageAsset: {
      findFirst: jest.fn(({ where }: Record<string, unknown>) => {
        const typedWhere = where as {
          id: string;
          userId: string;
          workspace?: {
            deletedAt?: null;
          };
        };
        const asset =
          assets.find((row) => {
            if (row.id !== typedWhere.id || row.userId !== typedWhere.userId) {
              return false;
            }
            if (typedWhere.workspace?.deletedAt === null) {
              const workspace = workspaces.find((item) => item.id === row.workspaceId);
              if (!workspace || workspace.deletedAt !== null) return false;
            }
            return true;
          }) ??
          null;
        return Promise.resolve(asset ? includeVersions(asset) : null);
      }),
      create: jest.fn(({ data }: Record<string, unknown>) => {
        const explicitId = (data as { id?: string }).id;
        const row = {
          id: explicitId ?? `mask-asset-${assets.length + 1}`,
          workspaceId: (data as { workspaceId: string }).workspaceId,
          userId: (data as { userId: string }).userId,
          currentVersionId: null,
          title: (data as { title?: string | null }).title ?? null,
          prompt: (data as { prompt?: string | null }).prompt ?? null,
          metadata: (data as { metadata?: unknown }).metadata ?? {},
          createdAt: new Date("2026-06-23T09:01:00.000Z"),
          updatedAt: new Date("2026-06-23T09:01:00.000Z"),
          versions: []
        };
        assets.push(row);
        const workspace = workspaces.find((item) => item.id === row.workspaceId);
        if (workspace && !workspace.assets.some((item) => item.id === row.id)) {
          workspace.assets.push(row);
        }
        return Promise.resolve(row);
      }),
      update: jest.fn(({ where, data }: Record<string, unknown>) => {
        const typedWhere = where as { id: string };
        const asset = assets.find((row) => row.id === typedWhere.id);
        if (!asset) throw new Error("Missing asset");
        Object.assign(asset, data);
        return Promise.resolve(includeVersions(asset));
      }),
      delete: jest.fn(({ where }: Record<string, unknown>) => {
        const typedWhere = where as { id: string };
        const index = assets.findIndex((row) => row.id === typedWhere.id);
        const [deleted] = assets.splice(index, 1);
        return Promise.resolve(deleted);
      })
    },
    imageVersion: {
      findFirst: jest.fn(({ where }: Record<string, unknown>) => {
        const typedWhere = where as {
          id?: string;
          storageKey?: string;
          assetId?: string;
          asset?: {
            userId?: string;
            workspaceId?: string;
          };
        };
        const versions = assets.flatMap((asset) =>
          asset.versions.map((version) => ({ asset, version }))
        );
        const found =
          versions.find(({ asset, version }) => {
            if (typedWhere.id && version.id !== typedWhere.id) return false;
            if (typedWhere.storageKey && version.storageKey !== typedWhere.storageKey) {
              return false;
            }
            if (typedWhere.assetId && version.assetId !== typedWhere.assetId) return false;
            if (typedWhere.asset?.userId && asset.userId !== typedWhere.asset.userId) {
              return false;
            }
            if (
              typedWhere.asset?.workspaceId &&
              asset.workspaceId !== typedWhere.asset.workspaceId
            ) {
              return false;
            }
            return true;
          }) ?? null;
        return Promise.resolve(found?.version ?? null);
      }),
      create: jest.fn(({ data }: Record<string, unknown>) => {
        const typedData = data as {
          assetId: string;
          storageKey: string;
          mimeType: "image/png" | "image/jpeg" | "image/webp";
          width: number;
          height: number;
          sizeBytes: number;
          metadata?: unknown;
        };
        const asset = assets.find((row) => row.id === typedData.assetId);
        if (!asset) throw new Error("Missing asset for version");
        const version = {
          id: `mask-version-${asset.versions.length + 1}`,
          assetId: typedData.assetId,
          parentId: null,
          storageKey: typedData.storageKey,
          mimeType: typedData.mimeType,
          width: typedData.width,
          height: typedData.height,
          sizeBytes: typedData.sizeBytes,
          prompt: null,
          editPrompt: null,
          maskKey: null,
          provider: "mira",
          providerJob: null,
          metadata: typedData.metadata ?? {},
          createdAt: new Date("2026-06-23T09:01:00.000Z")
        };
        asset.versions.push(version);
        return Promise.resolve(version);
      })
    },
    imageTask: {
      findMany: jest.fn(({ where, orderBy, skip, select }: Record<string, unknown>) => {
        const typedWhere = where as { workspaceId?: string };
        const typedOrderBy = orderBy as { createdAt?: "desc" | "asc" } | undefined;
        const rows = workspaces
          .flatMap((workspace) => workspace.tasks)
          .filter((task) => {
            if (typedWhere.workspaceId && task.workspaceId !== typedWhere.workspaceId) {
              return false;
            }
            return true;
          })
          .sort((left, right) => {
            if (typedOrderBy?.createdAt === "asc") {
              return left.createdAt.getTime() - right.createdAt.getTime();
            }
            return right.createdAt.getTime() - left.createdAt.getTime();
          })
          .slice(typeof skip === "number" ? skip : 0);
        const typedSelect = select as { id?: boolean } | undefined;
        if (typedSelect?.id) {
          return Promise.resolve(rows.map((task) => ({ id: task.id })));
        }
        return Promise.resolve(rows);
      }),
      deleteMany: jest.fn(({ where }: Record<string, unknown>) => {
        const typedWhere = where as {
          id?: string | { in?: string[] };
          workspaceId?: string;
          userId?: string;
        };
        const ids =
          typeof typedWhere.id === "string"
            ? [typedWhere.id]
            : typedWhere.id?.in ?? null;
        let count = 0;
        for (const workspace of workspaces) {
          const remainingTasks = workspace.tasks.filter((task) => {
            if (ids && !ids.includes(task.id)) return true;
            if (typedWhere.workspaceId && task.workspaceId !== typedWhere.workspaceId) {
              return true;
            }
            if (typedWhere.userId && task.userId !== typedWhere.userId) return true;
            count += 1;
            return false;
          });
          workspace.tasks = remainingTasks;
        }
        return Promise.resolve({ count });
      }),
      create: jest.fn(({ data }: Record<string, unknown>) => {
        taskCount += 1;
        const task: ImageTaskRow = {
          id: `task-${taskCount}`,
          workspaceId: (data as { workspaceId: string }).workspaceId,
          userId: (data as { userId: string }).userId,
          type: (data as { type: ImageTaskRow["type"] }).type,
          status: "queued",
          input: (data as { input: unknown }).input,
          output: null,
          error: null,
          cost: null,
          createdAt: new Date(Date.UTC(2026, 5, 23, 9, taskCount, 0, 0)),
          startedAt: null,
          finishedAt: null
        };
        const workspace = workspaces.find((row) => row.id === task.workspaceId);
        workspace?.tasks.push(task);
        return Promise.resolve(task);
      })
    },
    canvasObject: {
      create: jest.fn(({ data }: Record<string, unknown>) => {
        const typedData = data as {
          workspaceId: string;
          assetId: string;
          type: string;
          x: number;
          y: number;
          width: number;
          height: number;
          rotation?: number;
          zIndex?: number;
          props?: unknown;
        };
        const workspace = workspaces.find((row) => row.id === typedData.workspaceId);
        if (!workspace) throw new Error("Missing workspace for canvas object");
        const object = {
          id: `object-${workspace.objects.length + 1}`,
          workspaceId: typedData.workspaceId,
          assetId: typedData.assetId,
          type: typedData.type,
          x: typedData.x,
          y: typedData.y,
          width: typedData.width,
          height: typedData.height,
          rotation: typedData.rotation ?? 0,
          zIndex: typedData.zIndex ?? 0,
          props: typedData.props ?? {},
          createdAt: new Date("2026-06-23T09:01:00.000Z"),
          updatedAt: new Date("2026-06-23T09:01:00.000Z")
        };
        workspace.objects.push(object);
        return Promise.resolve(object);
      }),
      updateMany: jest.fn(() => Promise.resolve({ count: 2 }))
    },
    $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(prisma)
    )
  };
  return prisma as unknown as PrismaService;
}

function includeVersions(asset: AssetRow) {
  return {
    ...asset,
    versions: [...asset.versions]
  };
}

function includeWorkspace(workspace: WorkspaceRow) {
  return {
    ...workspace,
    objects: [...workspace.objects],
    assets: workspace.assets.map(includeVersions),
    tasks: [...workspace.tasks]
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
      .slice(0, 20)
  };
}

function createTaskHistory(
  count: number,
  workspaceId: string,
  userId: string
): ImageTaskRow[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `task-old-${index + 1}`,
    workspaceId,
    userId,
    type: "generate",
    status: "complete",
    input: { prompt: "older task" },
    output: null,
    error: null,
    cost: null,
    createdAt: new Date(Date.UTC(2026, 5, 23, 8, index, 0, 0)),
    startedAt: null,
    finishedAt: new Date(Date.UTC(2026, 5, 23, 8, index, 30, 0))
  }));
}

function createQueue() {
  return {
    enqueue: jest.fn(() => Promise.resolve())
  } as unknown as jest.Mocked<ImageQueueService>;
}

function createStorage() {
  return {
    putImage: jest.fn(() =>
      Promise.resolve({
        storageKey: "local/user/workspace/masks/mask.png",
        mimeType: "image/png",
        width: 0,
        height: 0,
        sizeBytes: 4
      })
    ),
    createSignedPreviewUrl: jest.fn(() =>
      Promise.resolve("https://mira.example/api/image-assets/preview?token=signed")
    ),
    deleteImage: jest.fn(() => Promise.resolve())
  } as unknown as jest.Mocked<ImageStorageService>;
}

function createUsage() {
  return {
    assertCanCreateTask: jest.fn(() => Promise.resolve())
  } as unknown as jest.Mocked<ImageUsageService>;
}

describe("ImageAssetsService", () => {
  it("uploads a local source image into an owned workspace without exposing storage keys", async () => {
    const storage = createStorage();
    storage.putImage.mockResolvedValueOnce({
      storageKey: "local/user/workspace/source/source.png",
      mimeType: "image/png",
      width: 640,
      height: 480,
      sizeBytes: 5
    });
    const assets: AssetRow[] = [];
    const workspace = createWorkspace("workspace-1", "user-1", assets);
    const prisma = createPrisma(assets, [workspace]);
    const service = new ImageAssetsService(prisma, createQueue(), storage) as ImageAssetsService & {
      uploadSourceAsset: (
        userId: string,
        workspaceId: string,
        request: { dataUrl?: unknown; title?: unknown }
      ) => Promise<unknown>;
    };

    const result = await service.uploadSourceAsset("user-1", "workspace-1", {
      dataUrl: "data:image/png;base64,aGVsbG8=",
      title: " 本地参考图.png "
    });

    expect(storage.putImage).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "workspace-1",
      taskId: "source-upload-workspace-1",
      filename: "source-upload.png",
      bytes: Buffer.from("hello"),
      mimeType: "image/png"
    });
    expect(prisma.imageAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace-1",
        userId: "user-1",
        title: "本地参考图.png",
        prompt: null,
        metadata: {
          kind: "source_upload",
          originalName: "本地参考图.png"
        }
      })
    });
    expect(prisma.imageVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storageKey: "local/user/workspace/source/source.png",
        mimeType: "image/png",
        width: 640,
        height: 480,
        sizeBytes: 5,
        provider: "mira",
        metadata: {
          kind: "source_upload",
          originalName: "本地参考图.png"
        }
      })
    });
    expect(prisma.canvasObject.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace-1",
        assetId: expect.any(String),
        type: "image",
        x: 160,
        y: 160,
        width: 640,
        height: 480,
        rotation: 0,
        props: expect.objectContaining({
          source: "upload",
          versionId: expect.any(String)
        })
      })
    });
    expect(JSON.stringify(result)).not.toContain("storageKey");
    expect(JSON.stringify(result)).not.toContain("maskKey");
    expect(result).toEqual({
      workspace: expect.objectContaining({
        id: "workspace-1",
        assets: [
          expect.objectContaining({
            title: "本地参考图.png",
            metadata: {
              kind: "source_upload",
              originalName: "本地参考图.png"
            },
            versions: [
              expect.objectContaining({
                mimeType: "image/png",
                width: 640,
                height: 480,
                provider: "mira"
              })
            ]
          })
        ],
        objects: [
          expect.objectContaining({
            assetId: expect.any(String),
            type: "image",
            width: 640,
            height: 480
          })
        ]
      })
    });
  });

  it("rejects source uploads for workspaces outside the current user", async () => {
    const service = new ImageAssetsService(
      createPrisma([], [createWorkspace("workspace-1", "user-2")]),
      createQueue(),
      createStorage()
    ) as ImageAssetsService & {
      uploadSourceAsset: (
        userId: string,
        workspaceId: string,
        request: { dataUrl?: unknown; title?: unknown }
      ) => Promise<unknown>;
    };

    await expect(
      service.uploadSourceAsset("user-1", "workspace-1", {
        dataUrl: "data:image/png;base64,aGVsbG8="
      })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects source uploads that are not image data URLs", async () => {
    const service = new ImageAssetsService(
      createPrisma([], [createWorkspace("workspace-1", "user-1")]),
      createQueue(),
      createStorage()
    ) as ImageAssetsService & {
      uploadSourceAsset: (
        userId: string,
        workspaceId: string,
        request: { dataUrl?: unknown; title?: unknown }
      ) => Promise<unknown>;
    };

    await expect(
      service.uploadSourceAsset("user-1", "workspace-1", {
        dataUrl: "data:text/plain;base64,aGVsbG8="
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.uploadSourceAsset("user-1", "workspace-1", {
        dataUrl: "data:image/png;base64,"
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects edit requests for assets owned by another user", async () => {
    const service = new ImageAssetsService(
      createPrisma([createAsset("asset-1", "user-2", "workspace-1")]),
      createQueue(),
      createStorage()
    );

    await expect(
      service.createEditTask("user-1", "asset-1", { prompt: "make it brighter" })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("requires an edit prompt and an existing current source version", async () => {
    const service = new ImageAssetsService(
      createPrisma([createAsset("asset-1", "user-1", "workspace-1", [])]),
      createQueue(),
      createStorage()
    );

    await expect(
      service.createEditTask("user-1", "asset-1", { prompt: "   " })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createEditTask("user-1", "asset-1", { prompt: "make it brighter" })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("ignores raw mask storage keys from public edit requests", async () => {
    const asset = createAsset("asset-1", "user-1", "workspace-1");
    const otherMaskAsset = createAsset("asset-2", "user-1", "workspace-2", [
      createVersion("mask-version", "asset-2", "local/user/workspace-2/mask.png")
    ]);
    const usage = createUsage();
    const service = new ImageAssetsService(
      createPrisma([asset, otherMaskAsset]),
      createQueue(),
      createStorage(),
      usage
    );

    await expect(
      service.createEditTask("user-1", "asset-1", {
        prompt: "make it brighter",
        maskKey: "local/user/workspace-2/mask.png"
      })
    ).resolves.toEqual({
      task: expect.objectContaining({
        input: {
          prompt: "make it brighter",
          assetId: "asset-1",
          versionId: "version-1"
        }
      })
    });
    expect(usage.assertCanCreateTask).toHaveBeenCalledWith("user-1", {
      workspaceId: "workspace-1",
      request: {
        type: "edit",
        prompt: "make it brighter",
        assetId: "asset-1",
        versionId: "version-1"
      }
    });
  });

  it("stores uploaded mask images in the current asset workspace without exposing storage keys", async () => {
    const storage = createStorage();
    const prisma = createPrisma([createAsset("asset-1", "user-1", "workspace-1")]);
    const service = new ImageAssetsService(
      prisma,
      createQueue(),
      storage
    );

    await expect(
      service.uploadMask("user-1", "asset-1", {
        dataUrl: "data:image/png;base64,bWFzaw=="
      })
    ).resolves.toEqual({
      maskId: "mask-version-1",
      sizeBytes: 4
    });

    expect(storage.putImage).toHaveBeenCalledWith({
      userId: "user-1",
      workspaceId: "workspace-1",
      taskId: "mask-asset-1",
      filename: "asset-1-mask.png",
      bytes: Buffer.from("mask"),
      mimeType: "image/png"
    });
    expect(prisma.imageAsset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace-1",
        userId: "user-1",
        title: "Mask upload",
        metadata: {
          kind: "mask",
          sourceAssetId: "asset-1"
        }
      })
    });
    expect(prisma.imageVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        storageKey: "local/user/workspace/masks/mask.png",
        mimeType: "image/png",
        width: 1024,
        height: 1024,
        sizeBytes: 4,
        provider: "mira",
        metadata: {
          kind: "mask",
          sourceAssetId: "asset-1"
        }
      })
    });
  });

  it("creates edit tasks from opaque uploaded mask ids", async () => {
    const queue = createQueue();
    const usage = createUsage();
    const asset = createAsset("asset-1", "user-1", "workspace-1");
    const maskAsset = createAsset("mask-asset", "user-1", "workspace-1", [
      {
        ...createVersion(
          "mask-version",
          "mask-asset",
          "local/user/workspace/masks/mask.png"
        ),
        metadata: {
          kind: "mask",
          sourceAssetId: "asset-1"
        }
      }
    ]);
    const prisma = createPrisma([asset, maskAsset]);
    const service = new ImageAssetsService(
      prisma,
      queue,
      createStorage(),
      usage
    );

    await expect(
      service.createEditTask("user-1", "asset-1", {
        prompt: "make it brighter",
        maskId: "mask-version"
      })
    ).resolves.toEqual({
      task: expect.objectContaining({
        input: {
          prompt: "make it brighter",
          assetId: "asset-1",
          versionId: "version-1"
        }
      })
    });

    expect(usage.assertCanCreateTask).toHaveBeenCalledWith("user-1", {
      workspaceId: "workspace-1",
      request: {
        type: "edit",
        prompt: "make it brighter",
        assetId: "asset-1",
        versionId: "version-1",
        maskKey: "local/user/workspace/masks/mask.png"
      }
    });
    expect(prisma.imageTask.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace-1",
        userId: "user-1",
        type: "edit",
        input: {
          prompt: "make it brighter",
          assetId: "asset-1",
          versionId: "version-1",
          maskKey: "local/user/workspace/masks/mask.png"
        }
      }
    });
  });

  it("rejects mask uploads that are not image data URLs", async () => {
    const service = new ImageAssetsService(
      createPrisma([createAsset("asset-1", "user-1", "workspace-1")]),
      createQueue(),
      createStorage()
    );

    await expect(
      service.uploadMask("user-1", "asset-1", {
        dataUrl: "data:text/plain;base64,bWFzaw=="
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects oversized mask uploads before writing storage", async () => {
    const storage = createStorage();
    const service = new ImageAssetsService(
      createPrisma([createAsset("asset-1", "user-1", "workspace-1")]),
      createQueue(),
      storage
    );
    const oversizedMask = Buffer.alloc(20 * 1024 * 1024 + 1, 1).toString(
      "base64"
    );

    await expect(
      service.uploadMask("user-1", "asset-1", {
        dataUrl: `data:image/png;base64,${oversizedMask}`
      })
    ).rejects.toThrow("蒙版文件超过大小限制，请压缩后重试");
    expect(storage.putImage).not.toHaveBeenCalled();
  });

  it("enqueues edit tasks without processing them inline when a queue is present", async () => {
    const queue = createQueue();
    const usage = createUsage();
    const service = new ImageAssetsService(
      createPrisma([createAsset("asset-1", "user-1", "workspace-1")]),
      queue,
      createStorage(),
      usage
    );

    await expect(
      service.createEditTask(
        "user-1",
        "asset-1",
        { prompt: "make it brighter" },
        "203.0.113.21"
      )
    ).resolves.toEqual({
      task: expect.objectContaining({
        id: "task-1",
        type: "edit",
        status: "queued",
        input: {
          prompt: "make it brighter",
          assetId: "asset-1",
          versionId: "version-1"
        }
      })
    });
    expect(usage.assertCanCreateTask).toHaveBeenCalledWith("user-1", {
      workspaceId: "workspace-1",
      requestIp: "203.0.113.21",
      request: {
        type: "edit",
        prompt: "make it brighter",
        assetId: "asset-1",
        versionId: "version-1"
      }
    });
    expect(queue.enqueue).toHaveBeenCalledWith({
      taskId: "task-1",
      workspaceId: "workspace-1",
      userId: "user-1",
      type: "edit"
    });
  });

  it("enqueues variation tasks without processing them inline when a queue is present", async () => {
    const queue = createQueue();
    const usage = createUsage();
    const service = new ImageAssetsService(
      createPrisma([createAsset("asset-1", "user-1", "workspace-1")]),
      queue,
      createStorage(),
      usage
    );

    await expect(
      service.createVariationTask("user-1", "asset-1", "203.0.113.22")
    ).resolves.toEqual({
      task: expect.objectContaining({
        id: "task-1",
        type: "variation",
        status: "queued",
        input: {
          prompt: "source prompt",
          assetId: "asset-1",
          versionId: "version-1"
        }
      })
    });
    expect(usage.assertCanCreateTask).toHaveBeenCalledWith("user-1", {
      workspaceId: "workspace-1",
      requestIp: "203.0.113.22",
      request: {
        type: "variation",
        prompt: "source prompt",
        assetId: "asset-1",
        versionId: "version-1"
      }
    });
    expect(queue.enqueue).toHaveBeenCalledWith({
      taskId: "task-1",
      workspaceId: "workspace-1",
      userId: "user-1",
      type: "variation"
    });
  });

  it("keeps only the latest 20 workspace tasks when creating asset tasks", async () => {
    const queue = createQueue();
    const usage = createUsage();
    const asset = createAsset("asset-1", "user-1", "workspace-1");
    const workspace = createWorkspace("workspace-1", "user-1", [asset]);
    workspace.tasks = createTaskHistory(20, "workspace-1", "user-1");
    const prisma = createPrisma([asset], [workspace]);
    const service = new ImageAssetsService(
      prisma,
      queue,
      createStorage(),
      usage
    );

    await service.createVariationTask("user-1", "asset-1", "203.0.113.22");

    const workspaceTasks = await prisma.imageTask.findMany({
      where: { workspaceId: "workspace-1" },
      orderBy: { createdAt: "desc" }
    });
    expect(workspaceTasks).toHaveLength(20);
    expect(workspaceTasks.map((task) => task.id)).not.toContain("task-old-1");
    expect(prisma.imageTask.deleteMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ["task-old-1"]
        }
      }
    });
  });

  it("enqueues upscale tasks from the current asset version", async () => {
    const queue = createQueue();
    const usage = createUsage();
    const service = new ImageAssetsService(
      createPrisma([createAsset("asset-1", "user-1", "workspace-1")]),
      queue,
      createStorage(),
      usage
    );

    await expect(
      service.createUpscaleTask("user-1", "asset-1", "203.0.113.23")
    ).resolves.toEqual({
      task: expect.objectContaining({
        id: "task-1",
        type: "upscale",
        status: "queued",
        input: {
          prompt: "提升图片清晰度和细节，保持原始构图",
          assetId: "asset-1",
          versionId: "version-1",
          size: "1024x1024"
        }
      })
    });
    expect(usage.assertCanCreateTask).toHaveBeenCalledWith("user-1", {
      workspaceId: "workspace-1",
      requestIp: "203.0.113.23",
      request: {
        type: "upscale",
        prompt: "提升图片清晰度和细节，保持原始构图",
        assetId: "asset-1",
        versionId: "version-1",
        size: "1024x1024"
      }
    });
    expect(queue.enqueue).toHaveBeenCalledWith({
      taskId: "task-1",
      workspaceId: "workspace-1",
      userId: "user-1",
      type: "upscale"
    });
  });

  it("enqueues background removal tasks from the current asset version", async () => {
    const queue = createQueue();
    const usage = createUsage();
    const service = new ImageAssetsService(
      createPrisma([createAsset("asset-1", "user-1", "workspace-1")]),
      queue,
      createStorage(),
      usage
    );

    await expect(
      service.createBackgroundRemovalTask("user-1", "asset-1", "203.0.113.24")
    ).resolves.toEqual({
      task: expect.objectContaining({
        id: "task-1",
        type: "background_removal",
        status: "queued",
        input: {
          prompt: "移除背景并保留主体，输出透明背景图片",
          assetId: "asset-1",
          versionId: "version-1",
          size: "auto"
        }
      })
    });
    expect(usage.assertCanCreateTask).toHaveBeenCalledWith("user-1", {
      workspaceId: "workspace-1",
      requestIp: "203.0.113.24",
      request: {
        type: "background_removal",
        prompt: "移除背景并保留主体，输出透明背景图片",
        assetId: "asset-1",
        versionId: "version-1",
        size: "auto"
      }
    });
    expect(queue.enqueue).toHaveBeenCalledWith({
      taskId: "task-1",
      workspaceId: "workspace-1",
      userId: "user-1",
      type: "background_removal"
    });
  });

  it("creates expand tasks from the requested image version", async () => {
    const queue = createQueue();
    const usage = createUsage();
    const versions = [
      createVersion("version-current", "asset-1"),
      createVersion("version-source", "asset-1")
    ];
    const prisma = createPrisma([
      createAsset("asset-1", "user-1", "workspace-1", versions)
    ]);
    const service = new ImageAssetsService(
      prisma,
      queue,
      createStorage(),
      usage
    );

    await expect(
      service.createExpandTask(
        "user-1",
        "asset-1",
        {
          versionId: "version-source",
          mode: "direction",
          direction: "right",
          percent: 0.25,
          padding: { left: 0, right: 256, top: 0, bottom: 0 },
          target: { width: 1280, height: 1024 }
        },
        "203.0.113.25"
      )
    ).resolves.toEqual({
      task: expect.objectContaining({
        id: "task-1",
        type: "expand",
        status: "queued",
        input: {
          type: "expand",
          prompt: "自然扩展图片画面，保持原图主体、风格和光照一致",
          assetId: "asset-1",
          versionId: "version-source",
          mode: "direction",
          direction: "right",
          percent: 0.25,
          padding: { left: 0, right: 256, top: 0, bottom: 0 },
          expandTarget: { width: 1280, height: 1024 }
        }
      })
    });
    expect(usage.assertCanCreateTask).toHaveBeenCalledWith("user-1", {
      workspaceId: "workspace-1",
      requestIp: "203.0.113.25",
      request: {
        type: "expand",
        prompt: "自然扩展图片画面，保持原图主体、风格和光照一致",
        assetId: "asset-1",
        versionId: "version-source",
        mode: "direction",
        direction: "right",
        percent: 0.25,
        padding: { left: 0, right: 256, top: 0, bottom: 0 },
        expandTarget: { width: 1280, height: 1024 }
      }
    });
    expect(prisma.imageTask.create).toHaveBeenCalledWith({
      data: {
        workspaceId: "workspace-1",
        userId: "user-1",
        type: "expand",
        input: {
          type: "expand",
          prompt: "自然扩展图片画面，保持原图主体、风格和光照一致",
          assetId: "asset-1",
          versionId: "version-source",
          mode: "direction",
          direction: "right",
          percent: 0.25,
          padding: { left: 0, right: 256, top: 0, bottom: 0 },
          expandTarget: { width: 1280, height: 1024 }
        }
      }
    });
    expect(queue.enqueue).toHaveBeenCalledWith({
      taskId: "task-1",
      workspaceId: "workspace-1",
      userId: "user-1",
      type: "expand"
    });
  });

  it("rejects direction expand tasks when padding does not match the requested direction", async () => {
    const queue = createQueue();
    const prisma = createPrisma([createAsset("asset-1", "user-1", "workspace-1")]);
    const service = new ImageAssetsService(
      prisma,
      queue,
      createStorage(),
      createUsage()
    );

    await expect(
      service.createExpandTask("user-1", "asset-1", {
        mode: "direction",
        direction: "right",
        percent: 0.25,
        padding: { left: 256, right: 0, top: 0, bottom: 0 },
        target: { width: 1280, height: 1024 }
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.imageTask.create).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("rejects ratio expand tasks when target dimensions do not match the requested aspect ratio", async () => {
    const queue = createQueue();
    const prisma = createPrisma([createAsset("asset-1", "user-1", "workspace-1")]);
    const service = new ImageAssetsService(
      prisma,
      queue,
      createStorage(),
      createUsage()
    );

    await expect(
      service.createExpandTask("user-1", "asset-1", {
        mode: "ratio",
        aspectRatio: "16:9",
        padding: { left: 128, right: 128, top: 128, bottom: 128 },
        target: { width: 1280, height: 1280 }
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.imageTask.create).not.toHaveBeenCalled();
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("rejects expand tasks when target dimensions do not match source plus padding", async () => {
    const service = new ImageAssetsService(
      createPrisma([createAsset("asset-1", "user-1", "workspace-1")]),
      createQueue(),
      createStorage(),
      createUsage()
    );

    await expect(
      service.createExpandTask("user-1", "asset-1", {
        mode: "free",
        padding: { left: 0, right: 256, top: 0, bottom: 0 },
        target: { width: 1200, height: 1024 }
      })
    ).rejects.toThrow("扩展尺寸与源图尺寸不匹配");
  });

  it("requires valid direction and percent for direction expand tasks", async () => {
    const service = new ImageAssetsService(
      createPrisma([createAsset("asset-1", "user-1", "workspace-1")]),
      createQueue(),
      createStorage(),
      createUsage()
    );

    await expect(
      service.createExpandTask("user-1", "asset-1", {
        mode: "direction",
        padding: { left: 0, right: 256, top: 0, bottom: 0 },
        target: { width: 1280, height: 1024 }
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createExpandTask("user-1", "asset-1", {
        mode: "direction",
        direction: "right",
        percent: 1.5,
        padding: { left: 0, right: 256, top: 0, bottom: 0 },
        target: { width: 1280, height: 1024 }
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("reverts only the asset current version", async () => {
    const versions = [
      createVersion("version-1", "asset-1"),
      createVersion("version-2", "asset-1")
    ];
    const prisma = createPrisma([createAsset("asset-1", "user-1", "workspace-1", versions)]);
    const service = new ImageAssetsService(prisma, createQueue(), createStorage());

    await expect(
      service.revert("user-1", "asset-1", { versionId: "version-2" })
    ).resolves.toEqual({
      asset: expect.objectContaining({
        id: "asset-1",
        currentVersionId: "version-2"
      })
    });
    expect(prisma.imageAsset.update).toHaveBeenCalledWith({
      where: { id: "asset-1" },
      data: { currentVersionId: "version-2" },
      include: expect.any(Object)
    });
  });

  it("does not expose raw image version internals when returning updated assets", async () => {
    const versions = [
      createVersion("version-1", "asset-1", "local/user/workspace/task/version-1.png"),
      {
        ...createVersion("version-2", "asset-1", "local/user/workspace/task/version-2.png"),
        maskKey: "local/user/workspace/mask.png",
        providerJob: "job-2"
      }
    ];
    const service = new ImageAssetsService(
      createPrisma([createAsset("asset-1", "user-1", "workspace-1", versions)]),
      createQueue(),
      createStorage()
    );

    const result = await service.revert("user-1", "asset-1", {
      versionId: "version-2"
    });

    const body = JSON.stringify(result);
    expect(body).not.toContain("storageKey");
    expect(body).not.toContain("maskKey");
    expect(body).not.toContain("providerJob");
    expect(body).not.toContain("local/user/workspace");
    expect(body).not.toContain("job-2");
  });

  it("returns a signed download URL for the current image version", async () => {
    const storage = createStorage();
    const service = new ImageAssetsService(
      createPrisma([createAsset("asset-1", "user-1", "workspace-1")]),
      createQueue(),
      storage
    );

    await expect(service.download("user-1", "asset-1")).resolves.toEqual({
      url: "https://mira.example/api/image-assets/preview?token=signed"
    });
    expect(storage.createSignedPreviewUrl).toHaveBeenCalledWith({
      storageKey: "local/user/workspace/task/version-1.png",
      mimeType: "image/png",
      width: 1024,
      height: 1024,
      sizeBytes: 128
    });
  });

  it("returns a signed download URL for an owned historical image version", async () => {
    const storage = createStorage();
    const versions = [
      createVersion("version-1", "asset-1", "local/user/workspace/task/version-1.png"),
      createVersion("version-2", "asset-1", "local/user/workspace/task/version-2.png")
    ];
    const service = new ImageAssetsService(
      createPrisma([createAsset("asset-1", "user-1", "workspace-1", versions)]),
      createQueue(),
      storage
    ) as ImageAssetsService & {
      downloadVersion: (
        userId: string,
        assetId: string,
        versionId: string
      ) => Promise<{ url: string }>;
    };

    await expect(
      service.downloadVersion("user-1", "asset-1", "version-2")
    ).resolves.toEqual({
      url: "https://mira.example/api/image-assets/preview?token=signed"
    });
    expect(storage.createSignedPreviewUrl).toHaveBeenCalledWith({
      storageKey: "local/user/workspace/task/version-2.png",
      mimeType: "image/png",
      width: 1024,
      height: 1024,
      sizeBytes: 128
    });
  });

  it("does not allow asset operations after the workspace is soft deleted", async () => {
    const asset = createAsset("asset-1", "user-1", "workspace-1");
    const workspace = createWorkspace("workspace-1", "user-1", [asset], {
      deletedAt: new Date("2026-06-23T09:00:00.000Z")
    });
    const service = new ImageAssetsService(
      createPrisma([asset], [workspace]),
      createQueue(),
      createStorage()
    );

    await expect(service.download("user-1", "asset-1")).rejects.toBeInstanceOf(
      NotFoundException
    );
    await expect(
      service.createEditTask("user-1", "asset-1", {
        prompt: "make it brighter"
      })
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove("user-1", "asset-1")).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it("detaches canvas objects before deleting an owned asset", async () => {
    const prisma = createPrisma([createAsset("asset-1", "user-1", "workspace-1")]);
    const service = new ImageAssetsService(prisma, createQueue(), createStorage());

    await expect(service.remove("user-1", "asset-1")).resolves.toEqual({ ok: true });
    expect(prisma.canvasObject.updateMany).toHaveBeenCalledWith({
      where: {
        assetId: "asset-1"
      },
      data: {
        assetId: null
      }
    });
    expect(prisma.imageAsset.delete).toHaveBeenCalledWith({
      where: { id: "asset-1" }
    });
  });

  it("deletes stored image files for every asset version", async () => {
    const versions = [
      createVersion("version-1", "asset-1", "local/user/workspace/task/version-1.png"),
      createVersion("version-2", "asset-1", "local/user/workspace/task/version-2.png")
    ];
    const storage = createStorage();
    const service = new ImageAssetsService(
      createPrisma([createAsset("asset-1", "user-1", "workspace-1", versions)]),
      createQueue(),
      storage
    );

    await expect(service.remove("user-1", "asset-1")).resolves.toEqual({ ok: true });
    expect(storage.deleteImage).toHaveBeenCalledTimes(2);
    expect(storage.deleteImage).toHaveBeenCalledWith({
      storageKey: "local/user/workspace/task/version-1.png",
      mimeType: "image/png",
      width: 1024,
      height: 1024,
      sizeBytes: 128
    });
    expect(storage.deleteImage).toHaveBeenCalledWith({
      storageKey: "local/user/workspace/task/version-2.png",
      mimeType: "image/png",
      width: 1024,
      height: 1024,
      sizeBytes: 128
    });
  });
});
