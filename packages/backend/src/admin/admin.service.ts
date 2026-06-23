import {
  Injectable,
  NotFoundException,
  UnauthorizedException
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import {
  hashPassword,
  signSession,
  verifyPassword,
  verifySession
} from "./admin-auth.js";
import { AdminStore } from "./admin-store.js";
import {
  isManagedSecretKey,
  MANAGED_SECRETS,
  type ManagedSecretKey,
  type ManagedSecretView
} from "./admin.types.js";

const DEFAULT_SESSION_SECRET = "mira-local-admin-session-secret-change-me";
const ADMIN_USERS_PAGE_SIZE = 20;
const ADMIN_USERS_MAX_PAGE = 1000;
const IMAGE_USAGE_WINDOW_DAYS = 30;
type UserStatus = "enabled" | "disabled";
type ImageTaskUsageStatus = "queued" | "running" | "complete" | "failed" | "canceled";
type ImageTaskUsageRow = {
  cost: unknown;
  createdAt: Date;
  status: ImageTaskUsageStatus;
  type: string;
  userId: string;
};
type ImageProviderName = "openai" | "disabled";

@Injectable()
export class AdminService {
  constructor(
    private readonly store: AdminStore,
    private readonly prisma: PrismaService
  ) {}

  get username() {
    return process.env.ADMIN_USERNAME ?? "admin";
  }

  async login(username: string, password: string) {
    if (username !== this.username || !(await this.checkPassword(password))) {
      throw new UnauthorizedException("Invalid admin credentials.");
    }

    return {
      username: this.username,
      token: signSession(this.username, this.sessionSecret)
    };
  }

  verifyToken(token: string | undefined) {
    const session = verifySession(token, this.sessionSecret);
    if (!session || session.username !== this.username) {
      throw new UnauthorizedException("Admin session required.");
    }
    return { username: session.username };
  }

  async changePassword(currentPassword: string, newPassword: string) {
    if (newPassword.trim().length < 8) {
      throw new Error("New password must be at least 8 characters.");
    }

    if (!(await this.checkPassword(currentPassword))) {
      throw new UnauthorizedException("Current password is incorrect.");
    }

    const store = await this.store.read();
    await this.store.write({
      ...store,
      passwordHash: await hashPassword(newPassword)
    });

    return { ok: true };
  }

  async listSecrets(): Promise<ManagedSecretView[]> {
    const store = await this.store.read();

    return MANAGED_SECRETS.map((definition) => {
      const rawValue = store.secrets?.[definition.key] ?? "";
      return {
        key: definition.key,
        label: definition.label,
        value: definition.sensitive ? maskSecret(rawValue) : rawValue,
        masked: definition.sensitive && rawValue.length > 0
      };
    });
  }

  async updateSecrets(values: Record<string, unknown>) {
    const store = await this.store.read();
    const nextSecrets: Partial<Record<ManagedSecretKey, string>> = {
      ...(store.secrets ?? {})
    };

    for (const [key, value] of Object.entries(values)) {
      if (!isManagedSecretKey(key) || typeof value !== "string") continue;
      nextSecrets[key] = value;
    }

    await this.store.write({
      ...store,
      secrets: nextSecrets
    });

    return { secrets: await this.listSecrets() };
  }

  async listUsers(options: {
    query?: string;
    status?: UserStatus;
    page?: number;
  }) {
    const requestedPage =
      typeof options.page === "number" && Number.isFinite(options.page)
        ? Math.floor(options.page)
        : 1;
    const page = Number.isSafeInteger(requestedPage)
      ? Math.min(ADMIN_USERS_MAX_PAGE, Math.max(1, requestedPage))
      : 1;
    const query = options.query?.trim().toLowerCase();
    const where = {
      ...(query
        ? {
            OR: [
              { email: { contains: query, mode: "insensitive" as const } },
              { username: { contains: query, mode: "insensitive" as const } }
            ]
          }
        : {}),
      ...(options.status ? { status: options.status } : {})
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * ADMIN_USERS_PAGE_SIZE,
        take: ADMIN_USERS_PAGE_SIZE,
        include: { _count: { select: { conversations: true } } }
      }),
      this.prisma.user.count({ where })
    ]);

    return {
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        username: user.username,
        emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
        authMethods: readUserAuthMethods(user),
        status: user.status,
        createdAt: user.createdAt.toISOString(),
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        conversationCount: user._count.conversations
      })),
      total,
      page,
      pageSize: ADMIN_USERS_PAGE_SIZE
    };
  }

  async listImageUsage() {
    const startedAt = new Date(
      Date.now() - IMAGE_USAGE_WINDOW_DAYS * 24 * 60 * 60 * 1000
    );
    const tasks = (await this.prisma.imageTask.findMany({
      where: {
        createdAt: {
          gte: startedAt
        }
      },
      select: {
        cost: true,
        createdAt: true,
        status: true,
        type: true,
        userId: true
      }
    })) as ImageTaskUsageRow[];

    const statusCounts = {
      canceled: 0,
      complete: 0,
      failed: 0,
      queued: 0,
      running: 0
    } satisfies Record<ImageTaskUsageStatus, number>;
    const activeUsers = new Set<string>();
    const byProvider = new Map<string, { estimatedCostUsd: number; taskCount: number }>();
    const byType = new Map<string, { estimatedCostUsd: number; taskCount: number }>();
    let estimatedCostUsd = 0;

    for (const task of tasks) {
      statusCounts[task.status] = (statusCounts[task.status] ?? 0) + 1;
      activeUsers.add(task.userId);

      const cost = readImageTaskCost(task.cost);
      estimatedCostUsd += cost.estimatedCostUsd;
      addUsageGroup(byProvider, cost.provider, cost.estimatedCostUsd);
      addUsageGroup(byType, task.type, cost.estimatedCostUsd);
    }

    return {
      activeUsers: activeUsers.size,
      byProvider: mapUsageGroups(byProvider, "provider"),
      byType: mapUsageGroups(byType, "type"),
      estimatedCostUsd: roundUsd(estimatedCostUsd),
      statusCounts,
      totalTasks: tasks.length,
      windowDays: IMAGE_USAGE_WINDOW_DAYS
    };
  }

  async testImageProvider() {
    const store = await this.store.read();
    const secrets = store.secrets ?? {};
    const provider = normalizeImageProvider(secrets.IMAGE_PROVIDER ?? "openai");

    if (provider === "disabled") {
      return {
        configured: false,
        missingKeys: [],
        model: null,
        ok: false,
        provider,
        message: "图像生成功能已关闭"
      };
    }

    const missingKeys = secrets.OPENAI_IMAGE_API_KEY?.trim()
      ? []
      : ["OPENAI_IMAGE_API_KEY"];
    const baseURL = secrets.OPENAI_IMAGE_BASE_URL?.trim() || "";
    const model = secrets.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1";
    const configured = missingKeys.length === 0;
    const reachable = configured
      ? await validateOpenAIImageProvider(
          secrets.OPENAI_IMAGE_API_KEY ?? "",
          model,
          baseURL
        )
      : false;

    return {
      configured,
      missingKeys,
      model,
      ok: configured && reachable,
      provider,
      message: configured
        ? reachable
          ? "图像 Provider 配置可用"
          : "图像 Provider 校验失败，请检查 Key 或模型"
        : "图像 Provider 缺少必要配置"
    };
  }

  async updateUserStatus(userId: string, status: UserStatus) {
    const user = await this.updateUserStatusRow(userId, status);

    if (status === "disabled") {
      await this.prisma.userSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() }
      });
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
        authMethods: readUserAuthMethods(user),
        status: user.status,
        createdAt: user.createdAt.toISOString(),
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null
      }
    };
  }

  private async updateUserStatusRow(userId: string, status: UserStatus) {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: { status }
      });
    } catch (error) {
      if (isPrismaNotFoundError(error)) {
        throw new NotFoundException("User not found.");
      }
      throw error;
    }
  }

  private async checkPassword(password: string) {
    const store = await this.store.read();
    const passwordHash = store.passwordHash ?? process.env.ADMIN_PASSWORD_HASH;

    if (passwordHash) {
      return verifyPassword(password, passwordHash);
    }

    return password === (process.env.ADMIN_PASSWORD ?? "admin12345");
  }

  private get sessionSecret() {
    return (
      process.env.SESSION_SECRET ??
      process.env.ADMIN_SESSION_SECRET ??
      DEFAULT_SESSION_SECRET
    );
  }
}

