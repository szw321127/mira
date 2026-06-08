import { AdminProjectsService } from './admin-projects.service';

type StoredAdminTask = {
  assignee: string;
  dueDate: string;
  id: string;
  key: string;
  name: string;
  project?: { name: string } | null;
  projectId: string | null;
  status: '待开始' | '推进中' | '验收中' | '已完成';
  updatedAt: Date;
};

type StoredAdminProject = {
  budget: string;
  dueDate: string;
  id: string;
  key: string;
  name: string;
  owner: string;
  priority: 'P0' | 'P1' | 'P2';
  progress: number;
  riskEscalationOwner: string | null;
  riskLatestUpdate: string | null;
  riskNextAction: string | null;
  riskReason: string | null;
  riskSeverity: '高' | '中' | '低' | null;
  status: '进行中' | '规划中' | '风险' | '已上线';
  tasks: StoredAdminTask[];
  team: string;
  updatedAt: Date;
};

type StoredAdminNotification = {
  createdAt: Date;
  description: string;
  id: string;
  title: string;
};

describe('AdminProjectsService real persistence', () => {
  function createService(
    projects: StoredAdminProject[] = [],
    tasks: StoredAdminTask[] = [],
    notifications: StoredAdminNotification[] = [],
  ) {
    const prisma = {
      adminNotification: {
        findMany: jest.fn(async () => notifications),
      },
      adminProject: {
        create: jest.fn(async ({ data }) => ({
          budget: data.budget,
          dueDate: data.dueDate,
          id: 'project-created',
          key: data.key,
          name: data.name,
          owner: data.owner,
          priority: data.priority,
          progress: data.progress,
          riskEscalationOwner: data.riskEscalationOwner ?? null,
          riskLatestUpdate: data.riskLatestUpdate ?? null,
          riskNextAction: data.riskNextAction ?? null,
          riskReason: data.riskReason ?? null,
          riskSeverity: data.riskSeverity ?? null,
          status: data.status,
          tasks: [],
          team: data.team,
          updatedAt: new Date('2026-06-09T00:00:00.000Z'),
        })),
        findMany: jest.fn(async () => projects),
      },
      adminTask: {
        findMany: jest.fn(async () => tasks),
      },
    };

    return {
      prisma,
      service: new AdminProjectsService(prisma as never),
    };
  }

  it('returns an empty real dashboard when no records exist', async () => {
    const { service } = createService();

    await expect(service.getDashboard()).resolves.toEqual({
      capabilities: { canCreateProject: true },
      metrics: {
        activeProjects: 0,
        averageProgress: 0,
        riskProjects: 0,
        totalProjects: 0,
        weeklyCompletedTasks: 0,
      },
      notifications: [],
      projects: [],
      riskQueue: [],
      tasks: [],
    });
  });

  it('computes dashboard metrics and risk queue from persisted records', async () => {
    const updatedAt = new Date('2026-06-09T00:00:00.000Z');
    const doneTask: StoredAdminTask = {
      assignee: 'Mia',
      dueDate: '06/12',
      id: 'task-1',
      key: 'task-1',
      name: '接入真实图片模型',
      project: { name: '生成链路真实化' },
      projectId: 'project-1',
      status: '已完成',
      updatedAt,
    };
    const activeTask: StoredAdminTask = {
      ...doneTask,
      id: 'task-2',
      key: 'task-2',
      name: '移除静态项目数组',
      status: '推进中',
    };
    const { service } = createService(
      [
        {
          budget: '12w',
          dueDate: '06/30',
          id: 'project-1',
          key: 'real-runtime',
          name: '生成链路真实化',
          owner: '林舟',
          priority: 'P0',
          progress: 60,
          riskEscalationOwner: '林舟',
          riskLatestUpdate: '今天 10:00 已确认模型配置',
          riskNextAction: '完成 provider 联调',
          riskReason: '模型服务配置缺失会阻断生成链路',
          riskSeverity: '高',
          status: '风险',
          tasks: [doneTask, activeTask],
          team: JSON.stringify(['林舟', 'Mia']),
          updatedAt,
        },
        {
          budget: '4w',
          dueDate: '07/08',
          id: 'project-2',
          key: 'admin-data',
          name: '后台数据真实化',
          owner: 'Kevin',
          priority: 'P1',
          progress: 20,
          riskEscalationOwner: null,
          riskLatestUpdate: null,
          riskNextAction: null,
          riskReason: null,
          riskSeverity: null,
          status: '规划中',
          tasks: [],
          team: JSON.stringify(['Kevin']),
          updatedAt,
        },
      ],
      [doneTask, activeTask],
      [
        {
          createdAt: updatedAt,
          description: '生成链路真实化进入风险队列。',
          id: 'notice-1',
          title: '风险提醒',
        },
      ],
    );

    const dashboard = await service.getDashboard();

    expect(dashboard.metrics).toEqual({
      activeProjects: 1,
      averageProgress: 40,
      riskProjects: 1,
      totalProjects: 2,
      weeklyCompletedTasks: 1,
    });
    expect(dashboard.projects[0]).toMatchObject({
      key: 'real-runtime',
      taskDone: 1,
      taskTotal: 2,
      team: ['林舟', 'Mia'],
    });
    expect(dashboard.riskQueue).toHaveLength(1);
    expect(dashboard.tasks).toEqual([
      expect.objectContaining({
        key: 'task-1',
        project: '生成链路真实化',
      }),
      expect.objectContaining({
        key: 'task-2',
        project: '生成链路真实化',
      }),
    ]);
    expect(dashboard.notifications).toEqual([
      {
        createdAt: '2026-06-09T00:00:00.000Z',
        description: '生成链路真实化进入风险队列。',
        id: 'notice-1',
        title: '风险提醒',
      },
    ]);
  });

  it('creates a persisted project and serializes it for the admin UI', async () => {
    const { prisma, service } = createService();

    const project = await service.createProject({
      budget: '8w',
      dueDate: '07/01',
      key: 'commercial-admin',
      name: '商业化后台',
      owner: '阿遥',
      priority: 'P1',
      progress: 12,
      status: '进行中',
      team: ['阿遥', 'Mia'],
    });

    expect(prisma.adminProject.create).toHaveBeenCalledWith({
      data: {
        budget: '8w',
        dueDate: '07/01',
        key: 'commercial-admin',
        name: '商业化后台',
        owner: '阿遥',
        priority: 'P1',
        progress: 12,
        riskEscalationOwner: null,
        riskLatestUpdate: null,
        riskNextAction: null,
        riskReason: null,
        riskSeverity: null,
        status: '进行中',
        team: JSON.stringify(['阿遥', 'Mia']),
      },
      include: { tasks: true },
    });
    expect(project).toMatchObject({
      key: 'commercial-admin',
      name: '商业化后台',
      taskDone: 0,
      taskTotal: 0,
      team: ['阿遥', 'Mia'],
    });
  });

  it('returns a product-level error when the project key already exists', async () => {
    const { prisma, service } = createService();
    prisma.adminProject.create.mockImplementationOnce(async () => {
      const error = new Error('Unique constraint failed');

      Object.assign(error, {
        code: 'P2002',
        meta: { target: ['key'] },
      });

      throw error;
    });

    await expect(
      service.createProject({
        key: 'duplicate-key',
        name: '重复项目',
        owner: '林舟',
      }),
    ).rejects.toThrow('项目 Key 已存在，请换一个。');
  });
});
