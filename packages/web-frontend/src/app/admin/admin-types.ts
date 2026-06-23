export type AdminSession = {
  username: string;
};

export type ManagedSecret = {
  key: string;
  label: string;
  value: string;
  masked: boolean;
};

export type AdminUserStatus = "enabled" | "disabled";

export type AdminUser = {
  id: string;
  email: string | null;
  username: string | null;
  emailVerifiedAt: string | null;
  authMethods: string[];
  status: AdminUserStatus;
  createdAt: string;
  lastLoginAt: string | null;
  conversationCount?: number;
};

export type AdminUsersResponse = {
  users: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
};

export type AdminImageUsageStatusCounts = {
  canceled: number;
  complete: number;
  failed: number;
  queued: number;
  running: number;
};

export type AdminImageUsageProvider = {
  provider: string;
  taskCount: number;
  estimatedCostUsd: number;
};

export type AdminImageUsageType = {
  type: string;
  taskCount: number;
  estimatedCostUsd: number;
};

export type AdminImageUsageResponse = {
  activeUsers: number;
  byProvider: AdminImageUsageProvider[];
  byType: AdminImageUsageType[];
  estimatedCostUsd: number;
  statusCounts: AdminImageUsageStatusCounts;
  totalTasks: number;
  windowDays: number;
};

export type AdminImageProviderTestResponse = {
  configured: boolean;
  missingKeys: string[];
  model: string | null;
  ok: boolean;
  provider: "openai" | "disabled";
  message: string;
};
