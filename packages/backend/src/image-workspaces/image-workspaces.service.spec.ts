import { NotFoundException } from "@nestjs/common";
import { jest } from "@jest/globals";
import type { PrismaService } from "../database/prisma.service.js";
import { ImageWorkspacesService } from "./image-workspaces.service.js";
import type { CanvasSnapshot } from "./image-workspaces.types.js";

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
  assets: ImageAssetRow[];
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

type ImageAssetRow = {
  id: string;
  workspaceId: string;
  userId: string;
  currentVersionId: string | null;
  title: string | null;
  prompt: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  versions: unknown[];
};

type ImageTaskRow = {
  id: string;
  workspaceId: string;
  userId: string;
  requestIp: string | null;
  type: "generate" | "edit" | "variation" | "upscale" | "background_removal";
  status: "queued" | "running" | "complete" | "failed" | "canceled";
  input: unknown;
  output: unknown;
  error: string | null;
  cost: unknown;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

function createPrisma(workspaces: WorkspaceRow[]) {
  let taskCount = 0;

  const prisma = {
    imageWorkspace: {
      findMany: jest.fn(({ where, orderBy }: Record<string, unknown>) => {
        const typedWhere = where as {
          userId: string;
          deletedAt: null;
          status: "active";
        };
        const typedOrderBy = orderBy as { updatedAt: "desc" };
        const rows = workspaces
          .filter((workspace) => {
            return (
              workspace.userId === typedWhere.userId &&
              workspace.deletedAt === typedWhere.deletedAt &&
              workspace.status === typedWhere.status
            );
          })
          .sort((left, right) => {
            if (typedOrderBy.updatedAt !== "desc") return 0;
            return right.updatedAt.getTime() - left.updatedAt.getTime();
          })
          .map(includeWorkspaceRelations);

        return Promise.resolve(rows);
      }),
      findFirst: jest.fn(({ where }: Record<string, unknown>) => {
        const typedWhere = where as {
          id: string;
          userId: string;
          deletedAt: null;
        };
        const row =
          workspaces.find((workspace) => {
            return (
              workspace.id === typedWhere.id &&
              workspace.userId === typedWhere.userId &&
              workspace.deletedAt === typedWhere.deletedAt
            );
          }) ?? null;
        return Promise.resolve(row ? includeWorkspaceRelations(row) : null);
      }),
      create: jest.fn(({ data }: Record<string, unknown>) => {
        const typedData = data as { userId: string; title: string };
        const now = new Date("2026-06-23T09:00:00.000Z");
        const workspace: WorkspaceRow = {
          id: `workspace-${workspaces.length + 1}`,
          userId: typedData.userId,
          title: typedData.title,
          status: "active",
          viewport: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
          objects: [],
          assets: [],
          tasks: []
        };
        workspaces.push(workspace);
        return Promise.resolve(includeWorkspaceRelations(workspace));
      }),
      updateMany: jest.fn(({ where, data }: Record<string, unknown>) => {
        const typedWhere = where as {
          id: string;
          userId: string;
          deletedAt: null;
        };
        let count = 0;
        for (const workspace of workspaces) {
          if (
            workspace.id === typedWhere.id &&
            workspace.userId === typedWhere.userId &&
            workspace.deletedAt === typedWhere.deletedAt
          ) {
            Object.assign(workspace, data);
            count += 1;
          }
        }
        return Promise.resolve({ count });
      }),
      update: jest.fn(({ where, data }: Record<string, unknown>) => {
        const typedWhere = where as { id: string };
        const workspace = workspaces.find((row) => row.id === typedWhere.id);
        if (!workspace) throw new Error("Workspace not found");
        Object.assign(workspace, data);
        return Promise.resolve(includeWorkspaceRelations(workspace));
      })
    },
    canvasObject: {
      count: jest.fn(({ where }: Record<string, unknown>) => {
        const typedWhere = where as { workspaceId: string };
        const workspace = workspaces.find((row) => row.id === typedWhere.workspaceId);
        return Promise.resolve(workspace?.objects.length ?? 0);
      }),
      deleteMany: jest.fn(({ where }: Record<string, unknown>) => {
        const typedWhere = where as { workspaceId: string };
        const workspace = workspaces.find((row) => row.id === typedWhere.workspaceId);
        const count = workspace?.objects.length ?? 0;
        if (workspace) workspace.objects = [];
        return Promise.resolve({ count });
      }),
      createMany: jest.fn(({ data }: Record<string, unknown>) => {
        const rows = data as CanvasObjectRow[];
        for (const object of rows) {
          const workspace = workspaces.find((row) => row.id === object.workspaceId);
          workspace?.objects.push({
            ...object,
            createdAt: new Date("2026-06-23T09:01:00.000Z"),
            updatedAt: new Date("2026-06-23T09:01:00.000Z")
          });
        }
        return Promise.resolve({ count: rows.length });
      })
    },
    imageAsset: {
      findMany: jest.fn(({ where, select }: Record<string, unknown>) => {
        const typedWhere = where as { id: { in: string[] }; workspaceId: string };
        const typedSelect = select as { id?: boolean } | undefined;
        const rows = workspaces
          .flatMap((workspace) => workspace.assets)
          .filter((asset) => {
            return (
              asset.workspaceId === typedWhere.workspaceId &&
              typedWhere.id.in.includes(asset.id)
            );
          });

        if (typedSelect?.id) {
          return Promise.resolve(rows.map((asset) => ({ id: asset.id })));
        }

        return Promise.resolve(rows);
      })
    },
    imageTask: {
      findFirst: jest.fn(({ where }: Record<string, unknown>) => {
        const typedWhere = where as {
          id: string;
          workspaceId?: string;
          userId?: string;
          status?: {
            in?: ImageTaskRow["status"][];
          };
        };
        const task =
          workspaces
            .flatMap((workspace) => workspace.tasks)
            .find((item) => {
              if (item.id !== typedWhere.id) return false;
              if (typedWhere.workspaceId && item.workspaceId !== typedWhere.workspaceId) {
                return false;
              }
              if (typedWhere.userId && item.userId !== typedWhere.userId) return false;
              if (typedWhere.status?.in && !typedWhere.status.in.includes(item.status)) {
                return false;
              }
              return true;
            }) ?? null;
        return Promise.resolve(task);
      }),
      updateMany: jest.fn(({ where, data }: Record<string, unknown>) => {
        const typedWhere = where as {
          id: string;
          workspaceId: string;
          userId: string;
          status?: {
            in?: ImageTaskRow["status"][];
          };
        };
        let count = 0;
        for (const task of workspaces.flatMap((workspace) => workspace.tasks)) {
          if (task.id !== typedWhere.id) continue;
          if (task.workspaceId !== typedWhere.workspaceId) continue;
          if (task.userId !== typedWhere.userId) continue;
          if (typedWhere.status?.in && !typedWhere.status.in.includes(task.status)) {
            continue;
          }
          Object.assign(task, data);
          count += 1;
        }
        return Promise.resolve({ count });
      }),
      create: jest.fn(({ data }: Record<string, unknown>) => {
        const typedData = data as {
          workspaceId: string;
          userId: string;
          requestIp?: unknown;
          type: ImageTaskRow["type"];
          input: unknown;
        };
        const task: ImageTaskRow = {
          id: `task-${++taskCount}`,
          workspaceId: typedData.workspaceId,
          userId: typedData.userId,
          requestIp:
            "requestIp" in typedData && typeof typedData.requestIp === "string"
              ? typedData.requestIp
              : null,
          type: typedData.type,
          status: "queued",
          input: typedData.input,
          output: null,
          error: null,
          cost: null,
          createdAt: new Date("2026-06-23T09:02:00.000Z"),
          startedAt: null,
          finishedAt: null
        };
        const workspace = workspaces.find((row) => row.id === typedData.workspaceId);
        workspace?.tasks.push(task);
        return Promise.resolve(task);
      })
    },
    $transaction: jest.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      return callback(prisma);
    })
  };

  return prisma as unknown as PrismaService;
}

