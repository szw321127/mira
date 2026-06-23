import { jest } from "@jest/globals";
import type { PrismaService } from "../database/prisma.service.js";
import type { ImageProviderAdapter } from "./image-provider.types.js";
import type { ImageQueueService } from "./image-queue.service.js";
import type { ImageStorageService } from "./image-storage.types.js";
import { ImageWorkerService } from "./image-worker.service.js";

describe("ImageWorkerService edit and variation tasks", () => {
  it("runs an edit task by creating a child version and updating the asset current version", async () => {
    const prisma = createPrisma({
      type: "edit",
      input: {
        prompt: "make the background red",
        assetId: "asset-1",
        versionId: "version-source",
        maskKey: "local/user/workspace/mask.png"
      }
    });
    const queue = createQueue();
    const provider = createProvider();
    const storage = createStorage();
    const worker = new ImageWorkerService(prisma, queue, provider, storage);

    await worker.processTask("task-1");

    expect(provider.edit).toHaveBeenCalledWith({
      prompt: "make the background red",
      image: {
        storageKey: "local/user/workspace/source.png",
        mimeType: "image/png",
        width: 1024,
        height: 1024,
        sizeBytes: 128
      },
      mask: {
        storageKey: "local/user/workspace/mask.png",
        mimeType: "image/png",
        width: 1024,
        height: 1024,
        sizeBytes: 64
      },
      size: "auto"
    });
    expect(storage.putImage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        workspaceId: "workspace-1",
        taskId: "task-1",
        bytes: Buffer.from("edited"),
        mimeType: "image/png"
      })
    );
    expect(prisma.imageVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assetId: "asset-1",
        parentId: "version-source",
        storageKey: "local/user/workspace/task/edited.png",
        prompt: "source prompt",
        editPrompt: "make the background red",
        maskKey: "local/user/workspace/mask.png",
        provider: "openai"
      })
    });
    expect(prisma.imageAsset.update).toHaveBeenCalledWith({
      where: { id: "asset-1" },
      data: { currentVersionId: "version-edited" }
    });
    expect(prisma.imageTask.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "task-1" },
        data: expect.objectContaining({
          status: "complete",
          output: {
            assetId: "asset-1",
            versionId: "version-edited"
          },
          cost: {
            provider: "openai",
            model: "gpt-image-1",
            size: "auto",
            quality: null,
            estimatedCostUsd: null
          }
        })
      })
    );
    expect(queue.emitEvent).toHaveBeenCalledWith("task-1", {
      type: "task-progress",
      taskId: "task-1",
      status: "running",
      message: "正在编辑图片"
    });
    expect(queue.emitEvent).toHaveBeenCalledWith("task-1", {
      type: "asset-version-created",
      taskId: "task-1",
      assetId: "asset-1",
      versionId: "version-edited"
    });
    expect(queue.emitEvent).toHaveBeenCalledWith("task-1", {
      type: "asset-updated",
      taskId: "task-1",
      assetId: "asset-1",
      versionId: "version-edited"
    });
    expect(queue.emitEvent).toHaveBeenCalledWith("task-1", {
      type: "usage",
      taskId: "task-1",
      provider: "openai"
    });
    expect(queue.emitEvent).toHaveBeenCalledWith("task-1", {
      type: "task-progress",
      taskId: "task-1",
      status: "complete",
      message: "图片编辑已完成"
    });
    expect(JSON.stringify(queue.emitEvent.mock.calls)).not.toMatch(
      /b64_json|tool_result|sk-live-secret/
    );
  });

  it("runs a variation task from the source image without mutating the original version", async () => {
    const prisma = createPrisma({
      type: "variation",
      input: {
        prompt: "create a fresh variation",
        assetId: "asset-1",
        versionId: "version-source"
      }
    });
    const provider = createProvider();
    const queue = createQueue();
    const worker = new ImageWorkerService(
      prisma,
      queue,
      provider,
      createStorage()
    );

    await worker.processTask("task-1");

    expect(provider.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "create a fresh variation",
        image: expect.objectContaining({
          storageKey: "local/user/workspace/source.png"
        }),
        size: "auto"
      })
    );
    expect(prisma.imageVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assetId: "asset-1",
        parentId: "version-source",
        editPrompt: "create a fresh variation",
        maskKey: null
      })
    });
    expect(prisma.imageAsset.update).toHaveBeenCalledWith({
      where: { id: "asset-1" },
      data: { currentVersionId: "version-edited" }
    });
    expect(queue.emitEvent).toHaveBeenCalledWith("task-1", {
      type: "task-progress",
      taskId: "task-1",
      status: "running",
      message: "正在生成图片变体"
    });
    expect(queue.emitEvent).toHaveBeenCalledWith("task-1", {
      type: "task-progress",
      taskId: "task-1",
      status: "complete",
      message: "图片变体已生成"
    });
  });

  it("runs upscale tasks through the edit pipeline with upscale-specific progress copy", async () => {
    const prisma = createPrisma({
      type: "upscale",
      input: {
        prompt: "提升图片清晰度和细节，保持原始构图",
        assetId: "asset-1",
        versionId: "version-source",
        size: "1024x1024"
      }
    });
    const provider = createProvider();
    const queue = createQueue();
    const worker = new ImageWorkerService(
      prisma,
      queue,
      provider,
      createStorage()
    );

    await worker.processTask("task-1");

    expect(provider.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "提升图片清晰度和细节，保持原始构图",
        image: expect.objectContaining({
          storageKey: "local/user/workspace/source.png"
        }),
        size: "1024x1024"
      })
    );
    expect(prisma.imageVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assetId: "asset-1",
        parentId: "version-source",
        editPrompt: "提升图片清晰度和细节，保持原始构图"
      })
    });
    expect(queue.emitEvent).toHaveBeenCalledWith("task-1", {
      type: "task-progress",
      taskId: "task-1",
      status: "running",
      message: "正在放大图片"
    });
    expect(queue.emitEvent).toHaveBeenCalledWith("task-1", {
      type: "task-progress",
      taskId: "task-1",
      status: "complete",
      message: "图片已放大"
    });
  });

  it("runs background removal tasks through the edit pipeline with transparent output intent", async () => {
    const prisma = createPrisma({
      type: "background_removal",
      input: {
        prompt: "移除背景并保留主体，输出透明背景图片",
        assetId: "asset-1",
        versionId: "version-source",
        size: "auto"
      }
    });
    const provider = createProvider();
    const queue = createQueue();
    const worker = new ImageWorkerService(
      prisma,
      queue,
      provider,
      createStorage()
    );

    await worker.processTask("task-1");

    expect(provider.edit).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: "移除背景并保留主体，输出透明背景图片",
        image: expect.objectContaining({
          storageKey: "local/user/workspace/source.png"
        }),
        size: "auto"
      })
    );
    expect(prisma.imageVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assetId: "asset-1",
        parentId: "version-source",
        editPrompt: "移除背景并保留主体，输出透明背景图片"
      })
    });
    expect(queue.emitEvent).toHaveBeenCalledWith("task-1", {
      type: "task-progress",
      taskId: "task-1",
      status: "running",
      message: "正在移除背景"
    });
    expect(queue.emitEvent).toHaveBeenCalledWith("task-1", {
      type: "task-progress",
      taskId: "task-1",
      status: "complete",
      message: "背景已移除"
    });
  });

  it("marks edit provider failures with edit-specific safe copy", async () => {
    const prisma = createPrisma({
      type: "edit",
      input: {
        prompt: "make the background red",
        assetId: "asset-1",
        versionId: "version-source"
      }
    });
    const queue = createQueue();
    const provider = createProvider();
    provider.edit.mockRejectedValueOnce(new Error("raw provider sk-live-secret"));
    const worker = new ImageWorkerService(prisma, queue, provider, createStorage());

    await worker.processTask("task-1");

    expect(prisma.imageTask.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "task-1" },
        data: expect.objectContaining({
          status: "failed",
          error: "图片编辑失败，请稍后再试"
        })
      })
    );
    expect(queue.emitEvent).toHaveBeenCalledWith("task-1", {
      type: "error",
      taskId: "task-1",
      message: "图片编辑失败，请稍后再试"
    });
    expect(JSON.stringify(queue.emitEvent.mock.calls)).not.toContain(
      "sk-live-secret"
    );
  });

  it("does not create edited versions when a task is canceled after storage writes", async () => {
    const prisma = createPrisma({
      type: "edit",
      input: {
        prompt: "make the background red",
        assetId: "asset-1",
        versionId: "version-source"
      },
      statuses: ["queued", "queued", "canceled"]
    });
    const queue = createQueue();
    const provider = createProvider();
    const storage = createStorage();
    const worker = new ImageWorkerService(prisma, queue, provider, storage);

    await worker.processTask("task-1");

    expect(provider.edit).toHaveBeenCalled();
    expect(storage.putImage).toHaveBeenCalled();
    expect(storage.deleteImage).toHaveBeenCalledWith({
      storageKey: "local/user/workspace/task/edited.png",
      mimeType: "image/png",
      width: 1024,
      height: 1024,
      sizeBytes: 6
    });
    expect(prisma.imageVersion.create).not.toHaveBeenCalled();
    expect(prisma.imageAsset.update).not.toHaveBeenCalled();
    expect(prisma.imageTask.update).not.toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "complete"
        })
      })
    );
  });
});