function readUserAuthMethods(user: {
  email: string | null;
  passwordHash?: string | null;
}) {
  const methods: string[] = [];
  if (user.email) methods.push("email");
  if (user.passwordHash) methods.push("password");
  return methods;
}

function isPrismaNotFoundError(error: unknown) {
  return (
    Boolean(error) &&
    typeof error === "object" &&
    (error as { code?: unknown }).code === "P2025"
  );
}

export function maskSecret(value: string) {
  if (!value) return "";
  if (value.length <= 4) return "*".repeat(value.length);
  const start = value.slice(0, 2);
  const end = value.slice(-2);
  return `${start}${"*".repeat(8)}${end}`;
}

function readImageTaskCost(value: unknown): {
  estimatedCostUsd: number;
  provider: string;
} {
  if (!isRecord(value)) {
    return {
      estimatedCostUsd: 0,
      provider: "unknown"
    };
  }

  return {
    estimatedCostUsd: readFiniteNumber(value.estimatedCostUsd),
    provider: typeof value.provider === "string" && value.provider.trim()
      ? value.provider.trim()
      : "unknown"
  };
}

function addUsageGroup(
  groups: Map<string, { estimatedCostUsd: number; taskCount: number }>,
  key: string,
  estimatedCostUsd: number
) {
  const current = groups.get(key) ?? { estimatedCostUsd: 0, taskCount: 0 };
  groups.set(key, {
    estimatedCostUsd: current.estimatedCostUsd + estimatedCostUsd,
    taskCount: current.taskCount + 1
  });
}

function mapUsageGroups(
  groups: Map<string, { estimatedCostUsd: number; taskCount: number }>,
  keyName: "provider" | "type"
) {
  return [...groups.entries()]
    .map(([key, value]) => ({
      [keyName]: key,
      estimatedCostUsd: roundUsd(value.estimatedCostUsd),
      taskCount: value.taskCount
    }))
    .sort((left, right) => {
      if (right.taskCount !== left.taskCount) return right.taskCount - left.taskCount;
      return String(left[keyName]).localeCompare(String(right[keyName]));
    });
}

function readFiniteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeImageProvider(value: string): ImageProviderName {
  return value.trim().toLowerCase() === "disabled" ? "disabled" : "openai";
}

async function validateOpenAIImageProvider(
  apiKey: string,
  model: string,
  baseURL: string
) {
  try {
    const response = await fetch(
      `${normalizeOpenAIBaseURL(baseURL)}/models/${encodeURIComponent(model)}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        method: "GET"
      }
    );
    await response.json().catch(() => ({}));
    return response.ok;
  } catch {
    return false;
  }
}

function normalizeOpenAIBaseURL(baseURL: string) {
  const trimmed = baseURL.trim();
  return (trimmed || "https://api.openai.com/v1").replace(/\/+$/, "");
}
