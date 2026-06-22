import { BadRequestException, HttpException, HttpStatus } from "@nestjs/common";
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
  let consumeBeforeNextWrite = false;
  const operations: string[] = [];

  const delegate = {
    count: jest.fn(
      ({
        where
      }: {
        where: CountWhere;
      }) => {
        operations.push("count");
        return Promise.resolve(
          rows.filter((row) => {
            if (where.email && row.email !== where.email) return false;
            if (where.requestIp && row.requestIp !== where.requestIp) {
              return false;
            }
            if (where.createdAt?.gte && row.createdAt < where.createdAt.gte) {
              return false;
            }
            if (where.createdAt?.lt && row.createdAt >= where.createdAt.lt) {
              return false;
            }
            return true;
          }).length
        );
      }
    ),
    create: jest.fn(
      ({
        data
      }: {
        data: Omit<CodeRow, "id" | "usedAt" | "attempts" | "createdAt">;
      }) => {
        operations.push("create");
        const row = {
          ...data,
          id: `code-${nextId++}`,
          usedAt: null,
          attempts: 0,
          createdAt: new Date()
        };
        rows.push(row);
        return Promise.resolve(row);
      }
    ),
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
        if (consumeBeforeNextWrite) {
          row.usedAt = new Date();
          consumeBeforeNextWrite = false;
        }
        if (data.attempts && typeof data.attempts === "object") {
          row.attempts += data.attempts.increment;
        }
        if (data.usedAt !== undefined) row.usedAt = data.usedAt;
        return Promise.resolve(row);
      }
    ),
    updateMany: jest.fn(
      ({
        where,
        data
      }: {
        where: {
          id?: string;
          email?: string;
          usedAt?: null;
          attempts?: { lt: number };
          expiresAt?: { gt: Date };
          codeHash?: string;
        };
        data: {
          usedAt?: Date;
          attempts?: { increment: number };
        };
      }) => {
        operations.push("updateMany");
        let count = 0;
        for (const row of rows) {
          if (consumeBeforeNextWrite) {
            row.usedAt = new Date();
            consumeBeforeNextWrite = false;
          }
          if (where.id && row.id !== where.id) continue;
          if (where.email && row.email !== where.email) continue;
          if (where.usedAt === null && row.usedAt !== null) continue;
          if (where.attempts && row.attempts >= where.attempts.lt) continue;
          if (where.expiresAt && row.expiresAt <= where.expiresAt.gt) continue;
          if (where.codeHash && row.codeHash !== where.codeHash) continue;
          if (data.usedAt) row.usedAt = data.usedAt;
          if (data.attempts) row.attempts += data.attempts.increment;
          count++;
        }
        return Promise.resolve({ count });
      }
    )
  };
  const tx = {
    emailVerificationCode: delegate,
    $executeRaw: jest.fn(() => {
      operations.push("lock");
      return Promise.resolve(1);
    })
  };
  const prisma = {
    $transaction: jest.fn(async (callback: (transaction: typeof tx) => Promise<string>) => {
      operations.push("transaction");
      return callback(tx);
    }),
    emailVerificationCode: {
      ...delegate
    }
  };

  return {
    prisma: prisma as unknown as PrismaService,
    rows,
    operations,
    transaction: prisma.$transaction,
    executeRaw: tx.$executeRaw,
    simulateConcurrentConsumeBeforeNextWrite: () => {
      consumeBeforeNextWrite = true;
    }
  };
}

type CountWhere = {
  email?: string;
  requestIp?: string;
  createdAt?: { gte?: Date; lt?: Date };
};

function expectInvalidCode(promise: Promise<unknown>) {
  return expect(promise).rejects.toThrow(
    new BadRequestException("验证码不正确或已过期")
  );
}

