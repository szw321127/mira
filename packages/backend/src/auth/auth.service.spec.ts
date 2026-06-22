import { ForbiddenException } from "@nestjs/common";
import { jest } from "@jest/globals";
import type { PrismaService } from "../database/prisma.service.js";
import { AuthService } from "./auth.service.js";
import type { EmailCodeService } from "./email-code.service.js";
import type { MailerService } from "./mailer.service.js";
import type { UserSessionService } from "./user-session.service.js";

type UserRow = {
  id: string;
  email: string;
  status: "enabled" | "disabled";
  lastLoginAt: Date | null;
};

type MockEmailCodeService = Pick<
  jest.Mocked<EmailCodeService>,
  "createCode" | "verifyCode"
>;

type MockMailerService = Pick<jest.Mocked<MailerService>, "sendVerificationCode">;

type MockUserSessionService = Pick<
  jest.Mocked<UserSessionService>,
  "createSession"
>;

function createPrisma(initialUsers: UserRow[] = []) {
  const users = [...initialUsers];
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
      findUnique: jest.fn(({ where }: { where: { email: string } }) => {
        return Promise.resolve(users.find((item) => item.email === where.email) ?? null);
      }),
      upsert
    }
  };

  return { prisma: prisma as unknown as PrismaService, users, upsert };
}

function createService(prisma: PrismaService) {
  const codeService = {
    createCode: jest.fn(),
    verifyCode: jest.fn(() => Promise.resolve())
  } satisfies MockEmailCodeService;
  const mailer = {
    sendVerificationCode: jest.fn(() => Promise.resolve())
  } satisfies MockMailerService;
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
  it("creates a new user and session after code verification", async () => {
    const { prisma, users } = createPrisma();
    const { service, codeService, sessions } = createService(prisma);

    await expect(service.login("User@Example.COM", "123456")).resolves.toEqual({
      user: {
        id: "user-1",
        email: "user@example.com",
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
        status: "disabled",
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
});
