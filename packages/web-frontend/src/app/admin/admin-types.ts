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
  email: string;
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
