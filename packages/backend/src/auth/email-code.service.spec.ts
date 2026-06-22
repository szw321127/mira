import { BadRequestException } from "@nestjs/common";
import { jest } from "@jest/globals";
import type { PrismaService } from "../database/prisma.service.js";
import { EmailCodeService } from "./email-code.service.js";

type CodeRow = {
  id: string;
  email: string;
  codeHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  attempts: number;
  requestIp: string | null;
  createdAt: Date;
};

function createPrisma() {
  const rows: CodeRow[] = [];
  let nextId = 1;

  const prisma = {
    emailVerificationCode: {
      count: jest.fn(
        ({
          where
        }: {
          where: {
            email?: string;
            requestIp?: string;
            createdAt?: { gte: Date };
          };
        }) => {
          return Promise.resolve(
            rows.filter((row) => {
              if (where.email && row.email !== where.email) return false;
              if (where.requestIp && row.requestIp !== where.requestIp) {
                return false;
              }
              if (where.createdAt && row.createdAt < where.createdAt.gte) {
                return false;
              }
              return true;
            }).length
          );
        }
      ),
      create: jest.fn(({ data }: { data: Omit<CodeRow, "id" | "usedAt" | "attempts" | "createdAt"> }) => {
        const row = {
          ...data,
          id: `code-${nextId++}`,
          usedAt: null,
          attempts: 0,
          createdAt: new Date()
        };
        rows.push(row);
        return Promise.resolve(row);
      }),
      findFirst: jest.fn(
        ({
          where
        }: {
          where: {
            email: string;
            usedAt: null;
          };
        }) => {
          const match = rows
            .filter((row) => row.email === where.email && row.usedAt === null)
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
          return Promise.resolve(match ?? null);
        }
      ),
      update: jest.fn(
        ({
          where,
          data
        }: {
          where: { id: string };
          data: Partial<CodeRow> & { attempts?: { increment: number } };
        }) => {
          const row = rows.find((item) => item.id === where.id);
          if (!row) throw new Error(`Missing row ${where.id}`);
          if (data.attempts && typeof data.attempts === "object") {
            row.attempts += data.attempts.increment;
          }
          if (data.usedAt !== undefined) row.usedAt = data.usedAt;
          return Promise.resolve(row);
        }
      )
    }
  };

  return { prisma: prisma as unknown as PrismaService, rows };
}

describe("EmailCodeService", () => {
  it("stores only a hashed code", async () => {
    const { prisma, rows } = createPrisma();
    const service = new EmailCodeService(prisma);

    const code = await service.createCode("User@Example.COM", "203.0.113.10");

    expect(code).toMatch(/^\d{6}$/);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe("user@example.com");
    expect(rows[0]?.codeHash).not.toBe(code);
    expect(rows[0]?.codeHash).toHaveLength(64);
    expect(rows[0]?.requestIp).toBe("203.0.113.10");
  });

  it("verifies the latest unused code once", async () => {
    const { prisma, rows } = createPrisma();
    const service = new EmailCodeService(prisma);

    await service.createCode("user@example.com", "203.0.113.10");
    rows[0].createdAt = new Date(Date.now() - 61_000);
    const latestCode = await service.createCode("user@example.com", "203.0.113.10");

    await expect(service.verifyCode("user@example.com", latestCode)).resolves.toBe(
      undefined
    );
    await expect(service.verifyCode("user@example.com", latestCode)).rejects.toThrow(
      new BadRequestException("验证码不正确或已过期")
    );
  });

  it("rejects repeated requests for the same email", async () => {
    const { prisma } = createPrisma();
    const service = new EmailCodeService(prisma);

    await service.createCode("user@example.com", "203.0.113.10");

    await expect(
      service.createCode("user@example.com", "203.0.113.10")
    ).rejects.toThrow();
  });
});
