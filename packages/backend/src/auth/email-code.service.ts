import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable
} from "@nestjs/common";
import { createHash, randomInt } from "node:crypto";
import { PrismaService } from "../database/prisma.service.js";
import { normalizeEmail } from "./auth.types.js";

const CODE_TTL_MS = 10 * 60 * 1000;
const EMAIL_MIN_INTERVAL_MS = 60 * 1000;
const HOURLY_WINDOW_MS = 60 * 60 * 1000;
const MAX_EMAIL_PER_HOUR = 5;
const MAX_IP_PER_HOUR = 20;
const MAX_VERIFY_ATTEMPTS = 5;
const INVALID_CODE_MESSAGE = "验证码不正确或已过期";

@Injectable()
export class EmailCodeService {
  constructor(private readonly prisma: PrismaService) {}

  async createCode(emailValue: string, requestIp?: string): Promise<string> {
    const email = normalizeEmail(emailValue);
    const now = new Date();

    await this.enforceRateLimits(email, requestIp, now);

    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    await this.prisma.emailVerificationCode.create({
      data: {
        email,
        codeHash: hashCode(email, code),
        expiresAt: new Date(now.getTime() + CODE_TTL_MS),
        requestIp: requestIp ?? null
      }
    });

    return code;
  }

  async verifyCode(emailValue: string, code: string): Promise<void> {
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

    if (!row || row.expiresAt <= new Date() || row.attempts >= MAX_VERIFY_ATTEMPTS) {
      throw new BadRequestException(INVALID_CODE_MESSAGE);
    }

    if (row.codeHash !== hashCode(email, code)) {
      await this.prisma.emailVerificationCode.update({
        where: { id: row.id },
        data: {
          attempts: {
            increment: 1
          }
        }
      });
      throw new BadRequestException(INVALID_CODE_MESSAGE);
    }

    await this.prisma.emailVerificationCode.update({
      where: { id: row.id },
      data: {
        usedAt: new Date()
      }
    });
  }

  private async enforceRateLimits(
    email: string,
    requestIp: string | undefined,
    now: Date
  ): Promise<void> {
    const minuteAgo = new Date(now.getTime() - EMAIL_MIN_INTERVAL_MS);
    const hourAgo = new Date(now.getTime() - HOURLY_WINDOW_MS);

    const recentEmailCount = await this.prisma.emailVerificationCode.count({
      where: {
        email,
        createdAt: {
          gte: minuteAgo
        }
      }
    });
    if (recentEmailCount >= 1) throw rateLimitException();

    const hourlyEmailCount = await this.prisma.emailVerificationCode.count({
      where: {
        email,
        createdAt: {
          gte: hourAgo
        }
      }
    });
    if (hourlyEmailCount >= MAX_EMAIL_PER_HOUR) throw rateLimitException();

    if (!requestIp) return;

    const hourlyIpCount = await this.prisma.emailVerificationCode.count({
      where: {
        requestIp,
        createdAt: {
          gte: hourAgo
        }
      }
    });
    if (hourlyIpCount >= MAX_IP_PER_HOUR) throw rateLimitException();
  }
}

function hashCode(email: string, code: string): string {
  return createHash("sha256").update(`${email}:${code}`).digest("hex");
}

function rateLimitException(): HttpException {
  return new HttpException("Too many requests.", HttpStatus.TOO_MANY_REQUESTS);
}
