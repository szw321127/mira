import { jest } from "@jest/globals";
import type { PrismaService } from "../database/prisma.service.js";
import type { ImageProviderAdapter } from "./image-provider.types.js";
import type { ImageStorageService } from "./image-storage.types.js";
import { ImageWorkerService } from "./image-worker.service.js";
import type { ImageQueueService } from "./image-queue.service.js";

describe("ImageWorkerService", () => {
  it("runs a generate task and creates asset, version, canvas object, and safe events", async () => {
    const prisma = createPrisma();
    const queue = createQueue();
    const provider = createProvider();
    const storage = createStorage();
    const worker = new ImageWorkerService(prisma, queue, provider, storage);

    await worker.processTask("task-1");

    expect(prisma.imageTask.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "task-1" },
        data: expect.objectContaining({
          status: "running",
          startedAt: expect.any(Date)
        })
      })
    );
    expect(provider.generate).toHaveBeenCalledWith({
      prompt: "a product hero image",
      aspectRatio: "16:9",
      size: "1536x1024",
      quality: "auto",
      background: "auto"
    });
    expect(storage.putImage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        workspaceId: "workspace-1",
        taskId: "task-1",
        mimeType: "image/png",
        bytes: Buffer.from("generated")
      })
    );
    expect(prisma.imageAsset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: "workspace-1",
          userId: "user-1",
          prompt: "a product hero image"
        })
      })
    );
    expect(prisma.imageVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assetId: "asset-1",
          storageKey: "local/user/workspace/task/image.png",
          provider: "openai",
          providerJob: "job-1"
        })
      })
    );
    expect(prisma.canvasObject.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workspaceId: "workspace-1",
          assetId: "asset-1",
          type: "image",
          x: 120,
          y: 160
        })
      })
    );
    expect(queue.emitEvent).toHaveBeenCalledWith("task-1", {
      type: "asset-placeholder",
      taskId: "task-1",
      objectId: "placeholder-task-1",
      x: 120,
      y: 160
    });
    expect(prisma.imageTask.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "task-1" },
        data: expect.objectContaining({
          status: "complete",
          cost: {
            provider: "openai",
            model: "gpt-image-1",
            aspectRatio: "16:9",
            size: "1536x1024",
            quality: "auto",
            estimatedCostUsd: 0.042
          }
        })
      })
    );
    expect(queue.emitEvent).toHaveBeenCalledWith("task-1", {
      type: "asset-created",
      taskId: "task-1",
      assetId: "asset-1",
      versionId: "version-1",
      objectId: "object-1"
    });
    expect(queue.emitEvent).toHaveBeenCalledWith("task-1", {
      type: "canvas-updated",
      workspaceId: "workspace-1",
      objectIds: ["object-1"]
    });
    expect(queue.emitEvent).toHaveBeenCalledWith("task-1", {
      type: "usage",
      taskId: "task-1",
      provider: "openai",
      cost: "0.042"
    });
    expect(JSON.stringify(queue.emitEvent.mock.calls)).not.toMatch(
      /b64_json|tool_result|sk-live-secret/
    );
  });

  it("marks provider failures as failed with a short safe error", async () => {
    const prisma = createPrisma();
    const queue = createQueue();
    const provider = createProvider();
    provider.generate.mockRejectedValueOnce(new Error("raw provider sk-live-secret"));
    const worker = new ImageWorkerService(prisma, queue, provider, createStorage());

    await worker.processTask("task-1");

    expect(prisma.imageTask.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "task-1" },
        data: expect.objectContaining({
          status: "failed",
          error: "图像生成失败，请稍后再试"
        })
      })
    );
    expect(JSON.stringify(queue.emitEvent.mock.calls)).not.toContain(
      "sk-live-secret"
    );
  });

  it("preserves safe provider rejection messages for the task and stream", async () => {
    const prisma = createPrisma();
    const queue = createQueue();
    const provider = createProvider();
    provider.generate.mockRejectedValueOnce(
      new Error("提示词可能包含平台限制内容，请调整后再试")
    );
    const worker = new ImageWorkerService(prisma, queue, provider, createStorage());

    await worker.processTask("task-1");

    expect(prisma.imageTask.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "task-1" },
        data: expect.objectContaining({
          status: "failed",
          error: "提示词可能包含平台限制内容，请调整后再试"
        })
      })
    );
    expect(queue.emitEvent).toHaveBeenCalledWith("task-1", {
      type: "error",
      taskId: "task-1",
      message: "提示词可能包含平台限制内容，请调整后再试"
    });
  });

  it("preserves safe provider availability messages for the task and stream", async () => {
    const prisma = createPrisma();
    const queue = createQueue();
    const provider = createProvider();
    provider.generate.mockRejectedValueOnce(
      new Error("图像模型通道暂不可用，请稍后重试或在后台切换模型")
    );
    const worker = new ImageWorkerService(prisma, queue, provider, createStorage());

    await worker.processTask("task-1");

    expect(prisma.imageTask.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "task-1" },
        data: expect.objectContaining({
          status: "failed",
          error: "图像模型通道暂不可用，请稍后重试或在后台切换模型"
        })
      })
    );
    expect(queue.emitEvent).toHaveBeenCalledWith("task-1", {
      type: "error",
      taskId: "task-1",
      message: "图像模型通道暂不可用，请稍后重试或在后台切换模型"
    });
  });

  it("skips tasks that were canceled before the worker claimed them", async () => {
    const prisma = createPrisma({ status: "canceled" });
    const queue = createQueue();
    const provider = createProvider();
    const storage = createStorage();
    const worker = new ImageWorkerService(prisma, queue, provider, storage);

    await worker.processTask("task-1");

    expect(prisma.imageTask.update).not.toHaveBeenCalled();
    expect(provider.generate).not.toHaveBeenCalled();
    expect(storage.putImage).not.toHaveBeenCalled();
    expect(queue.emitEvent).not.toHaveBeenCalled();
  });

  it("does not persist generated assets when a running task is canceled during provider work", async () => {
    const prisma = createPrisma({ statuses: ["queued", "canceled"] });
    const queue = createQueue();
    const provider = createProvider();
    const storage = createStorage();
    const worker = new ImageWorkerService(prisma, queue, provider, storage);

    await worker.processTask("task-1");

    expect(provider.generate).toHaveBeenCalled();
    expect(storage.putImage).not.toHaveBeenCalled();
    expect(prisma.imageAsset.create).not.toHaveBeenCalled();
    expect(prisma.imageVersion.create).not.toHaveBeenCalled();
    expect(prisma.canvasObject.create).not.toHaveBeenCalled();
    expect(prisma.imageTask.update).not.toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "complete"
        })
      })
    );
  });

  it("treats deleted running tasks as canceled during provider work", async () => {
    const prisma = createPrisma({ statuses: ["queued", null] });
    const queue = createQueue();
    const provider = createProvider();
    const storage = createStorage();
    const worker = new ImageWorkerService(prisma, queue, provider, storage);

    await worker.processTask("task-1");

    expect(provider.generate).toHaveBeenCalled();
    expect(storage.putImage).not.toHaveBeenCalled();
    expect(prisma.imageAsset.create).not.toHaveBeenCalled();
    expect(prisma.imageVersion.create).not.toHaveBeenCalled();
    expect(prisma.canvasObject.create).not.toHaveBeenCalled();
    expect(prisma.imageTask.update).not.toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "complete"
        })
      })
    );
  });

  it("does not create generated assets when a task is canceled after storage writes", async () => {
    const prisma = createPrisma({ statuses: ["queued", "queued", "canceled"] });
    const queue = createQueue();
    const provider = createProvider();
    const storage = createStorage();
    const worker = new ImageWorkerService(prisma, queue, provider, storage);

    await worker.processTask("task-1");

    expect(provider.generate).toHaveBeenCalled();
    expect(storage.putImage).toHaveBeenCalled();
    expect(storage.deleteImage).toHaveBeenCalledWith({
      storageKey: "local/user/workspace/task/image.png",
      mimeType: "image/png",
      width: 1024,
      height: 1024,
      sizeBytes: 9
    });
    expect(prisma.imageAsset.create).not.toHaveBeenCalled();
    expect(prisma.imageVersion.create).not.toHaveBeenCalled();
    expect(prisma.canvasObject.create).not.toHaveBeenCalled();
    expect(prisma.imageTask.update).not.toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "complete"
        })
      })
    );
  });
});

