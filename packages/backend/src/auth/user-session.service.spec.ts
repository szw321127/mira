import { UnauthorizedException } from "@nestjs/common";
import { jest } from "@jest/globals";
import type { PrismaService } from "../database/prisma.service.js";
import { UserSessionService } from "./user-session.service.js";

type SessionRow = {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  user: {
    id: string;
    email: string;
    status: "enabled" | "disabled";
  };
};

function createPrisma(status: "enabled" | "disabled" = "enabled") {
  const rows: SessionRow[] = [];
  const users = new Map([
    [
      "user-1",
      {
        id: "user-1",
        email: "user@example.com",
        status
      }
    ]
  ]);

  const prisma = {
    userSession: {
      create: jest.fn(({ data }: { data: Omit<SessionRow, "id" | "createdAt" | "user"> }) => {
        const user = users.get(data.userId);
        if (!user) throw new Error(`Missing user ${data.userId}`);
        const row = {
          ...data,
          id: "session-1",
          createdAt: new Date(),
          user
        };
        rows.push(row);
        return Promise.resolve(row);
      }),
      findUnique: jest.fn(({ where }: { where: { tokenHash: string } }) => {
        return Promise.resolve(
          rows.find((row) => row.tokenHash === where.tokenHash) ?? null
        );
      }),
      updateMany: jest.fn(
        ({
          where,
          data
        }: {
          where: Partial<Pick<SessionRow, "tokenHash" | "userId" | "revokedAt">>;
          data: { revokedAt: Date };
        }) => {
          let count = 0;
          for (const row of rows) {
            if (where.tokenHash && row.tokenHash !== where.tokenHash) continue;
            if (where.userId && row.userId !== where.userId) continue;
            if (where.revokedAt === null && row.revokedAt !== null) continue;
            row.revokedAt = data.revokedAt;
            count++;
          }
          return Promise.resolve({ count });
        }
      )
    }
  };

  return { prisma: prisma as unknown as PrismaService, rows };
}

describe("UserSessionService", () => {
  it("creates and validates an opaque session token", async () => {
    const { prisma, rows } = createPrisma();
    const service = new UserSessionService(prisma);

    const token = await service.createSession("user-1");
    const user = await service.requireUser(token);

    expect(token).toHaveLength(64);
    expect(rows[0]?.tokenHash).not.toBe(token);
    expect(rows[0]?.tokenHash).toHaveLength(64);
    expect(user).toEqual({
      id: "user-1",
      email: "user@example.com",
      status: "enabled"
    });
  });

  it("rejects missing sessions", async () => {
    const { prisma } = createPrisma();
    const service = new UserSessionService(prisma);

    await expect(service.requireUser(undefined)).rejects.toThrow(
      new UnauthorizedException("User session required.")
    );
  });

  it("rejects revoked sessions", async () => {
    const { prisma, rows } = createPrisma();
    const service = new UserSessionService(prisma);

    const token = await service.createSession("user-1");
    rows[0].revokedAt = new Date();

    await expect(service.requireUser(token)).rejects.toThrow(
      new UnauthorizedException("User session required.")
    );
  });

  it("rejects expired sessions", async () => {
    const { prisma, rows } = createPrisma();
    const service = new UserSessionService(prisma);

    const token = await service.createSession("user-1");
    rows[0].expiresAt = new Date(Date.now() - 1);

    await expect(service.requireUser(token)).rejects.toThrow(
      new UnauthorizedException("User session required.")
    );
  });

  it("rejects sessions for disabled users", async () => {
    const { prisma } = createPrisma("disabled");
    const service = new UserSessionService(prisma);

    const token = await service.createSession("user-1");

    await expect(service.requireUser(token)).rejects.toThrow(
      new UnauthorizedException("User session required.")
    );
  });
});
