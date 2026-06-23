import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import { hashPassword, verifyPassword } from "../security/password-hash.js";
import {
  isValidPassword,
  isValidUsername,
  normalizeEmail,
  normalizeUsername,
  toPublicUser,
  type PublicUser
} from "./auth.types.js";
import { EmailCodeService } from "./email-code.service.js";
import { MailerService } from "./mailer.service.js";
import { UserSessionService } from "./user-session.service.js";

const DISABLED_MESSAGE = "账号已被禁用，请联系管理员";
const INVALID_PASSWORD_LOGIN_MESSAGE = "账号或密码不正确";
const WEAK_PASSWORD_MESSAGE = "密码至少需要 8 位";

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
      create: { email, emailVerifiedAt: lastLoginAt, lastLoginAt },
      update: { emailVerifiedAt: lastLoginAt, lastLoginAt }
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

  async registerWithPassword(
    usernameValue: string,
    password: string
  ): Promise<{ user: PublicUser; token: string }> {
    const username = normalizeUsername(usernameValue);
    if (!isValidUsername(username)) {
      throw new BadRequestException("请输入 3-32 位账号名");
    }
    if (!isValidPassword(password)) {
      throw new BadRequestException(WEAK_PASSWORD_MESSAGE);
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { username }
    });
    if (existingUser) {
      throw new ConflictException("账号名已被使用");
    }

    const lastLoginAt = new Date();
    try {
      const user = await this.prisma.user.create({
        data: {
          username,
          passwordHash: await hashPassword(password),
          email: null,
          emailVerifiedAt: null,
          lastLoginAt
        }
      });
      const token = await this.sessions.createSession(user.id);
      return { user: toPublicUser(user), token };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException("账号名已被使用");
      }
      throw error;
    }
  }

  async loginWithPassword(
    identifierValue: string,
    password: string
  ): Promise<{ user: PublicUser; token: string }> {
    const identifier = normalizeEmail(identifierValue);
    const user = await this.findPasswordUser(identifier);

    if (
      !user ||
      !user.passwordHash ||
      !(await verifyPassword(password, user.passwordHash))
    ) {
      throw new UnauthorizedException(INVALID_PASSWORD_LOGIN_MESSAGE);
    }

    if (user.status === "disabled") {
      throw new ForbiddenException(DISABLED_MESSAGE);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });
    const token = await this.sessions.createSession(updatedUser.id);
    return { user: toPublicUser(updatedUser), token };
  }

  async requestBindEmailCode(
    emailValue: string,
    requestIp?: string
  ): Promise<{ ok: true }> {
    const email = normalizeEmail(emailValue);
    const existingUser = await this.prisma.user.findUnique({
      where: { email }
    });
    if (existingUser) {
      throw new ConflictException("邮箱已绑定其他账号");
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

  async bindEmail(
    userId: string,
    emailValue: string,
    code: string
  ): Promise<{ user: PublicUser }> {
    const email = normalizeEmail(emailValue);
    const existingUser = await this.prisma.user.findUnique({
      where: { email }
    });
    if (existingUser && existingUser.id !== userId) {
      throw new ConflictException("邮箱已绑定其他账号");
    }

    await this.codes.verifyCode(email, code);

    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          email,
          emailVerifiedAt: new Date()
        }
      });
      return { user: toPublicUser(user) };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException("邮箱已绑定其他账号");
      }
      throw error;
    }
  }

  private async findPasswordUser(identifier: string) {
    if (identifier.includes("@")) {
      return this.prisma.user.findUnique({ where: { email: identifier } });
    }

    return this.prisma.user.findUnique({ where: { username: identifier } });
  }
}

function isUniqueConstraintError(error: unknown) {
  return (
    Boolean(error) &&
    typeof error === "object" &&
    (error as { code?: unknown }).code === "P2002"
  );
}