describe("EmailCodeService", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalEmailCodeSecret = process.env.EMAIL_CODE_SECRET;
  const originalSessionSecret = process.env.SESSION_SECRET;
  const originalAdminSessionSecret = process.env.ADMIN_SESSION_SECRET;

  beforeEach(() => {
    process.env.NODE_ENV = "test";
    process.env.EMAIL_CODE_SECRET = "test-email-code-secret";
    delete process.env.SESSION_SECRET;
    delete process.env.ADMIN_SESSION_SECRET;
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.EMAIL_CODE_SECRET = originalEmailCodeSecret;
    process.env.SESSION_SECRET = originalSessionSecret;
    process.env.ADMIN_SESSION_SECRET = originalAdminSessionSecret;
  });

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

  it("uses a server-side secret for code hashes", async () => {
    const first = createPrisma();
    const firstService = new EmailCodeService(first.prisma);
    const code = await firstService.createCode("user@example.com", "203.0.113.10");
    const firstHash = first.rows[0].codeHash;

    process.env.EMAIL_CODE_SECRET = "different-email-code-secret";
    const second = createPrisma();
    const secondService = new EmailCodeService(second.prisma);

    await secondService.createCode("user@example.com", "203.0.113.10");

    expect(firstHash).not.toBe(code);
    expect(second.rows[0].codeHash).not.toBe(firstHash);
  });

  it("rejects production code creation without a hash secret", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.EMAIL_CODE_SECRET;
    delete process.env.SESSION_SECRET;
    delete process.env.ADMIN_SESSION_SECRET;
    const { prisma, rows } = createPrisma();
    const service = new EmailCodeService(prisma);

    await expect(service.createCode("user@example.com", "203.0.113.10")).rejects.toThrow(
      "Email code secret is not configured."
    );
    expect(rows).toHaveLength(0);
  });

  it("creates codes inside a transaction after advisory locks", async () => {
    const { prisma, operations, transaction, executeRaw } = createPrisma();
    const service = new EmailCodeService(prisma);

    await service.createCode("user@example.com", "203.0.113.10");

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(executeRaw).toHaveBeenCalledTimes(2);
    expect(operations.slice(0, 4)).toEqual([
      "transaction",
      "lock",
      "lock",
      "count"
    ]);
    expect(operations).toContain("updateMany");
    expect(operations.at(-1)).toBe("create");
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
    await expectInvalidCode(service.verifyCode("user@example.com", latestCode));
  });

  it("invalidates older unused codes when creating a new code", async () => {
    const { prisma, rows } = createPrisma();
    const service = new EmailCodeService(prisma);

    const olderCode = await service.createCode("user@example.com", "203.0.113.10");
    rows[0].createdAt = new Date(Date.now() - 61_000);
    const latestCode = await service.createCode("user@example.com", "203.0.113.10");

    await expect(service.verifyCode("user@example.com", latestCode)).resolves.toBe(
      undefined
    );
    await expectInvalidCode(service.verifyCode("user@example.com", olderCode));
  });

  it("allows exactly one atomic consume of a verification code", async () => {
    const { prisma } = createPrisma();
    const service = new EmailCodeService(prisma);

    const code = await service.createCode("user@example.com", "203.0.113.10");

    await expect(service.verifyCode("user@example.com", code)).resolves.toBe(
      undefined
    );
    await expectInvalidCode(service.verifyCode("user@example.com", code));
  });

  it("rejects when another verifier consumes the code before the consume write", async () => {
    const { prisma, simulateConcurrentConsumeBeforeNextWrite } = createPrisma();
    const service = new EmailCodeService(prisma);

    const code = await service.createCode("user@example.com", "203.0.113.10");
    simulateConcurrentConsumeBeforeNextWrite();

    await expectInvalidCode(service.verifyCode("user@example.com", code));
  });

  it("rejects expired codes", async () => {
    const { prisma, rows } = createPrisma();
    const service = new EmailCodeService(prisma);

    const code = await service.createCode("user@example.com", "203.0.113.10");
    rows[0].expiresAt = new Date(Date.now() - 1);

    await expectInvalidCode(service.verifyCode("user@example.com", code));
  });

  it("increments bad-code attempts and rejects after max attempts", async () => {
    const { prisma, rows } = createPrisma();
    const service = new EmailCodeService(prisma);

    const code = await service.createCode("user@example.com", "203.0.113.10");

    for (let attempt = 1; attempt <= 5; attempt++) {
      await expectInvalidCode(service.verifyCode("user@example.com", "000000"));
      expect(rows[0].attempts).toBe(attempt);
    }
    await expectInvalidCode(service.verifyCode("user@example.com", code));
  });

  it("rejects repeated requests for the same email", async () => {
    const { prisma } = createPrisma();
    const service = new EmailCodeService(prisma);

    await service.createCode("user@example.com", "203.0.113.10");

    await expect(
      service.createCode("user@example.com", "203.0.113.10")
    ).rejects.toThrow();
  });

  it("rejects more than five requests for one email in an hour", async () => {
    const { prisma, rows } = createPrisma();
    const service = new EmailCodeService(prisma);

    for (let index = 0; index < 5; index++) {
      await service.createCode("user@example.com", `203.0.113.${index}`);
      rows[index].createdAt = new Date(Date.now() - 61_000);
    }

    await expect(
      service.createCode("user@example.com", "203.0.113.99")
    ).rejects.toThrow(new HttpException("Too many requests.", HttpStatus.TOO_MANY_REQUESTS));
  });

  it("rejects more than twenty requests from one IP in an hour", async () => {
    const { prisma, rows } = createPrisma();
    const service = new EmailCodeService(prisma);

    for (let index = 0; index < 20; index++) {
      await service.createCode(`user-${index}@example.com`, "203.0.113.10");
      rows[index].createdAt = new Date(Date.now() - 61_000);
    }

    await expect(
      service.createCode("overflow@example.com", "203.0.113.10")
    ).rejects.toThrow(new HttpException("Too many requests.", HttpStatus.TOO_MANY_REQUESTS));
  });
});