function createPrisma(
  overrides: { status?: string; statuses?: Array<string | null> } = {}
) {
  const task = {
    id: "task-1",
    workspaceId: "workspace-1",
    userId: "user-1",
    type: "generate",
    status: overrides.status ?? "queued",
    input: {
      prompt: "a product hero image",
      aspectRatio: "16:9",
      target: { x: 120, y: 160 }
    },
    output: null,
    error: null,
    cost: null,
    createdAt: new Date("2026-06-23T08:00:00.000Z"),
    startedAt: null,
    finishedAt: null
  };
  let findUniqueCallCount = 0;
  const prisma = {
    imageTask: {
      findUnique: jest.fn(() => {
        const status =
          overrides.statuses && findUniqueCallCount in overrides.statuses
            ? overrides.statuses[findUniqueCallCount]
            : task.status;
        findUniqueCallCount += 1;
        if (status === null) return Promise.resolve(null);
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
    imageAsset: {
      create: jest.fn(() =>
        Promise.resolve({
          id: "asset-1"
        })
      ),
      update: jest.fn(() =>
        Promise.resolve({
          id: "asset-1",
          currentVersionId: "version-1"
        })
      )
    },
    imageVersion: {
      create: jest.fn(() =>
        Promise.resolve({
          id: "version-1"
        })
      )
    },
    canvasObject: {
      create: jest.fn(() =>
        Promise.resolve({
          id: "object-1"
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
    generate: jest.fn(() =>
      Promise.resolve({
        bytes: Buffer.from("generated"),
        mimeType: "image/png",
        width: 1024,
        height: 1024,
        provider: "openai",
        providerJob: "job-1",
        metadata: {
          model: "gpt-image-1",
          aspectRatio: "16:9",
          size: "1536x1024",
          quality: "auto",
          estimatedCostUsd: 0.042,
          revisedPrompt: "safe prompt"
        }
      })
    ),
    edit: jest.fn()
  } as jest.Mocked<ImageProviderAdapter>;
}

function createStorage() {
  return {
    putImage: jest.fn(() =>
      Promise.resolve({
        storageKey: "local/user/workspace/task/image.png",
        mimeType: "image/png",
        width: 1024,
        height: 1024,
        sizeBytes: 9
      })
    ),
    getImage: jest.fn(),
    createSignedPreviewUrl: jest.fn(),
    deleteImage: jest.fn()
  } as jest.Mocked<ImageStorageService>;
}
