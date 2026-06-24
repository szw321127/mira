import { jest } from "@jest/globals";
import sharp from "sharp";
import type { PrismaService } from "../database/prisma.service.js";
import type { ImageProviderAdapter } from "./image-provider.types.js";
import type { ImageQueueService } from "./image-queue.service.js";
import type { ImageStorageService } from "./image-storage.types.js";
import { ImageWorkerService } from "./image-worker.service.js";

describe("ImageWorkerService edit and variation tasks", () => {
  it("runs an expand task with expanded inline source and mask images", async () => {
    const prisma = createPrisma({
      type: "expand",
      input: {
        type: "expand",
        prompt: "extend the scene with more sky",
        assetId: "asset-1",
        versionId: "version-source",
        mode: "direction",
        direction: "top",
        percent: 0.25,
        padding: {
          left: 0,
          right: 0,
          top: 256,
          bottom: 0
        },
        expandTarget: {
          width: 1024,
          height: 1280
        }
      }
    });
    const queue = createQueue();
    const provider = createProvider();
    provider.edit.mockResolvedValueOnce(await createProviderImageResult(1024, 1536));
    const storage = createStorage();
    const worker = new ImageWorkerService(prisma, queue, provider, storage);

    await worker.processTask("task-1");

    expect(storage.getImage).toHaveBeenCalledWith({
      storageKey: "local/user/workspace/source.png",
      mimeType: "image/png",
      width: 1024,
      height: 1024,
      sizeBytes: 128
    });
    expect(provider.edit).toHaveBeenCalledWith({
      prompt: expect.stringContaining("extend the scene with more sky"),
      image: expect.objectContaining({
        mimeType: "image/png",
        width: 1024,
        height: 1280,
        bytes: expect.any(Buffer)
      }),
      mask: expect.objectContaining({
        mimeType: "image/png",
        width: 1024,
        height: 1280,
        bytes: expect.any(Buffer)
      }),
      size: "1024x1536"
    });
    expect(prisma.imageVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        assetId: "asset-1",
        parentId: "version-source",
        editPrompt: "extend the scene with more sky",
        metadata: expect.objectContaining({
          operation: "expand",
          mode: "direction",
          direction: "top",
          percent: 0.25,
          padding: {
            left: 0,
            right: 0,
            top: 256,
            bottom: 0
          },
          target: {
            width: 1024,
            height: 1280
          },
          model: "gpt-image-1"
        })
      })
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
          cost: expect.objectContaining({
            provider: "openai",
            model: "gpt-image-1",
            size: "1024x1536"
          })
        })
      })
    );
  });

  it("uses expand-specific progress and failure copy", async () => {
    const prisma = createPrisma({
      type: "expand",
      input: {
        type: "expand",
        prompt: "extend the scene",
        assetId: "asset-1",
        versionId: "version-source",
        mode: "free",
        padding: {
          left: 16,
          right: 16,
          top: 16,
          bottom: 16
        },
        expandTarget: {
          width: 1056,
          height: 1056
        }
      }
    });
    const queue = createQueue();
    const provider = createProvider();
    provider.edit.mockRejectedValueOnce(new Error("raw provider sk-live-secret"));
    const worker = new ImageWorkerService(
      prisma,
      queue,
      provider,
      createStorage()
    );

    await worker.processTask("task-1");

    expect(queue.emitEvent).toHaveBeenCalledWith("task-1", {
      type: "task-progress",
      taskId: "task-1",
      status: "running",
      message: "正在扩展图片"
    });
    expect(prisma.imageTask.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "task-1" },
        data: expect.objectContaining({
          status: "failed",
          error: "图片扩展失败，请稍后再试"
        })
      })
    );
    expect(queue.emitEvent).toHaveBeenCalledWith("task-1", {
      type: "error",
      taskId: "task-1",
      message: "图片扩展失败，请稍后再试"
    });
  });

  it("updates matching canvas image objects to the expanded bounds and new version", async () => {
    const prisma = createPrisma({
      type: "expand",
      input: {
        type: "expand",
        prompt: "extend the scene",
        assetId: "asset-1",
        versionId: "version-source",
        mode: "free",
        padding: {
          left: 120,
          right: 80,
          top: 40,
          bottom: 200
        },
        expandTarget: {
          width: 1224,
          height: 1264
        }
      },
      canvasObject: {
        width: 512,
        height: 512
      }
    });
    const provider = createProvider();
    provider.edit.mockResolvedValueOnce(await createProviderImageResult(1536, 1024));
    const worker = new ImageWorkerService(
      prisma,
      createQueue(),
      provider,
      createStorage()
    );

    await worker.processTask("task-1");

    expect(prisma.canvasObject.findMany).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        assetId: "asset-1",
        type: "image"
      },
      select: {
        id: true,
        x: true,
        y: true,
        width: true,
        height: true,
        props: true
      }
    });
    expect(prisma.canvasObject.update).toHaveBeenCalledWith({
      where: { id: "object-1" },
      data: {
        x: 260,
        y: 300,
        width: 612,
        height: 632,
        props: {
          source: "upload",
          versionId: "version-edited"
        }
      }
    });
  });

  it("stores and versions expand output at the requested expand target dimensions", async () => {
    const prisma = createPrisma({
      type: "expand",
      input: {
        type: "expand",
        prompt: "extend the scene",
        assetId: "asset-1",
        versionId: "version-source",
        mode: "direction",
        direction: "top",
        percent: 0.25,
        padding: {
          left: 0,
          right: 0,
          top: 256,
          bottom: 0
        },
        expandTarget: {
          width: 1024,
          height: 1280
        }
      }
    });
    const provider = createProvider();
    provider.edit.mockResolvedValueOnce({
      bytes: await solidPng(1024, 1536),
      mimeType: "image/png",
      width: 1024,
      height: 1536,
      provider: "openai",
      providerJob: "job-edit",
      metadata: {
        model: "gpt-image-1",
        size: "1024x1536",
        quality: null,
        estimatedCostUsd: null
      }
    });
    const storage = createStorage();
    storage.putImage.mockImplementationOnce((input) =>
      Promise.resolve({
        storageKey: "local/user/workspace/task/edited.png",
        mimeType: input.mimeType,
        width: 0,
        height: 0,
        sizeBytes: input.bytes.length
      })
    );
    const worker = new ImageWorkerService(
      prisma,
      createQueue(),
      provider,
      storage
    );

    await worker.processTask("task-1");

    expect(storage.putImage).toHaveBeenCalledWith(
      expect.objectContaining({
        bytes: expect.any(Buffer),
        mimeType: "image/png"
      })
    );
    await expect(
      sharp(storage.putImage.mock.calls[0]?.[0].bytes).metadata()
    ).resolves.toEqual(
      expect.objectContaining({
        width: 1024,
        height: 1280
      })
    );
    expect(prisma.imageVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        width: 1024,
        height: 1280
      })
    });
    expect(prisma.canvasObject.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          width: 1024,
          height: 1280
        })
      })
    );
  });

  it("fails malformed expand input before reading source bytes or calling the provider", async () => {
    const prisma = createPrisma({
      type: "expand",
      input: {
        type: "expand",
        prompt: "extend the scene",
        assetId: "asset-1",
        versionId: "version-source",
        mode: "free",
        padding: {
          left: 0,
          right: 0,
          top: 0,
          bottom: 0
        },
        expandTarget: {
          width: 1024,
          height: 1024
        }
      }
    });
    const provider = createProvider();
    const storage = createStorage();
    const worker = new ImageWorkerService(
      prisma,
      createQueue(),
      provider,
      storage
    );

    await worker.processTask("task-1");

    expect(storage.getImage).not.toHaveBeenCalled();
    expect(provider.edit).not.toHaveBeenCalled();
    expect(prisma.imageTask.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "task-1" },
        data: expect.objectContaining({
          status: "failed",
          error: "图片扩展失败，请稍后再试"
        })
      })
    );
  });

  it("fails oversized expand input before reading source bytes or calling the provider", async () => {
    const prisma = createPrisma({
      type: "expand",
      input: {
        type: "expand",
        prompt: "extend the scene",
        assetId: "asset-1",
        versionId: "version-source",
        mode: "free",
        padding: {
          left: 4096,
          right: 0,
          top: 0,
          bottom: 0
        },
        expandTarget: {
          width: 5120,
          height: 1024
        }
      }
    });
    const provider = createProvider();
    const storage = createStorage();
    const worker = new ImageWorkerService(
      prisma,
      createQueue(),
      provider,
      storage
    );

    await worker.processTask("task-1");

    expect(storage.getImage).not.toHaveBeenCalled();
    expect(provider.edit).not.toHaveBeenCalled();
  });

  it("skips provider calls when expand is canceled after source and mask preparation", async () => {
    const prisma = createPrisma({
      type: "expand",
      input: {
        type: "expand",
        prompt: "extend the scene",
        assetId: "asset-1",
        versionId: "version-source",
        mode: "free",
        padding: {
          left: 16,
          right: 16,
          top: 16,
          bottom: 16
        },
        expandTarget: {
          width: 1056,
          height: 1056
        }
      },
      statuses: ["queued", "canceled"]
    });
    const provider = createProvider();
    const storage = createStorage();
    const worker = new ImageWorkerService(
      prisma,
      createQueue(),
      provider,
      storage
    );

    await worker.processTask("task-1");

    expect(storage.getImage).toHaveBeenCalled();
    expect(provider.edit).not.toHaveBeenCalled();
    expect(storage.putImage).not.toHaveBeenCalled();
    expect(prisma.imageVersion.create).not.toHaveBeenCalled();
  });

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

