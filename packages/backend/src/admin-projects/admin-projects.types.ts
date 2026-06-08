export type AdminProjectStatus = '进行中' | '规划中' | '风险' | '已上线';

export type AdminProject = {
  budget: string;
  dueDate: string;
  key: string;
  name: string;
  owner: string;
  priority: 'P0' | 'P1' | 'P2';
  progress: number;
  riskEscalationOwner?: string;
  riskLatestUpdate?: string;
  riskNextAction?: string;
  riskReason?: string;
  riskSeverity?: '高' | '中' | '低';
  status: AdminProjectStatus;
  taskDone: number;
  taskTotal: number;
  team: string[];
};

export type AdminTask = {
  assignee: string;
  dueDate: string;
  key: string;
  name: string;
  project: string;
  status: '待开始' | '推进中' | '验收中' | '已完成';
};

export type AdminNotification = {
  createdAt: string;
  description: string;
  id: string;
  title: string;
};

export type AdminDashboardMetrics = {
  activeProjects: number;
  averageProgress: number;
  riskProjects: number;
  totalProjects: number;
  weeklyCompletedTasks: number;
};

export type AdminProjectsDashboard = {
  capabilities: {
    canCreateProject: boolean;
  };
  metrics: AdminDashboardMetrics;
  notifications: AdminNotification[];
  projects: AdminProject[];
  riskQueue: AdminProject[];
  tasks: AdminTask[];
};
