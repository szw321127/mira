import {
  Injectable,
  NotFoundException,
  Optional
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service.js";
import { ImageQueueService } from "./image-queue.service.js";
import { ImageUsageService } from "./image-usage.service.js";
import { ImageWorkerService } from "./image-worker.service.js";
import { ImageAgentService } from "./image-agent.service.js";
import {
  type CanvasSnapshot,
  type ImageTaskRequest,
  serializeImageTask,
  serializeImageWorkspace,
  toInputJson
} from "./image-workspaces.types.js";

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
    take: 20
  }
};

@Injectable()
export class ImageWorkspacesService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly queue?: ImageQueueService,
    @Optional()
    private readonly worker?: ImageWorkerService,
    @Optional()
    private readonly usage?: ImageUsageService,
    @Optional()
    private readonly agent: ImageAgentService = new ImageAgentService()
  ) {}

  async list(userId: string) {
    const workspaces = await this.prisma.imageWorkspace.findMany({
      where: {
        userId,
        deletedAt: null,
        status: "active"
      },
      orderBy: {
        updatedAt: "desc"
      },
      include: workspaceInclude
    });

    return {
      workspaces: workspaces.map(serializeImageWorkspace)
    };
  }

  async create(userId: string, title = "新图像画布") {
    const workspace = await this.prisma.imageWorkspace.create({
      data: {
        userId,
        title
      },
      include: workspaceInclude
    });

    return {
      workspace: serializeImageWorkspace(workspace)
    };
  }

  async get(userId: string, id: string) {
    const workspace = await this.findOwnedWorkspace(userId, id);
    return {
      workspace: serializeImageWorkspace(workspace)
    };
  }

  async rename(userId: string, id: string, title: string) {
    const result = await this.prisma.imageWorkspace.updateMany({
      where: {
        id,
        userId,
        deletedAt: null
      },
      data: {
        title
      }
    });

    if (result.count === 0) throw new NotFoundException("Image workspace not found.");
    return this.get(userId, id);
  }

  async remove(userId: string, id: string) {
    const result = await this.prisma.imageWorkspace.updateMany({
      where: {
        id,
        userId,
        deletedAt: null
      },
      data: {
        deletedAt: new Date()
      }
    });

    if (result.count === 0) throw new NotFoundException("Image workspace not found.");
    return { ok: true };
  }

  async updateCanvas(userId: string, id: string, snapshot: CanvasSnapshot) {
    const workspace = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.imageWorkspace.updateMany({
        where: {
          id,
          userId,
          deletedAt: null
        },
        data: {
          viewport: snapshot.viewport
            ? (snapshot.viewport as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          updatedAt: new Date()
        }
      });

      if (updated.count === 0) {
        throw new NotFoundException("Image workspace not found.");
      }

      await this.assertCanvasAssetsBelongToWorkspace(tx, id, snapshot);

      await tx.canvasObject.deleteMany({
        where: {
          workspaceId: id
        }
      });

      if (snapshot.objects.length > 0) {
        await tx.canvasObject.createMany({
          data: snapshot.objects.map((object) => ({
            id: object.id,
            workspaceId: id,
            assetId: object.assetId,
            type: object.type,
            x: object.x,
            y: object.y,
            width: object.width,
            height: object.height,
            rotation: object.rotation,
            zIndex: object.zIndex,
            props: toInputJson(object.props)
          }))
        });
      }

      const reloaded = await tx.imageWorkspace.findFirst({
        where: {
          id,
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

  async createTask(
    userId: string,
    workspaceId: string,
    request: ImageTaskRequest,
    requestIp?: string
  ) {
    await this.findOwnedWorkspace(userId, workspaceId);
    const task = await this.persistQueuedTask(userId, workspaceId, request, requestIp);
    return {
      task: serializeImageTask(task)
    };
  }

  async assertTaskBelongsToWorkspace(
    userId: string,
    workspaceId: string,
    taskId: string
  ): Promise<void> {
    const task = await this.prisma.imageTask.findFirst({
      where: {
        id: taskId,
        workspaceId,
        userId
      },
      select: {
        id: true
      }
    });

    if (!task) throw new NotFoundException("Image task not found.");
  }

  async cancelTask(userId: string, workspaceId: string, taskId: string) {
    await this.findOwnedWorkspace(userId, workspaceId);

    const result = await this.prisma.imageTask.updateMany({
      where: {
        id: taskId,
        workspaceId,
        userId,
        status: {
          in: ["queued", "running"]
        }
      },
      data: {
        status: "canceled",
        error: null,
        finishedAt: new Date()
      }
    });

    if (result.count === 0) {
      throw new NotFoundException("Image task not found.");
    }

    await this.queue?.remove(taskId);
    await this.queue?.emitEvent(taskId, {
      type: "task-progress",
      taskId,
      status: "canceled",
      message: "任务已取消"
    });

    const task = await this.prisma.imageTask.findFirst({
      where: {
        id: taskId,
        workspaceId,
        userId
      }
    });

    if (!task) throw new NotFoundException("Image task not found.");
    return {
      task: serializeImageTask(task)
    };
  }

  async retryTask(
    userId: string,
    workspaceId: string,
    taskId: string,
    requestIp?: string
  ) {
    await this.findOwnedWorkspace(userId, workspaceId);

    const originalTask = await this.prisma.imageTask.findFirst({
      where: {
        id: taskId,
        workspaceId,
        userId,
        status: {
          in: ["failed", "canceled"]
        }
      }
    });

    if (!originalTask) {
      throw new NotFoundException("Image task not found.");
    }

    const retryRequest = this.agent.createRetryRequest(originalTask);
    const task = await this.persistQueuedTask(
      userId,
      workspaceId,
      retryRequest,
      requestIp
    );

    return {
      task: serializeImageTask(task)
    };
  }

  private async findOwnedWorkspace(userId: string, id: string) {
    const workspace = await this.prisma.imageWorkspace.findFirst({
      where: {
        id,
        userId,
        deletedAt: null
      },
      include: workspaceInclude
    });

    if (!workspace) throw new NotFoundException("Image workspace not found.");
    return workspace;
  }

  private async persistQueuedTask(
    userId: string,
    workspaceId: string,
    request: ImageTaskRequest,
    requestIp?: string
  ) {
    const normalizedRequestIp = requestIp?.trim() || undefined;
    await this.usage?.assertCanCreateTask(userId, {
      workspaceId,
      ...(normalizedRequestIp ? { requestIp: normalizedRequestIp } : {}),
      request
    });

    const task = await this.prisma.imageTask.create({
      data: {
        workspaceId,
        userId,
        requestIp: normalizedRequestIp ?? null,
        type: request.type,
        input: toInputJson(this.agent.prepareTaskInput(request))
      }
    });

    if (this.queue) {
      await this.queue.enqueue({
        taskId: task.id,
        workspaceId,
        userId,
        type: request.type
      });
      await this.queue.emitEvent(task.id, {
        type: "task-created",
        taskId: task.id,
        taskType: request.type
      });
    } else {
      void this.worker?.processTask(task.id).catch(() => undefined);
    }

    return task;
  }

  private async assertCanvasAssetsBelongToWorkspace(
    tx: Pick<PrismaService, "imageAsset">,
    workspaceId: string,
    snapshot: CanvasSnapshot
  ) {
    const assetIds = [
      ...new Set(
        snapshot.objects
          .map((object) => object.assetId)
          .filter((assetId): assetId is string => Boolean(assetId))
      )
    ];

    if (assetIds.length === 0) return;

    const ownedAssets = await tx.imageAsset.findMany({
      where: {
        id: {
          in: assetIds
        },
        workspaceId
      },
      select: {
        id: true
      }
    });

    if (ownedAssets.length !== assetIds.length) {
      throw new NotFoundException("Image asset not found.");
    }
  }
}