type TaskType = "edit" | "variation" | "upscale" | "background_removal";

function createPrisma(taskInput: {
  type: TaskType;
  input: Record<string, unknown>;
  statuses?: string[];
}) {
  const task = {
    id: "task-1",
    workspaceId: "workspace-1",
    userId: "user-1",
    type: taskInput.type,
    status: "queued",
    input: taskInput.input,
    output: null,
    error: null,
    cost: null,
    createdAt: new Date("2026-06-23T08:00:00.000Z"),
    startedAt: null,
    finishedAt: null
  };
  const sourceVersion = {
    id: "version-source",
    assetId: "asset-1",
    parentId: null,
    storageKey: "local/user/workspace/source.png",
    mimeType: "image/png",
    width: 1024,
    height: 1024,
    sizeBytes: 128,
    prompt: "source prompt",
    editPrompt: null,
    maskKey: null,
    provider: "openai",
    providerJob: "job-source",
    metadata: {},
    createdAt: new Date("2026-06-23T08:00:00.000Z")
  };
  const maskVersion = {
    ...sourceVersion,
    id: "version-mask",
    storageKey: "local/user/workspace/mask.png",
    sizeBytes: 64
  };
  let findUniqueCallCount = 0;
  const prisma = {
    imageTask: {
      findUnique: jest.fn(() => {
        const status = taskInput.statuses?.[findUniqueCallCount] ?? task.status;
        findUniqueCallCount += 1;
        return Promise.resolve({
          ...task,
          status
        });
      }),
      update: jest.fn(({ data }) =>
        Promise.resolve({
          ...task,
          ...data
        })
      )
    },
    imageWorkspace: {
      findFirst: jest.fn(() =>
        Promise.resolve({
          id: "workspace-1",
          userId: "user-1",
          deletedAt: null
        })
      )
    },
    imageVersion: {
      findFirst: jest.fn(({ where }) => {
        if (where?.storageKey === "local/user/workspace/mask.png") {
          return Promise.resolve(maskVersion);
        }
        if (where?.id === "version-source") return Promise.resolve(sourceVersion);
        return Promise.resolve(null);
      }),
      create: jest.fn(() =>
        Promise.resolve({
          id: "version-edited"
        })
      )
    },
    imageAsset: {
      update: jest.fn(() =>
        Promise.resolve({
          id: "asset-1",
          currentVersionId: "version-edited"
        })
      )
    },
    $transaction: jest.fn(async (callback) => callback(prisma))
  };
  return prisma as unknown as PrismaService;
}

function createQueue() {
  return {
    emitEvent: jest.fn(() => Promise.resolve())
  } as unknown as jest.Mocked<ImageQueueService>;
}

function createProvider() {
  return {
    generate: jest.fn(),
    edit: jest.fn(() =>
      Promise.resolve({
        bytes: Buffer.from("edited"),
        mimeType: "image/png",
        width: 1024,
        height: 1024,
        provider: "openai",
        providerJob: "job-edit",
        metadata: {
          model: "gpt-image-1",
          size: "auto",
          quality: null,
          estimatedCostUsd: null,
          revisedPrompt: "safe edited prompt"
        }
      })
    )
  } as jest.Mocked<ImageProviderAdapter>;
}

function createStorage() {
  return {
    putImage: jest.fn(() =>
      Promise.resolve({
        storageKey: "local/user/workspace/task/edited.png",
        mimeType: "image/png",
        width: 1024,
        height: 1024,
        sizeBytes: 6
      })
    ),
    getImage: jest.fn(),
    createSignedPreviewUrl: jest.fn(),
    deleteImage: jest.fn()
  } as jest.Mocked<ImageStorageService>;
}