function includeWorkspaceRelations(workspace: WorkspaceRow) {
  return {
    ...workspace,
    objects: [...workspace.objects].sort((left, right) => left.zIndex - right.zIndex),
    assets: workspace.assets.map((asset) => ({ ...asset, versions: asset.versions })),
    tasks: [...workspace.tasks].sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime()
    )
  };
}

function workspace(
  id: string,
  userId: string,
  title: string,
  updatedAt: string,
  overrides: Partial<WorkspaceRow> = {}
): WorkspaceRow {
  return {
    id,
    userId,
    title,
    status: "active",
    viewport: null,
    createdAt: new Date(updatedAt),
    updatedAt: new Date(updatedAt),
    deletedAt: null,
    objects: [],
    assets: [],
    tasks: [],
    ...overrides
  };
}

function imageAsset(
  id: string,
  workspaceId: string,
  userId: string,
  overrides: Partial<ImageAssetRow> = {}
): ImageAssetRow {
  return {
    id,
    workspaceId,
    userId,
    currentVersionId: null,
    title: null,
    prompt: null,
    metadata: {},
    createdAt: new Date("2026-06-23T08:05:00.000Z"),
    updatedAt: new Date("2026-06-23T08:05:00.000Z"),
    versions: [],
    ...overrides
  };
}

