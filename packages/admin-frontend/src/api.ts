const API_BASE_URL =
  import.meta.env.VITE_BACKEND_URL ?? "http://localhost:3001";
const ADMIN_ACCESS_TOKEN_STORAGE_KEY = "rednote-admin-access-token";

function getStoredAdminAccessToken() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(ADMIN_ACCESS_TOKEN_STORAGE_KEY);
}

let adminAccessToken: string | null = getStoredAdminAccessToken();

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

export type AdminProfile = {
  account: string;
  createdAt: string;
  displayName: string;
  id: string;
  lastLoginAt: string | null;
  updatedAt: string;
};

export type AdminLoginInput = {
  account: string;
  password: string;
};

export type AdminLoginResponse = {
  accessToken: string;
  admin: AdminProfile;
};

export type UpdateAdminProfileInput = {
  displayName: string;
};

export type ChangeAdminPasswordInput = {
  currentPassword: string;
  newPassword: string;
};

export type AdminProjectStatus = "进行中" | "规划中" | "风险" | "已上线";

export type AdminProjectPriority = "P0" | "P1" | "P2";

export type AdminProject = {
  budget: string;
  dueDate: string;
  key: string;
  name: string;
  owner: string;
  priority: AdminProjectPriority;
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
  projectKey: string | null;
  status: AdminTaskStatus;
};

export type AdminTaskStatus = "待开始" | "推进中" | "验收中" | "已完成";

export type AdminNotification = {
  createdAt: string;
  description: string;
  id: string;
  title: string;
};

export type AdminAuditLog = {
  action: string;
  actor: string;
  createdAt: string;
  id: string;
  metadata: Record<string, unknown>;
  targetKey: string;
  targetType: string;
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

export type CreateAdminProjectInput = {
  budget?: string;
  dueDate?: string;
  key?: string;
  name: string;
  owner: string;
  priority?: AdminProjectPriority;
  progress?: number;
  status?: AdminProjectStatus;
  team?: string[];
};

export type CreateAdminTaskInput = {
  assignee: string;
  dueDate: string;
  key?: string;
  name: string;
  projectKey?: string;
  status?: AdminTaskStatus;
};

export type UpdateAdminTaskInput = Partial<
  Pick<
    CreateAdminTaskInput,
    "assignee" | "dueDate" | "name" | "projectKey" | "status"
  >
>;

export type AdminModelConfigType = "text" | "image";

export type AdminModelApiKey = {
  apiKeyPreview: string | null;
  createdAt: string;
  enabled: boolean;
  id: string;
  name: string;
  type: AdminModelConfigType;
  updatedAt: string;
};

export type AdminModelConfig = {
  apiKeys: AdminModelApiKey[];
  apiKeyPreview: string | null;
  baseUrl: string;
  hasApiKey: boolean;
  modelName: string;
  type: AdminModelConfigType;
  updatedAt: string | null;
};

export type AdminModelConnectionTestResult = {
  checkedAt: string;
  endpoint: string;
  modelName: string;
  ok: true;
  type: AdminModelConfigType;
};

export type SaveModelConfigInput = {
  apiKey?: string;
  baseUrl: string;
  modelName: string;
};

export type CreateModelApiKeyInput = {
  apiKey: string;
  enabled?: boolean;
  name: string;
};

export type UpdateModelApiKeyInput = {
  apiKey?: string;
  enabled?: boolean;
  name?: string;
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

type RequestOptions = {
  body?: unknown;
  method?: string;
  skipAuth?: boolean;
};

export function getAdminAccessToken() {
  return adminAccessToken;
}

export function setAdminAccessToken(token: string | null) {
  adminAccessToken = token;

  if (typeof window === "undefined") {
    return;
  }

  if (token) {
    window.localStorage.setItem(ADMIN_ACCESS_TOKEN_STORAGE_KEY, token);
    return;
  }

  window.localStorage.removeItem(ADMIN_ACCESS_TOKEN_STORAGE_KEY);
}

async function request<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const headers = new Headers();

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  if (adminAccessToken && !options.skipAuth) {
    headers.set("Authorization", `Bearer ${adminAccessToken}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers,
    method: options.method ?? "GET",
  });
  const payload: unknown = await response.json().catch(() => null);

  if (!isApiEnvelope(payload)) {
    throw new ApiError(response.status, "接口返回格式异常。", response.status);
  }

  if (!response.ok || payload.code !== 0) {
    throw new ApiError(
      payload.code || response.status,
      payload.msg,
      response.status,
    );
  }

  return payload.data as T;
}

export function loginAdmin(body: AdminLoginInput) {
  return request<AdminLoginResponse>("/admin/auth/login", {
    body,
    method: "POST",
    skipAuth: true,
  });
}

export function loadAdminProfile() {
  return request<AdminProfile>("/admin/auth/me");
}

export function updateAdminProfile(body: UpdateAdminProfileInput) {
  return request<AdminProfile>("/admin/auth/profile", {
    body,
    method: "PATCH",
  });
}

export function changeAdminPassword(body: ChangeAdminPasswordInput) {
  return request<AdminProfile>("/admin/auth/password", {
    body,
    method: "PATCH",
  });
}

export function loadProjectManagementDashboard() {
  return request<AdminDashboard>("/admin/projects/dashboard");
}

export function loadAdminAuditLogs(limit = 50) {
  return request<AdminAuditLog[]>(`/admin/audit-logs?limit=${limit}`);
}

export function createAdminProject(body: CreateAdminProjectInput) {
  return request<AdminProject>("/admin/projects", {
    body,
    method: "POST",
  });
}

export function createAdminTask(body: CreateAdminTaskInput) {
  return request<AdminTask>("/admin/projects/tasks", {
    body,
    method: "POST",
  });
}

export function updateAdminTask(key: string, body: UpdateAdminTaskInput) {
  return request<AdminTask>(`/admin/projects/tasks/${key}`, {
    body,
    method: "PATCH",
  });
}

export function deleteAdminTask(key: string) {
  return request<{ key: string }>(`/admin/projects/tasks/${key}`, {
    method: "DELETE",
  });
}

export function loadModelConfigs() {
  return request<AdminModelConfig[]>("/admin/model-configs");
}

export function saveModelConfig(
  type: AdminModelConfigType,
  body: SaveModelConfigInput,
) {
  return request<AdminModelConfig>(`/admin/model-configs/${type}`, {
    body,
    method: "PUT",
  });
}

export function createModelApiKey(
  type: AdminModelConfigType,
  body: CreateModelApiKeyInput,
) {
  return request<AdminModelApiKey>(`/admin/model-configs/${type}/api-keys`, {
    body,
    method: "POST",
  });
}

export function updateModelApiKey(
  type: AdminModelConfigType,
  keyId: string,
  body: UpdateModelApiKeyInput,
) {
  return request<AdminModelApiKey>(
    `/admin/model-configs/${type}/api-keys/${keyId}`,
    {
      body,
      method: "PATCH",
    },
  );
}

export function deleteModelApiKey(type: AdminModelConfigType, keyId: string) {
  return request<AdminModelApiKey>(
    `/admin/model-configs/${type}/api-keys/${keyId}`,
    {
      method: "DELETE",
    },
  );
}

export function testModelConfigConnection(type: AdminModelConfigType) {
  return request<AdminModelConnectionTestResult>(
    `/admin/model-configs/${type}/test`,
    {
      method: "POST",
    },
  );
}
