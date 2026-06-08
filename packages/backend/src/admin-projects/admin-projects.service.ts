import { Injectable } from '@nestjs/common';
import type {
  AdminNotification,
  AdminProject,
  AdminProjectsDashboard,
  AdminTask,
} from './admin-projects.types';

const projects: AdminProject[] = [
  {
    budget: '18.4w',
    dueDate: '06/28',
    key: 'rednote-admin',
    name: 'RedNote 后台项目管理系统',
    owner: '林舟',
    priority: 'P0',
    progress: 68,
    status: '进行中',
    taskDone: 21,
    taskTotal: 31,
    team: ['林舟', '阿遥', 'Mia'],
  },
  {
    budget: '9.6w',
    dueDate: '07/05',
    key: 'creator-workbench',
    name: '创作工作台体验优化',
    owner: '阿遥',
    priority: 'P1',
    progress: 82,
    status: '进行中',
    taskDone: 36,
    taskTotal: 44,
    team: ['阿遥', 'Kevin'],
  },
  {
    budget: '12.8w',
    dueDate: '07/18',
    key: 'asset-pipeline',
    name: '封面资产生成链路',
    owner: 'Mia',
    priority: 'P1',
    progress: 46,
    riskEscalationOwner: '林舟',
    riskLatestUpdate: '今天 14:20 Mia 标记重试失败率上升',
    riskNextAction: '今晚前补齐失败重试与告警阈值',
    riskReason: '封面生成失败后的重试链路未闭环，可能影响 07/18 联调',
    riskSeverity: '高',
    status: '风险',
    taskDone: 14,
    taskTotal: 30,
    team: ['Mia', '林舟', 'Eli'],
  },
  {
    budget: '6.1w',
    dueDate: '08/02',
    key: 'ops-insight',
    name: '运营数据看板',
    owner: 'Kevin',
    priority: 'P2',
    progress: 24,
    status: '规划中',
    taskDone: 5,
    taskTotal: 21,
    team: ['Kevin', 'Eli'],
  },
];

const tasks: AdminTask[] = [
  {
    assignee: '林舟',
    dueDate: '今天',
    key: 't-1',
    name: '定义后台项目详情抽屉信息结构',
    project: 'RedNote 后台项目管理系统',
    status: '推进中',
  },
  {
    assignee: '阿遥',
    dueDate: '明天',
    key: 't-2',
    name: '压缩工作台想法和大纲垂直间距',
    project: '创作工作台体验优化',
    status: '验收中',
  },
  {
    assignee: 'Mia',
    dueDate: '06/12',
    key: 't-3',
    name: '补齐封面生成失败后的重试状态',
    project: '封面资产生成链路',
    status: '待开始',
  },
  {
    assignee: 'Kevin',
    dueDate: '06/18',
    key: 't-4',
    name: '整理运营指标口径',
    project: '运营数据看板',
    status: '已完成',
  },
];

const notifications: AdminNotification[] = [];

@Injectable()
export class AdminProjectsService {
  getDashboard(): AdminProjectsDashboard {
    const riskQueue = projects.filter((project) => project.status === '风险');

    return {
      capabilities: {
        canCreateProject: false,
      },
      metrics: {
        activeProjects: projects.filter((project) =>
          ['进行中', '风险'].includes(project.status),
        ).length,
        averageProgress: Math.round(
          projects.reduce((sum, project) => sum + project.progress, 0) /
            projects.length,
        ),
        riskProjects: riskQueue.length,
        totalProjects: projects.length,
        weeklyCompletedTasks: 42,
      },
      notifications,
      projects,
      riskQueue,
      tasks,
    };
  }
}
