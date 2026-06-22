import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import { normalizeEmail, toPublicUser, type PublicUser } from "./auth.types.js";
import { EmailCodeService } from "./email-code.service.js";
import { MailerService } from "./mailer.service.js";
import { UserSessionService } from "./user-session.service.js";

const DISABLED_MESSAGE = "账号已被禁用，请联系管理员";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly codes: EmailCodeService,
    private readonly mailer: MailerService,
    private readonly sessions: UserSessionService
  ) {}

  async requestCode(emailValue: string, requestIp?: string): Promise<{ ok: true }> {
    const email = normalizeEmail(emailValue);
    const existingUser = await this.prisma.user.findUnique({
      where: { email }
    });

    if (existingUser?.status === "disabled") {
      return { ok: true };
    }

    await this.mailer.ensureCanSendVerificationCode();
    const code = await this.codes.createCode(email, requestIp);
    try {
      await this.mailer.sendVerificationCode(email, code);
    } catch (error) {
      await this.codes.invalidateLatestUnused(email);
      throw error;
    }
    return { ok: true };
  }

  async login(emailValue: string, code: string): Promise<{ user: PublicUser; token: string }> {
    const email = normalizeEmail(emailValue);
    const existingUser = await this.prisma.user.findUnique({
      where: { email }
    });

    if (existingUser?.status === "disabled") {
      throw new ForbiddenException(DISABLED_MESSAGE);
    }

    await this.codes.verifyCode(email, code);
    const lastLoginAt = new Date();

    const user = await this.prisma.user.upsert({
      where: { email },
      create: { email, lastLoginAt },
      update: { lastLoginAt }
    });

    if (user.status === "disabled") {
      throw new ForbiddenException(DISABLED_MESSAGE);
    }

    const token = await this.sessions.createSession(user.id);
    return {
      user: toPublicUser(user),
      token
    };
  }
}