type TaskType = "edit" | "variation" | "upscale" | "background_removal" | "expand";

function createPrisma(taskInput: {
  type: TaskType;
  input: Record<string, unknown>;
  statuses?: string[];
  canvasObject?: {
    width: number;
    height: number;
  };
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
    canvasObject: {
      findMany: jest.fn(() =>
        Promise.resolve([
          {
            id: "object-1",
            x: 320,
            y: 320,
            width: taskInput.canvasObject?.width ?? 1024,
            height: taskInput.canvasObject?.height ?? 1024,
            props: {
              source: "upload",
              versionId: "version-source"
            }
          }
        ])
      ),
      update: jest.fn(() => Promise.resolve({ id: "object-1" }))
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
    edit: jest.fn((input) =>
      Promise.resolve({
        bytes: Buffer.from("edited"),
        mimeType: "image/png",
        width: 1024,
        height: 1024,
        provider: "openai",
        providerJob: "job-edit",
        metadata: {
          model: "gpt-image-1",
          size: input.size,
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
    getImage: jest.fn(() => Promise.resolve(tinyPng())),
    createSignedPreviewUrl: jest.fn(),
    deleteImage: jest.fn()
  } as jest.Mocked<ImageStorageService>;
}

function tinyPng(): Buffer {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
    "base64"
  );
}

async function solidPng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: {
        r: 64,
        g: 96,
        b: 128,
        alpha: 1
      }
    }
  })
    .png()
    .toBuffer();
}

async function createProviderImageResult(width: number, height: number) {
  return {
    bytes: await solidPng(width, height),
    mimeType: "image/png" as const,
    width,
    height,
    provider: "openai",
    providerJob: "job-edit",
    metadata: {
      model: "gpt-image-1",
      size: providerSizeForDimensions(width, height),
      quality: null,
      estimatedCostUsd: null,
      revisedPrompt: "safe edited prompt"
    }
  };
}

function providerSizeForDimensions(width: number, height: number): string {
  if (width > height) return "1536x1024";
  if (height > width) return "1024x1536";
  return "1024x1024";
}
