import type { PrismaService } from "../database/prisma.service.js";

export const IMAGE_TASK_HISTORY_LIMIT = 20;

type ImageTaskHistoryStore = Pick<PrismaService, "imageTask">;

export async function pruneImageTaskHistory(
  prisma: ImageTaskHistoryStore,
  workspaceId: string
): Promise<void> {
  const staleTasks = await prisma.imageTask.findMany({
    where: {
      workspaceId
    },
    orderBy: {
      createdAt: "desc"
    },
    skip: IMAGE_TASK_HISTORY_LIMIT,
    select: {
      id: true
    }
  });

  if (staleTasks.length === 0) return;

  await prisma.imageTask.deleteMany({
    where: {
      id: {
        in: staleTasks.map((task) => task.id)
      }
    }
  });
}
