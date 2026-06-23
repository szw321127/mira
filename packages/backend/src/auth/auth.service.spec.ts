import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import { jest } from "@jest/globals";
import type { PrismaService } from "../database/prisma.service.js";
import { AuthService } from "./auth.service.js";
import type { EmailCodeService } from "./email-code.service.js";
import type { MailerService } from "./mailer.service.js";
import type { UserSessionService } from "./user-session.service.js";

type UserRow = {
  id: string;
  email: string | null;
  username: string | null;
  passwordHash: string | null;
  status: "enabled" | "disabled";
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
};

type MockEmailCodeService = Pick<
  jest.Mocked<EmailCodeService>,
  "createCode" | "invalidateLatestUnused" | "verifyCode"
>;

type MockMailerService = Pick<jest.Mocked<MailerService>, "sendVerificationCode">;

type MockUserSessionService = Pick<
  jest.Mocked<UserSessionService>,
  "createSession"
>;

function createPrisma(initialUsers: UserRow[] = []) {
  const users = [...initialUsers];
  const create = jest.fn(
    ({
      data
    }: {
      data: Pick<
        UserRow,
        "username" | "email" | "passwordHash" | "emailVerifiedAt" | "lastLoginAt"
      >;
    }) => {
      const user = {
        id: `user-${users.length + 1}`,
        email: data.email,
        username: data.username,
        passwordHash: data.passwordHash,
        emailVerifiedAt: data.emailVerifiedAt,
        status: "enabled" as const,
        lastLoginAt: data.lastLoginAt
      };
      users.push(user);
      return Promise.resolve(user);
    }
  );
  const update = jest.fn(
    ({
      where,
      data
    }: {
      where: { id: string };
      data: Partial<Pick<UserRow, "email" | "emailVerifiedAt" | "lastLoginAt">>;
    }) => {
      const user = users.find((item) => item.id === where.id);
      if (!user) return Promise.reject(new Error("Missing user"));
      Object.assign(user, data);
      return Promise.resolve(user);
    }
  );
  const upsert = jest.fn(
    ({
      where,
      create,
      update
    }: {
      where: { email: string };
      create: Pick<UserRow, "email" | "lastLoginAt">;
      update: Pick<UserRow, "lastLoginAt">;
    }) => {
      let user = users.find((item) => item.email === where.email);
      if (!user) {
        user = {
          id: `user-${users.length + 1}`,
          email: create.email,
          username: null,
          passwordHash: null,
          emailVerifiedAt: create.lastLoginAt,
          status: "enabled",
          lastLoginAt: create.lastLoginAt
        };
        users.push(user);
      } else {
        user.lastLoginAt = update.lastLoginAt;
      }
      return Promise.resolve(user);
    }
  );
  const prisma = {
    user: {
      create,
      findFirst: jest.fn(({ where }: { where: { OR: Array<Record<string, string>> } }) => {
        return Promise.resolve(
          users.find((item) => {
            return where.OR.some((condition) => {
              if ("email" in condition) return item.email === condition.email;
              if ("username" in condition) return item.username === condition.username;
              return false;
            });
          }) ?? null
        );
      }),
      findUnique: jest.fn(({ where }: { where: { email?: string; username?: string; id?: string } }) => {
        return Promise.resolve(
          users.find((item) => {
            if (where.email) return item.email === where.email;
            if (where.username) return item.username === where.username;
            if (where.id) return item.id === where.id;
            return false;
          }) ?? null
        );
      }),
      update,
      upsert
    }
  };

  return { prisma: prisma as unknown as PrismaService, users, create, update, upsert };
}

function createService(prisma: PrismaService) {
  const codeService = {
    createCode: jest.fn(),
    invalidateLatestUnused: jest.fn(() => Promise.resolve()),
    verifyCode: jest.fn(() => Promise.resolve())
  } satisfies MockEmailCodeService;
  const mailer = {
    ensureCanSendVerificationCode: jest.fn(() => Promise.resolve()),
    sendVerificationCode: jest.fn(() => Promise.resolve())
  } satisfies MockMailerService & {
    ensureCanSendVerificationCode: jest.Mock<() => Promise<void>>;
  };
  const sessions = {
    createSession: jest.fn(() => Promise.resolve("session-token"))
  } satisfies MockUserSessionService;

  return {
    service: new AuthService(
      prisma,
      codeService as EmailCodeService,
      mailer as MailerService,
      sessions as UserSessionService
    ),
    codeService,
    mailer,
    sessions
  };
}

