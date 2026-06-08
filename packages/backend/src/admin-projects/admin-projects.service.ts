import { BadRequestException, Injectable } from '@nestjs/common';
import type { AdminProject as StoredAdminProject } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateAdminProjectDto } from './dto/create-admin-project.dto';
import type {
  AdminNotification,
  AdminProject,
  AdminProjectsDashboard,
  AdminTask,
} from './admin-projects.types';

type AdminProjectWithTasks = StoredAdminProject & {
  tasks: Array<{ status: string }>;
};

type StoredTaskWithProject = {
  assignee: string;
  dueDate: string;
  key: string;
  name: string;
  project?: { name: string } | null;
  status: string;
};

type StoredNotification = {
  createdAt: Date;
  description: string;
  id: string;
  title: string;
};

@Injectable()
export class AdminProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async getDashboard(): Promise<AdminProjectsDashboard> {
    const [projects, tasks, notifications] = await Promise.all([
      this.prisma.adminProject.findMany({
        include: { tasks: true },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.adminTask.findMany({
        include: { project: { select: { name: true } } },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.adminNotification.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);
    const serializedProjects = projects.map((project) =>
      this.toProject(project),
    );
    const riskQueue = serializedProjects.filter(
      (project) => project.status === '风险',
    );

    return {
      capabilities: {
        canCreateProject: true,
      },
      metrics: {
        activeProjects: serializedProjects.filter((project) =>
          ['进行中', '风险'].includes(project.status),
        ).length,
        averageProgress:
          serializedProjects.length === 0
            ? 0
            : Math.round(
                serializedProjects.reduce(
                  (sum, project) => sum + project.progress,
                  0,
                ) / serializedProjects.length,
              ),
        riskProjects: riskQueue.length,
        totalProjects: serializedProjects.length,
        weeklyCompletedTasks: tasks.filter((task) => task.status === '已完成')
          .length,
      },
      notifications: notifications.map((notification) =>
        this.toNotification(notification),
      ),
      projects: serializedProjects,
      riskQueue,
      tasks: tasks.map((task) => this.toTask(task)),
    };
  }

  async createProject(dto: CreateAdminProjectDto): Promise<AdminProject> {
    const name = dto.name.trim();
    const owner = dto.owner.trim();
    const project = await this.createProjectRecord(dto, name, owner);

    return this.toProject(project);
  }

  private async createProjectRecord(
    dto: CreateAdminProjectDto,
    name: string,
    owner: string,
  ): Promise<AdminProjectWithTasks> {
    try {
      return await this.prisma.adminProject.create({
        data: {
          budget: dto.budget?.trim() || '',
          dueDate: dto.dueDate?.trim() || '',
          key: dto.key?.trim() || this.createProjectKey(name),
          name,
          owner,
          priority: dto.priority ?? 'P1',
          progress: dto.progress ?? 0,
          riskEscalationOwner: this.optionalTrim(dto.riskEscalationOwner),
          riskLatestUpdate: this.optionalTrim(dto.riskLatestUpdate),
          riskNextAction: this.optionalTrim(dto.riskNextAction),
          riskReason: this.optionalTrim(dto.riskReason),
          riskSeverity: dto.riskSeverity ?? null,
          status: dto.status ?? '规划中',
          team: JSON.stringify(this.normalizeTeam(dto.team, owner)),
        },
        include: { tasks: true },
      });
    } catch (error) {
      if (this.isUniqueKeyError(error)) {
        throw new BadRequestException('项目 Key 已存在，请换一个。');
      }

      throw error;
    }
  }

  private toProject(project: AdminProjectWithTasks): AdminProject {
    const taskDone = project.tasks.filter(
      (task) => task.status === '已完成',
    ).length;
    const result: AdminProject = {
      budget: project.budget,
      dueDate: project.dueDate,
      key: project.key,
      name: project.name,
      owner: project.owner,
      priority: this.toPriority(project.priority),
      progress: project.progress,
      status: this.toStatus(project.status),
      taskDone,
      taskTotal: project.tasks.length,
      team: this.parseTeam(project.team),
    };

    if (project.riskEscalationOwner) {
      result.riskEscalationOwner = project.riskEscalationOwner;
    }
    if (project.riskLatestUpdate) {
      result.riskLatestUpdate = project.riskLatestUpdate;
    }
    if (project.riskNextAction) {
      result.riskNextAction = project.riskNextAction;
    }
    if (project.riskReason) {
      result.riskReason = project.riskReason;
    }
    if (project.riskSeverity) {
      result.riskSeverity = this.toRiskSeverity(project.riskSeverity);
    }

    return result;
  }

  private toTask(task: StoredTaskWithProject): AdminTask {
    return {
      assignee: task.assignee,
      dueDate: task.dueDate,
      key: task.key,
      name: task.name,
      project: task.project?.name ?? '未关联项目',
      status: this.toTaskStatus(task.status),
    };
  }

  private toNotification(notification: StoredNotification): AdminNotification {
    return {
      createdAt: notification.createdAt.toISOString(),
      description: notification.description,
      id: notification.id,
      title: notification.title,
    };
  }

  private parseTeam(value: string): string[] {
    try {
      const parsed: unknown = JSON.parse(value);

      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item): item is string => typeof item === 'string',
        );
      }
    } catch {
      return [];
    }

    return [];
  }

  private normalizeTeam(team: string[] | undefined, owner: string): string[] {
    const members = (team ?? []).map((member) => member.trim()).filter(Boolean);

    return Array.from(new Set([owner, ...members]));
  }

  private optionalTrim(value: string | undefined): string | null {
    const trimmed = value?.trim();

    return trimmed || null;
  }

  private createProjectKey(name: string): string {
    const normalized = name
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 36);

    return normalized || `project-${Date.now()}`;
  }

  private toStatus(status: string): AdminProject['status'] {
    if (
      status === '进行中' ||
      status === '规划中' ||
      status === '风险' ||
      status === '已上线'
    ) {
      return status;
    }

    return '规划中';
  }

  private toPriority(priority: string): AdminProject['priority'] {
    if (priority === 'P0' || priority === 'P1' || priority === 'P2') {
      return priority;
    }

    return 'P1';
  }

  private toRiskSeverity(
    value: string,
  ): NonNullable<AdminProject['riskSeverity']> {
    if (value === '高' || value === '中' || value === '低') {
      return value;
    }

    return '中';
  }

  private toTaskStatus(status: string): AdminTask['status'] {
    if (
      status === '待开始' ||
      status === '推进中' ||
      status === '验收中' ||
      status === '已完成'
    ) {
      return status;
    }

    return '待开始';
  }

  private isUniqueKeyError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }

    const record = error as { code?: unknown; meta?: { target?: unknown } };

    return (
      record.code === 'P2002' &&
      Array.isArray(record.meta?.target) &&
      record.meta.target.includes('key')
    );
  }
}
