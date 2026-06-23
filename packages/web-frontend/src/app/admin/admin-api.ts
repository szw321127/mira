import type {
  AdminImageProviderTestResponse,
  AdminImageUsageResponse,
  AdminSession,
  AdminUser,
  AdminUsersResponse,
  AdminUserStatus,
  ManagedSecret,
} from "./admin-types";

type BackendMessage = {
  message?: string;
  error?: string;
};

async function readJson<T>(response: Response): Promise<T> {
  const value: unknown = await response.json().catch(() => ({}));
  return value as T;
}

async function assertOk(response: Response, fallback: string) {
  if (response.ok) return;

  const body = await readJson<BackendMessage>(response);
  throw new Error(body.message || body.error || fallback);
}

export async function loadInitialAdminState() {
  const sessionResponse = await fetch("/api/admin/session");
  if (!sessionResponse.ok) {
    return { session: null, secrets: [] };
  }

  const session = await readJson<AdminSession>(sessionResponse);
  const secrets = await loadAdminSecrets().catch(() => []);
  return { session, secrets };
}

export async function loginAdmin(username: string, password: string) {
  const response = await fetch("/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  await assertOk(response, "管理员账号或密码不正确");
  return readJson<AdminSession>(response);
}

export async function logoutAdmin() {
  const response = await fetch("/api/admin/logout", { method: "POST" });
  await assertOk(response, "退出登录失败");
}

export async function changeAdminPassword(
  currentPassword: string,
  newPassword: string,
) {
  const response = await fetch("/api/admin/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  await assertOk(response, "密码修改失败，请检查当前密码");
}

export async function loadAdminSecrets() {
  const response = await fetch("/api/admin/secrets");
  await assertOk(response, "Key 加载失败");
  const data = await readJson<{ secrets: ManagedSecret[] }>(response);
  return data.secrets;
}

export async function saveAdminSecrets(values: Record<string, string>) {
  const response = await fetch("/api/admin/secrets", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ secrets: values }),
  });
  await assertOk(response, "Key 保存失败");
  const data = await readJson<{ secrets: ManagedSecret[] }>(response);
  return data.secrets;
}

export async function loadAdminUsers(options: {
  query?: string;
  status?: AdminUserStatus;
  page?: number;
}) {
  const params = new URLSearchParams();
  if (options.query?.trim()) params.set("query", options.query.trim());
  if (options.status) params.set("status", options.status);
  if (options.page && options.page > 1) params.set("page", String(options.page));

  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const response = await fetch(`/api/admin/users${suffix}`);
  await assertOk(response, "账号列表加载失败");
  return readJson<AdminUsersResponse>(response);
}

export async function loadAdminImageUsage() {
  const response = await fetch("/api/admin/image-usage");
  await assertOk(response, "图像用量加载失败");
  return readJson<AdminImageUsageResponse>(response);
}

export async function testAdminImageProvider() {
  const response = await fetch("/api/admin/image-provider/test", {
    method: "POST",
  });
  await assertOk(response, "图像 Provider 测试失败");
  return readJson<AdminImageProviderTestResponse>(response);
}

export async function updateAdminUserStatus(
  id: string,
  status: AdminUserStatus,
) {
  const response = await fetch(
    `/api/admin/users/${encodeURIComponent(id)}/status`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    },
  );
  await assertOk(response, "账号状态更新失败");
  return readJson<{ user: AdminUser }>(response);
}
