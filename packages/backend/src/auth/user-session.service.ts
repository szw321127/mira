import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../database/prisma.service.js";
import { PublicUser, toPublicUser } from "./auth.types.js";
import { USER_SESSION_MAX_AGE_SECONDS } from "./auth-session.js";

const SESSION_REQUIRED_MESSAGE = "User session required.";

@Injectable()
export class UserSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(userId: string): Promise<string> {
    const token = randomBytes(32).toString("hex");
    await this.prisma.userSession.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + USER_SESSION_MAX_AGE_SECONDS * 1000),
        revokedAt: null
      }
    });
    return token;
  }

  async requireUser(token: string | undefined): Promise<PublicUser> {
    if (!token) throw new UnauthorizedException(SESSION_REQUIRED_MESSAGE);

    const session = await this.prisma.userSession.findUnique({
      where: {
        tokenHash: hashToken(token)
      },
      include: {
        user: true
      }
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= new Date() ||
      session.user.status === "disabled"
    ) {
      throw new UnauthorizedException(SESSION_REQUIRED_MESSAGE);
    }

    return toPublicUser(session.user);
  }

  async revokeToken(token: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: {
        tokenHash: hashToken(token),
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });
  }

  async revokeUserSessions(userId: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: {
        userId,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
