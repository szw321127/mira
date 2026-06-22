import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException
} from "@nestjs/common";
import {
  createHash,
  createHmac,
  randomInt,
  timingSafeEqual
} from "node:crypto";
import { PrismaService } from "../database/prisma.service.js";
import { normalizeEmail } from "./auth.types.js";

const CODE_TTL_MS = 10 * 60 * 1000;
const EMAIL_MIN_INTERVAL_MS = 60 * 1000;
const HOURLY_WINDOW_MS = 60 * 60 * 1000;
const MAX_EMAIL_PER_HOUR = 5;
const MAX_IP_PER_HOUR = 20;
const MAX_VERIFY_ATTEMPTS = 5;
const INVALID_CODE_MESSAGE = "验证码不正确或已过期";
const LOCAL_EMAIL_CODE_SECRET = "mira-local-email-code-secret-change-me";

type EmailVerificationCodeDelegate = {
  count(args: {
    where: {
      email?: string;
      requestIp?: string;
      createdAt?: { gte: Date };
    };
  }): Promise<number>;
  create(args: {
    data: {
      email: string;
      codeHash: string;
      expiresAt: Date;
      requestIp: string | null;
    };
  }): Promise<unknown>;
  updateMany(args: {
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
  }): Promise<{ count: number }>;
};

type EmailCodeTransaction = {
  emailVerificationCode: EmailVerificationCodeDelegate;
  $executeRaw(
    strings: TemplateStringsArray,
    ...values: Array<string | number>
  ): Promise<unknown>;
};

@Injectable()
export class EmailCodeService {
  constructor(private readonly prisma: PrismaService) {}

  async createCode(emailValue: string, requestIp?: string): Promise<string> {
    const email = normalizeEmail(emailValue);
    const now = new Date();
    const secret = getEmailCodeSecret();
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");

    await this.prisma.$transaction(async (tx) => {
      const transaction = toEmailCodeTransaction(tx);
      await this.acquireRateLimitLocks(transaction, email, requestIp);
      await this.enforceRateLimits(transaction, email, requestIp, now);
      await transaction.emailVerificationCode.updateMany({
        where: {
          email,
          usedAt: null
        },
        data: {
          usedAt: now
        }
      });
      await transaction.emailVerificationCode.create({
        data: {
          email,
          codeHash: hashCode(email, code, secret),
          expiresAt: new Date(now.getTime() + CODE_TTL_MS),
          requestIp: requestIp ?? null
        }
      });
    });


    return code;
  }

  async verifyCode(emailValue: string, code: string): Promise<void> {
    const email = normalizeEmail(emailValue);
    const now = new Date();
    const row = await this.prisma.emailVerificationCode.findFirst({
      where: {
        email,
        usedAt: null
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    if (!row || row.expiresAt <= now || row.attempts >= MAX_VERIFY_ATTEMPTS) {
      throw new BadRequestException(INVALID_CODE_MESSAGE);
    }

    const codeHash = hashCode(email, code, getEmailCodeSecret());
    if (!isEqualHash(row.codeHash, codeHash)) {
      await this.prisma.emailVerificationCode.updateMany({
        where: {
          id: row.id,
          usedAt: null,
          attempts: {
            lt: MAX_VERIFY_ATTEMPTS
          },
          expiresAt: {
            gt: now
          }
        },
        data: {
          attempts: {
            increment: 1
          }
        }
      });
      throw new BadRequestException(INVALID_CODE_MESSAGE);
    }

    const result = await this.prisma.emailVerificationCode.updateMany({
      where: {
        id: row.id,
        usedAt: null,
        attempts: {
          lt: MAX_VERIFY_ATTEMPTS
        },
        expiresAt: {
          gt: now
        },
        codeHash
      },
      data: {
        usedAt: now
      }
    });
    if (result.count !== 1) throw new BadRequestException(INVALID_CODE_MESSAGE);
  }

  async invalidateLatestUnused(emailValue: string): Promise<void> {
    const email = normalizeEmail(emailValue);
    const row = await this.prisma.emailVerificationCode.findFirst({
      where: {
        email,
        usedAt: null
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    if (!row) return;

    await this.prisma.emailVerificationCode.updateMany({
      where: {
        id: row.id,
        usedAt: null
      },
      data: {
        usedAt: new Date()
      }
    });
  }

  private async enforceRateLimits(
    client: Pick<EmailCodeTransaction, "emailVerificationCode">,
    email: string,
    requestIp: string | undefined,
    now: Date
  ): Promise<void> {
    const minuteAgo = new Date(now.getTime() - EMAIL_MIN_INTERVAL_MS);
    const hourAgo = new Date(now.getTime() - HOURLY_WINDOW_MS);

    const recentEmailCount = await client.emailVerificationCode.count({
      where: {
        email,
        createdAt: {
          gte: minuteAgo
        }
      }
    });
    if (recentEmailCount >= 1) throw rateLimitException();

    const hourlyEmailCount = await client.emailVerificationCode.count({
      where: {
        email,
        createdAt: {
          gte: hourAgo
        }
      }
    });
    if (hourlyEmailCount >= MAX_EMAIL_PER_HOUR) throw rateLimitException();

    if (!requestIp) return;

    const hourlyIpCount = await client.emailVerificationCode.count({
      where: {
        requestIp,
        createdAt: {
          gte: hourAgo
        }
      }
    });
    if (hourlyIpCount >= MAX_IP_PER_HOUR) throw rateLimitException();
  }

  private async acquireRateLimitLocks(
    tx: Pick<EmailCodeTransaction, "$executeRaw">,
    email: string,
    requestIp: string | undefined
  ): Promise<void> {
    const keys = [`email-code:email:${email}`];
    if (requestIp) keys.push(`email-code:ip:${requestIp}`);
    keys.sort();

    for (const key of keys) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${advisoryLockId(key)})`;
    }
  }
}

function hashCode(email: string, code: string, secret: string): string {
  return createHmac("sha256", secret).update(`${email}:${code}`).digest("hex");
}

function isEqualHash(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function rateLimitException(): HttpException {
  return new HttpException("Too many requests.", HttpStatus.TOO_MANY_REQUESTS);
}

function getEmailCodeSecret(): string {
  const secret =
    process.env.EMAIL_CODE_SECRET ??
    process.env.SESSION_SECRET ??
    process.env.ADMIN_SESSION_SECRET;

  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") return LOCAL_EMAIL_CODE_SECRET;
  throw new ServiceUnavailableException("Email code secret is not configured.");
}

function advisoryLockId(value: string): number {
  const digest = createHash("sha256").update(value).digest();
  return digest.readInt32BE(0);
}

function toEmailCodeTransaction(value: unknown): EmailCodeTransaction {
  return value as EmailCodeTransaction;
}