describe("AuthService", () => {
  it("does not create a code when mailer preflight fails", async () => {
    const { prisma } = createPrisma();
    const { service, codeService, mailer } = createService(prisma);
    mailer.ensureCanSendVerificationCode.mockRejectedValueOnce(
      new ServiceUnavailableException("邮件服务未配置，请联系管理员")
    );

    await expect(
      service.requestCode("User@Example.COM", "203.0.113.10")
    ).rejects.toThrow(
      new ServiceUnavailableException("邮件服务未配置，请联系管理员")
    );
    expect(mailer.ensureCanSendVerificationCode).toHaveBeenCalledTimes(1);
    expect(codeService.createCode).not.toHaveBeenCalled();
    expect(mailer.sendVerificationCode).not.toHaveBeenCalled();
  });

  it("creates and sends a code after mailer preflight passes", async () => {
    const { prisma } = createPrisma();
    const { service, codeService, mailer } = createService(prisma);
    codeService.createCode.mockResolvedValueOnce("123456");

    await expect(
      service.requestCode("User@Example.COM", "203.0.113.10")
    ).resolves.toEqual({ ok: true });
    expect(mailer.ensureCanSendVerificationCode).toHaveBeenCalledTimes(1);
    expect(codeService.createCode).toHaveBeenCalledWith(
      "user@example.com",
      "203.0.113.10"
    );
    expect(mailer.sendVerificationCode).toHaveBeenCalledWith(
      "user@example.com",
      "123456"
    );
  });

  it("returns ok for disabled-user code requests without creating or sending a code", async () => {
    const { prisma } = createPrisma([
      {
        id: "user-1",
        email: "user@example.com",
        username: null,
        passwordHash: null,
        status: "disabled",
        emailVerifiedAt: new Date("2026-06-01T00:00:00.000Z"),
        lastLoginAt: null
      }
    ]);
    const { service, codeService, mailer } = createService(prisma);

    await expect(
      service.requestCode("User@Example.COM", "203.0.113.10")
    ).resolves.toEqual({ ok: true });

    expect(mailer.ensureCanSendVerificationCode).not.toHaveBeenCalled();
    expect(codeService.createCode).not.toHaveBeenCalled();
    expect(mailer.sendVerificationCode).not.toHaveBeenCalled();
  });

  it("invalidates the latest unused code when sending fails", async () => {
    const { prisma } = createPrisma();
    const { service, codeService, mailer } = createService(prisma);
    const sendError = new Error("resend send failed");
    codeService.createCode.mockResolvedValueOnce("123456");
    mailer.sendVerificationCode.mockRejectedValueOnce(sendError);

    await expect(
      service.requestCode("user@example.com", "203.0.113.10")
    ).rejects.toThrow(sendError);

    expect(codeService.invalidateLatestUnused).toHaveBeenCalledWith(
      "user@example.com"
    );
  });

  it("creates a new user and session after code verification", async () => {
    const { prisma, users } = createPrisma();
    const { service, codeService, sessions } = createService(prisma);

    await expect(service.login("User@Example.COM", "123456")).resolves.toEqual({
      user: {
        id: "user-1",
        email: "user@example.com",
        username: null,
        status: "enabled"
      },
      token: "session-token"
    });
    expect(codeService.verifyCode).toHaveBeenCalledWith(
      "user@example.com",
      "123456"
    );
    expect(sessions.createSession).toHaveBeenCalledWith("user-1");
    expect(users[0]?.lastLoginAt).toBeInstanceOf(Date);
  });

  it("rejects disabled users without consuming a code or creating a session", async () => {
    const lastLoginAt = new Date("2026-06-01T00:00:00.000Z");
    const { prisma, upsert } = createPrisma([
      {
        id: "user-1",
        email: "user@example.com",
        username: null,
        passwordHash: null,
        status: "disabled",
        emailVerifiedAt: new Date("2026-06-01T00:00:00.000Z"),
        lastLoginAt
      }
    ]);
    const { service, codeService, sessions } = createService(prisma);

    await expect(service.login("user@example.com", "123456")).rejects.toThrow(
      new ForbiddenException("账号已被禁用，请联系管理员")
    );
    expect(codeService.verifyCode).not.toHaveBeenCalled();
    expect(sessions.createSession).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("registers a password account without requiring an email", async () => {
    const { prisma, users } = createPrisma();
    const { service, sessions } = createService(prisma);

    await expect(
      service.registerWithPassword(" MiraUser ", "strong-pass-123")
    ).resolves.toEqual({
      user: {
        id: "user-1",
        email: null,
        username: "mirauser",
        status: "enabled"
      },
      token: "session-token"
    });

    expect(users[0]?.username).toBe("mirauser");
    expect(users[0]?.email).toBeNull();
    expect(users[0]?.passwordHash).toMatch(/^scrypt:/);
    expect(sessions.createSession).toHaveBeenCalledWith("user-1");
  });

  it("rejects duplicate usernames during password registration", async () => {
    const { prisma } = createPrisma([
      {
        id: "user-1",
        email: null,
        username: "mirauser",
        passwordHash: "scrypt:salt:key",
        status: "enabled",
        emailVerifiedAt: null,
        lastLoginAt: null
      }
    ]);
    const { service } = createService(prisma);

    await expect(
      service.registerWithPassword("MiraUser", "strong-pass-123")
    ).rejects.toThrow(new ConflictException("账号名已被使用"));
  });

  it("logs in password users by username and refreshes last login time", async () => {
    const { hashPassword } = await import("../security/password-hash.js");
    const passwordHash = await hashPassword("strong-pass-123");
    const { prisma, users } = createPrisma([
      {
        id: "user-1",
        email: "user@example.com",
        username: "mirauser",
        passwordHash,
        status: "enabled",
        emailVerifiedAt: new Date("2026-06-01T00:00:00.000Z"),
        lastLoginAt: null
      }
    ]);
    const { service, sessions } = createService(prisma);

    await expect(
      service.loginWithPassword("MIRAUSER", "strong-pass-123")
    ).resolves.toEqual({
      user: {
        id: "user-1",
        email: "user@example.com",
        username: "mirauser",
        status: "enabled"
      },
      token: "session-token"
    });

    expect(users[0]?.lastLoginAt).toBeInstanceOf(Date);
    expect(sessions.createSession).toHaveBeenCalledWith("user-1");
  });

  it("rejects invalid password login attempts", async () => {
    const { hashPassword } = await import("../security/password-hash.js");
    const { prisma } = createPrisma([
      {
        id: "user-1",
        email: null,
        username: "mirauser",
        passwordHash: await hashPassword("strong-pass-123"),
        status: "enabled",
        emailVerifiedAt: null,
        lastLoginAt: null
      }
    ]);
    const { service, sessions } = createService(prisma);

    await expect(
      service.loginWithPassword("mirauser", "wrong-pass")
    ).rejects.toThrow(new UnauthorizedException("账号或密码不正确"));
    expect(sessions.createSession).not.toHaveBeenCalled();
  });

  it("binds a verified email to a password account", async () => {
    const { hashPassword } = await import("../security/password-hash.js");
    const { prisma, users } = createPrisma([
      {
        id: "user-1",
        email: null,
        username: "mirauser",
        passwordHash: await hashPassword("strong-pass-123"),
        status: "enabled",
        emailVerifiedAt: null,
        lastLoginAt: null
      }
    ]);
    const { service, codeService } = createService(prisma);

    await expect(
      service.bindEmail("user-1", "User@Example.COM", "123456")
    ).resolves.toEqual({
      user: {
        id: "user-1",
        email: "user@example.com",
        username: "mirauser",
        status: "enabled"
      }
    });

    expect(codeService.verifyCode).toHaveBeenCalledWith(
      "user@example.com",
      "123456"
    );
    expect(users[0]?.email).toBe("user@example.com");
    expect(users[0]?.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it("rejects binding an email owned by another account", async () => {
    const { prisma } = createPrisma([
      {
        id: "user-1",
        email: null,
        username: "mirauser",
        passwordHash: "scrypt:salt:key",
        status: "enabled",
        emailVerifiedAt: null,
        lastLoginAt: null
      },
      {
        id: "user-2",
        email: "user@example.com",
        username: null,
        passwordHash: null,
        status: "enabled",
        emailVerifiedAt: new Date("2026-06-01T00:00:00.000Z"),
        lastLoginAt: null
      }
    ]);
    const { service, codeService } = createService(prisma);

    await expect(
      service.bindEmail("user-1", "user@example.com", "123456")
    ).rejects.toThrow(new ConflictException("邮箱已绑定其他账号"));
    expect(codeService.verifyCode).not.toHaveBeenCalled();
  });

  it("requests bind-email codes only for unclaimed emails", async () => {
    const { prisma } = createPrisma();
    const { service, codeService, mailer } = createService(prisma);
    codeService.createCode.mockResolvedValueOnce("654321");

    await expect(
      service.requestBindEmailCode("user@example.com", "203.0.113.10")
    ).resolves.toEqual({ ok: true });

    expect(mailer.ensureCanSendVerificationCode).toHaveBeenCalledTimes(1);
    expect(codeService.createCode).toHaveBeenCalledWith(
      "user@example.com",
      "203.0.113.10"
    );
    expect(mailer.sendVerificationCode).toHaveBeenCalledWith(
      "user@example.com",
      "654321"
    );
  });

  it("rejects weak password registration requests", async () => {
    const { prisma } = createPrisma();
    const { service } = createService(prisma);

    await expect(service.registerWithPassword("mirauser", "short")).rejects.toThrow(
      new BadRequestException("密码至少需要 8 位")
    );
  });
});
