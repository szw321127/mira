import { Injectable, UnauthorizedException } from "@nestjs/common";
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

@Injectable()
export class AdminService {
  constructor(private readonly store: AdminStore) {}

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

export function maskSecret(value: string) {
  if (!value) return "";
  if (value.length <= 4) return "*".repeat(value.length);
  const start = value.slice(0, 2);
  const end = value.slice(-2);
  return `${start}${"*".repeat(8)}${end}`;
}
