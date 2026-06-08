const API_BASE_URL =
  import.meta.env.VITE_BACKEND_URL ?? "http://localhost:3001";

export type ApiEnvelope<T> = {
  code: number;
  data: T;
  msg: string;
};

export class ApiError extends Error {
  code: number;
  status: number;

  constructor(code: number, message: string, status = code) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export type AdminProjectStatus = "进行中" | "规划中" | "风险" | "已上线";

export type AdminProject = {
  budget: string;
  dueDate: string;
  key: string;
  name: string;
  owner: string;
  priority: "P0" | "P1" | "P2";
  progress: number;
  riskEscalationOwner?: string;
  riskLatestUpdate?: string;
  riskNextAction?: string;
  riskReason?: string;
  riskSeverity?: "高" | "中" | "低";
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
  status: "待开始" | "推进中" | "验收中" | "已完成";
};

export type AdminNotification = {
  createdAt: string;
  description: string;
  id: string;
  title: string;
};

export type AdminDashboard = {
  capabilities: {
    canCreateProject: boolean;
  };
  metrics: {
    activeProjects: number;
    averageProgress: number;
    riskProjects: number;
    totalProjects: number;
    weeklyCompletedTasks: number;
  };
  notifications: AdminNotification[];
  projects: AdminProject[];
  riskQueue: AdminProject[];
  tasks: AdminTask[];
};

function isApiEnvelope(value: unknown): value is ApiEnvelope<unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  return (
    typeof record.code === "number" &&
    "data" in record &&
    typeof record.msg === "string"
  );
}

function normalizeApiError(error: unknown) {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof Error) {
    return new ApiError(0, error.message, 0);
  }

  return new ApiError(0, "请求失败，请稍后重试。", 0);
}

export function getApiErrorMessage(error: unknown) {
  return normalizeApiError(error).message;
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  const payload: unknown = await response.json().catch(() => null);

  if (!isApiEnvelope(payload)) {
    throw new ApiError(response.status, "接口返回格式异常。", response.status);
  }

  if (!response.ok || payload.code !== 0) {
    throw new ApiError(payload.code || response.status, payload.msg, response.status);
  }

  return payload.data as T;
}

export function loadProjectManagementDashboard() {
  return request<AdminDashboard>("/admin/projects/dashboard");
}