function imageTask(
  id: string,
  workspaceId: string,
  userId: string,
  status: ImageTaskRow["status"],
  overrides: Partial<ImageTaskRow> = {}
): ImageTaskRow {
  return {
    id,
    workspaceId,
    userId,
    requestIp: null,
    type: "generate",
    status,
    input: { prompt: "make a cover" },
    output: null,
    error: null,
    cost: null,
    createdAt: new Date("2026-06-23T08:15:00.000Z"),
    startedAt: null,
    finishedAt: null,
    ...overrides
  };
}

describe("ImageWorkspacesService", () => {
  it("lists only active non-deleted workspaces for the current user", async () => {
    const prisma = createPrisma([
      workspace("old", "user-1", "Old", "2026-06-23T08:00:00.000Z"),
      workspace("deleted", "user-1", "Deleted", "2026-06-23T10:00:00.000Z", {
        deletedAt: new Date("2026-06-23T10:30:00.000Z")
      }),
      workspace("other", "user-2", "Other", "2026-06-23T11:00:00.000Z"),
      workspace("new", "user-1", "New", "2026-06-23T12:00:00.000Z")
    ]);
    const service = new ImageWorkspacesService(prisma);

    await expect(service.list("user-1")).resolves.toEqual({
      workspaces: [
        expect.objectContaining({ id: "new", title: "New" }),
        expect.objectContaining({ id: "old", title: "Old" })
      ]
    });
  });

  it("creates a titled workspace for the current user", async () => {
    const prisma = createPrisma([]);
    const service = new ImageWorkspacesService(prisma);

    await expect(service.create("user-1", "Campaign covers")).resolves.toEqual({
      workspace: expect.objectContaining({
        id: "workspace-1",
        title: "Campaign covers",
        objects: [],
        assets: [],
        tasks: []
      })
    });
  });

  it("rejects another user's workspace", async () => {
    const prisma = createPrisma([
      workspace("workspace-2", "user-2", "Other", "2026-06-23T08:00:00.000Z")
    ]);
    const service = new ImageWorkspacesService(prisma);

    await expect(service.get("user-1", "workspace-2")).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it("replaces canvas objects and stores the viewport for an owned workspace", async () => {
    const prisma = createPrisma([
      workspace("workspace-1", "user-1", "Board", "2026-06-23T08:00:00.000Z", {
        objects: [
          {
            id: "old-object",
            workspaceId: "workspace-1",
            assetId: null,
            type: "note",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            rotation: 0,
            zIndex: 0,
            props: {},
            createdAt: new Date("2026-06-23T08:01:00.000Z"),
            updatedAt: new Date("2026-06-23T08:01:00.000Z")
          }
        ]
      })
    ]);
    const service = new ImageWorkspacesService(prisma);
    const snapshot: CanvasSnapshot = {
      viewport: { x: 10, y: 20, zoom: 0.75 },
      objects: [
        {
          id: "new-object",
          assetId: null,
          type: "frame",
          x: 30,
          y: 40,
          width: 500,
          height: 360,
          rotation: 0,
          zIndex: 4,
          props: { name: "Cover set" }
        }
      ]
    };

    await expect(
      service.updateCanvas("user-1", "workspace-1", snapshot)
    ).resolves.toEqual({
      workspace: expect.objectContaining({
        id: "workspace-1",
        viewport: { x: 10, y: 20, zoom: 0.75 },
        objects: [
          expect.objectContaining({
            id: "new-object",
            type: "frame",
            zIndex: 4
          })
        ]
      })
    });
  });

  it("does not clear existing canvas objects with a transient empty snapshot", async () => {
    const prisma = createPrisma([
      workspace("workspace-1", "user-1", "Board", "2026-06-23T08:00:00.000Z", {
        objects: [
          {
            id: "image-object",
            workspaceId: "workspace-1",
            assetId: null,
            type: "image",
            x: 40,
            y: 50,
            width: 320,
            height: 320,
            rotation: 0,
            zIndex: 0,
            props: {},
            createdAt: new Date("2026-06-23T08:01:00.000Z"),
            updatedAt: new Date("2026-06-23T08:01:00.000Z")
          }
        ]
      })
    ]);
    const service = new ImageWorkspacesService(prisma);

    await expect(
      service.updateCanvas("user-1", "workspace-1", {
        viewport: { x: 10, y: 20, zoom: 0.75 },
        objects: []
      })
    ).resolves.toEqual({
      workspace: expect.objectContaining({
        id: "workspace-1",
        viewport: { x: 10, y: 20, zoom: 0.75 },
        objects: [
          expect.objectContaining({
            id: "image-object",
            type: "image"
          })
        ]
      })
    });
    expect(prisma.canvasObject.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects canvas objects that reference assets from another workspace", async () => {
    const ownedWorkspace = workspace(
      "workspace-1",
      "user-1",
      "Board",
      "2026-06-23T08:00:00.000Z"
    );
    const otherWorkspace = workspace(
      "workspace-2",
      "user-1",
      "Other board",
      "2026-06-23T08:10:00.000Z",
      {
        assets: [
          imageAsset("asset-other", "workspace-2", "user-1")
        ]
      }
    );
    const prisma = createPrisma([ownedWorkspace, otherWorkspace]);
    const service = new ImageWorkspacesService(prisma);
    const snapshot: CanvasSnapshot = {
      viewport: { x: 0, y: 0, zoom: 1 },
      objects: [
        {
          id: "foreign-object",
          assetId: "asset-other",
          type: "image",
          x: 30,
          y: 40,
          width: 500,
          height: 360,
          rotation: 0,
          zIndex: 4,
          props: {}
        }
      ]
    };

    await expect(
      service.updateCanvas("user-1", "workspace-1", snapshot)
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(ownedWorkspace.objects).toHaveLength(0);
  });

  it("creates queued generate tasks for an owned workspace", async () => {
    const prisma = createPrisma([
      workspace("workspace-1", "user-1", "Board", "2026-06-23T08:00:00.000Z")
    ]);
    const queue = {
      enqueue: jest.fn(() => Promise.resolve()),
      emitEvent: jest.fn(() => Promise.resolve())
    };
    const service = new ImageWorkspacesService(prisma, queue as never);

    await expect(
      service.createTask("user-1", "workspace-1", {
        type: "generate",
        prompt: "make a cover",
        target: { x: 100, y: 120 }
      })
    ).resolves.toEqual({
      task: expect.objectContaining({
        id: "task-1",
        status: "queued",
        type: "generate",
        input: {
          prompt: "make a cover",
          target: { x: 100, y: 120 }
        }
      })
    });
    expect(queue.emitEvent).toHaveBeenCalledWith("task-1", {
      type: "task-created",
      taskId: "task-1",
      taskType: "generate"
    });
  });

  it("checks image usage policy before creating a task", async () => {
    const prisma = createPrisma([
      workspace("workspace-1", "user-1", "Board", "2026-06-23T08:00:00.000Z")
    ]);
    const usage = {
      assertCanCreateTask: jest.fn(() => Promise.resolve())
    };
    const service = new ImageWorkspacesService(
      prisma,
      undefined,
      undefined,
      usage as never
    );

    await service.createTask("user-1", "workspace-1", {
      type: "generate",
      prompt: "make a cover"
    });

    expect(usage.assertCanCreateTask).toHaveBeenCalledWith("user-1", {
      workspaceId: "workspace-1",
      request: {
        type: "generate",
        prompt: "make a cover"
      }
    });
  });

  it("passes request IP into usage policy and stores it on image tasks", async () => {
    const prisma = createPrisma([
      workspace("workspace-1", "user-1", "Board", "2026-06-23T08:00:00.000Z")
    ]);
    const usage = {
      assertCanCreateTask: jest.fn(() => Promise.resolve())
    };
    const service = new ImageWorkspacesService(
      prisma,
      undefined,
      undefined,
      usage as never
    );

    await (service as unknown as {
      createTask: (
        userId: string,
        workspaceId: string,
        request: {
          type: "generate";
          prompt: string;
        },
        requestIp: string
      ) => Promise<unknown>;
    }).createTask("user-1", "workspace-1", {
      type: "generate",
      prompt: "make a cover"
    }, "203.0.113.9");

    expect(usage.assertCanCreateTask).toHaveBeenCalledWith("user-1", {
      workspaceId: "workspace-1",
      requestIp: "203.0.113.9",
      request: {
        type: "generate",
        prompt: "make a cover"
      }
    });
    expect(prisma.imageTask.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        requestIp: "203.0.113.9"
      })
    });
  });

  it("does not persist a task when usage policy rejects it", async () => {
    const prisma = createPrisma([
      workspace("workspace-1", "user-1", "Board", "2026-06-23T08:00:00.000Z")
    ]);
    const usage = {
      assertCanCreateTask: jest.fn(() =>
        Promise.reject(new Error("今日图像任务次数已用完"))
      )
    };
    const service = new ImageWorkspacesService(
      prisma,
      undefined,
      undefined,
      usage as never
    );

    await expect(
      service.createTask("user-1", "workspace-1", {
        type: "generate",
        prompt: "make a cover"
      })
    ).rejects.toThrow("今日图像任务次数已用完");

    expect(prisma.imageTask.create).not.toHaveBeenCalled();
  });

  it("cancels an owned queued task and publishes a safe canceled event", async () => {
    const task = imageTask("task-1", "workspace-1", "user-1", "queued");
    const prisma = createPrisma([
      workspace("workspace-1", "user-1", "Board", "2026-06-23T08:00:00.000Z", {
        tasks: [task]
      })
    ]);
    const queue = {
      emitEvent: jest.fn(() => Promise.resolve()),
      remove: jest.fn(() => Promise.resolve())
    };
    const service = new ImageWorkspacesService(prisma, queue as never);

    await expect(
      service.cancelTask("user-1", "workspace-1", "task-1")
    ).resolves.toEqual({
      task: expect.objectContaining({
        id: "task-1",
        status: "canceled"
      })
    });
    expect(queue.remove).toHaveBeenCalledWith("task-1");
    expect(queue.emitEvent).toHaveBeenCalledWith("task-1", {
      type: "task-progress",
      taskId: "task-1",
      status: "canceled",
      message: "任务已取消"
    });
    expect(task.status).toBe("canceled");
    expect(task.finishedAt).toBeInstanceOf(Date);
  });

  it("does not cancel completed tasks", async () => {
    const prisma = createPrisma([
      workspace("workspace-1", "user-1", "Board", "2026-06-23T08:00:00.000Z", {
        tasks: [imageTask("task-1", "workspace-1", "user-1", "complete")]
      })
    ]);
    const queue = {
      emitEvent: jest.fn(() => Promise.resolve()),
      remove: jest.fn(() => Promise.resolve())
    };
    const service = new ImageWorkspacesService(prisma, queue as never);

    await expect(
      service.cancelTask("user-1", "workspace-1", "task-1")
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(queue.remove).not.toHaveBeenCalled();
    expect(queue.emitEvent).not.toHaveBeenCalled();
  });

  it("retries a failed task by creating a fresh queued task from the original input", async () => {
    const failedTask = imageTask("task-failed", "workspace-1", "user-1", "failed", {
      finishedAt: new Date("2026-06-23T08:20:00.000Z"),
      input: {
        prompt: "make a cover",
        target: { x: 100, y: 120 }
      }
    });
    const prisma = createPrisma([
      workspace("workspace-1", "user-1", "Board", "2026-06-23T08:00:00.000Z", {
        tasks: [failedTask]
      })
    ]);
    const queue = {
      enqueue: jest.fn(() => Promise.resolve()),
      emitEvent: jest.fn(() => Promise.resolve())
    };
    const usage = {
      assertCanCreateTask: jest.fn(() => Promise.resolve())
    };
    const service = new ImageWorkspacesService(
      prisma,
      queue as never,
      undefined,
      usage as never
    );

    await expect(
      service.retryTask("user-1", "workspace-1", "task-failed", "203.0.113.12")
    ).resolves.toEqual({
      task: expect.objectContaining({
        id: "task-1",
        status: "queued",
        type: "generate",
        input: {
          prompt: "make a cover",
          target: { x: 100, y: 120 }
        }
      })
    });
    expect(failedTask.status).toBe("failed");
    expect(usage.assertCanCreateTask).toHaveBeenCalledWith("user-1", {
      workspaceId: "workspace-1",
      requestIp: "203.0.113.12",
      request: {
        type: "generate",
        prompt: "make a cover",
        target: { x: 100, y: 120 }
      }
    });
    expect(queue.enqueue).toHaveBeenCalledWith({
      taskId: "task-1",
      workspaceId: "workspace-1",
      userId: "user-1",
      type: "generate"
    });
  });

  it("does not retry completed tasks", async () => {
    const prisma = createPrisma([
      workspace("workspace-1", "user-1", "Board", "2026-06-23T08:00:00.000Z", {
        tasks: [imageTask("task-1", "workspace-1", "user-1", "complete")]
      })
    ]);
    const queue = {
      enqueue: jest.fn(() => Promise.resolve())
    };
    const service = new ImageWorkspacesService(prisma, queue as never);

    await expect(
      service.retryTask("user-1", "workspace-1", "task-1")
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(queue.enqueue).not.toHaveBeenCalled();
  });

  it("requires task streams to belong to the requested user workspace", async () => {
    const prisma = createPrisma([
      workspace("workspace-1", "user-1", "Board", "2026-06-23T08:00:00.000Z", {
        tasks: [imageTask("task-1", "workspace-1", "user-1", "queued")]
      })
    ]);
    const service = new ImageWorkspacesService(prisma);

    await expect(
      service.assertTaskBelongsToWorkspace("user-1", "workspace-1", "task-1")
    ).resolves.toBeUndefined();
    await expect(
      service.assertTaskBelongsToWorkspace("user-1", "workspace-1", "task-other")
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("enqueues generated image tasks without processing them inline when a queue is present", async () => {
    const prisma = createPrisma([
      workspace("workspace-1", "user-1", "Board", "2026-06-23T08:00:00.000Z")
    ]);
    const queue = {
      enqueue: jest.fn(() => Promise.resolve()),
      emitEvent: jest.fn(() => Promise.resolve())
    };
    const worker = {
      processTask: jest.fn(() => Promise.resolve())
    };
    const service = new ImageWorkspacesService(prisma, queue, worker);

    await service.createTask("user-1", "workspace-1", {
      type: "generate",
      prompt: "make a cover"
    });

    expect(queue.enqueue).toHaveBeenCalledWith({
      taskId: "task-1",
      workspaceId: "workspace-1",
      userId: "user-1",
      type: "generate"
    });
    expect(worker.processTask).not.toHaveBeenCalled();
  });

  it("soft deletes only owned workspaces", async () => {
    const prisma = createPrisma([
      workspace("workspace-2", "user-2", "Other", "2026-06-23T08:00:00.000Z")
    ]);
    const service = new ImageWorkspacesService(prisma);

    await expect(service.remove("user-1", "workspace-2")).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});
