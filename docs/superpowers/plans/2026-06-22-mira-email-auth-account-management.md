# Mira Email Auth And Account Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add email verification login/registration, user-scoped conversation persistence, and admin account management to Mira.

**Architecture:** Backend owns auth, session validation, conversation persistence, and admin user controls through new NestJS modules backed by Prisma models. The Next frontend proxies auth/conversation/admin requests, gates the chat workspace on a user session, and keeps optimistic chat state while syncing to PostgreSQL. The login UI follows the existing Mira product register and must pass a frontend-design pass plus an impeccable review before shipping.

**Tech Stack:** NestJS, Prisma 7, PostgreSQL, Redis, Next 16, React 19, Tailwind 4, lucide-react, Resend for verification email delivery.

---

## File Structure

Backend:

- Modify `packages/backend/prisma/schema.prisma`: add user, verification code, user session, conversation, and message models.
- Create `packages/backend/prisma/migrations/20260622000100_add_user_auth_and_conversations/migration.sql`: database migration for the new tables and indexes.
- Create `packages/backend/src/auth/auth.module.ts`: Nest module exporting auth/session services.
- Create `packages/backend/src/auth/auth.controller.ts`: public auth endpoints.
- Create `packages/backend/src/auth/auth.service.ts`: email-code login orchestration.
- Create `packages/backend/src/auth/auth-session.ts`: session cookie name plus cookie parsing helpers.
- Create `packages/backend/src/auth/email-code.service.ts`: code generation, hashing, expiry, attempt tracking, rate-limit checks.
- Create `packages/backend/src/auth/mailer.service.ts`: Resend/development verification code delivery.
- Create `packages/backend/src/auth/user-session.service.ts`: token creation, hashing, validation, revocation.
- Create `packages/backend/src/auth/auth.types.ts`: shared backend auth types and parsers.
- Create `packages/backend/src/auth/*.spec.ts`: unit/controller tests.
- Create `packages/backend/src/conversations/conversations.module.ts`: Nest module for conversation persistence.
- Create `packages/backend/src/conversations/conversations.controller.ts`: user-owned conversation endpoints.
- Create `packages/backend/src/conversations/conversations.service.ts`: persistence and ownership checks.
- Create `packages/backend/src/conversations/conversations.types.ts`: parsers and DTO mappers.
- Create `packages/backend/src/conversations/*.spec.ts`: unit/controller tests.
- Modify `packages/backend/src/agent/agent.controller.ts`: require user session for `/agent/chat`.
- Modify `packages/backend/src/agent/agent.module.ts`: import `AuthModule`.
- Modify `packages/backend/src/admin/admin.controller.ts`: add `/admin/users` endpoints.
- Modify `packages/backend/src/admin/admin.service.ts`: list/search users, enable/disable users, revoke sessions.
- Modify `packages/backend/src/admin/admin.types.ts`: add Resend managed secrets.
- Modify `packages/backend/src/admin/runtime-secrets.service.ts`: expose Resend config.
- Modify `packages/backend/src/app.module.ts`: import new modules.

Frontend:

- Create `packages/web-frontend/src/app/auth/auth-types.ts`: user session types.
- Create `packages/web-frontend/src/app/auth/auth-api.ts`: auth client calls.
- Create `packages/web-frontend/src/app/auth/use-auth-session.ts`: session loading/logout hook.
- Create `packages/web-frontend/src/app/auth/email-login-panel.tsx`: email code login/register UI.
- Create `packages/web-frontend/src/app/api/auth/code/route.ts`: proxy code requests.
- Create `packages/web-frontend/src/app/api/auth/login/route.ts`: proxy login and `set-cookie`.
- Create `packages/web-frontend/src/app/api/auth/logout/route.ts`: proxy logout.
- Create `packages/web-frontend/src/app/api/auth/session/route.ts`: proxy session.
- Create `packages/web-frontend/src/app/api/conversations/route.ts`: proxy list/create/import endpoints.
- Create `packages/web-frontend/src/app/api/conversations/[id]/route.ts`: proxy get/rename/delete.
- Create `packages/web-frontend/src/app/api/conversations/[id]/messages/route.ts`: proxy message sync.
- Create `packages/web-frontend/src/app/api/shared/backend-proxy.ts`: shared backend proxy helper for auth/admin/conversations/agent.
- Modify `packages/web-frontend/src/app/api/admin/proxy.ts`: reuse shared proxy helper.
- Modify `packages/web-frontend/src/app/api/agent/chat/route.ts`: forward cookies and return 401 JSON from backend.
- Modify `packages/web-frontend/src/app/page.tsx`: gate workspace on auth session.
- Modify `packages/web-frontend/src/app/agent-workspace/use-agent-conversation.ts`: load/save conversations through backend after login.
- Modify `packages/web-frontend/src/app/agent-workspace/storage.ts`: add legacy migration marker helpers.
- Create `packages/web-frontend/src/app/agent-workspace/conversation-api.ts`: conversation client calls.
- Split `packages/web-frontend/src/app/admin/admin-shell.tsx` into focused components:
  - `packages/web-frontend/src/app/admin/admin-shell.tsx`
  - `packages/web-frontend/src/app/admin/admin-login-panel.tsx`
  - `packages/web-frontend/src/app/admin/admin-password-panel.tsx`
  - `packages/web-frontend/src/app/admin/admin-secrets-panel.tsx`
  - `packages/web-frontend/src/app/admin/admin-users-panel.tsx`
  - `packages/web-frontend/src/app/admin/admin-api.ts`
- Create `packages/web-frontend/src/app/api/admin/users/route.ts`: proxy admin user list.
- Create `packages/web-frontend/src/app/api/admin/users/[id]/status/route.ts`: proxy enable/disable.
- Update `packages/web-frontend/src/app/api/admin/proxy.test.mjs`, `packages/web-frontend/src/app/api/agent/chat/route.test.mjs`, `packages/web-frontend/src/app/auth/email-login-panel.test.mjs`, `packages/web-frontend/src/app/agent-workspace/storage.test.mjs`, and `packages/web-frontend/src/app/admin/admin-copy.test.mjs`.

## Task 1: Database Schema And Prisma Migration

**Files:**
- Modify: `packages/backend/prisma/schema.prisma`
- Create: `packages/backend/prisma/migrations/20260622000100_add_user_auth_and_conversations/migration.sql`
- Test: `packages/backend/src/config/prisma-config.spec.ts`

- [ ] **Step 1: Update Prisma schema**

Add these models to `packages/backend/prisma/schema.prisma` after `AdminStoreEntry`:

```prisma
enum UserStatus {
  enabled
  disabled
}

enum MessageRole {
  user
  assistant
}

enum MessageStatus {
  complete
  streaming
  stopped
  error
}

model User {
  id             String         @id @default(cuid())
  email          String         @unique
  status         UserStatus     @default(enabled)
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt
  lastLoginAt    DateTime?
  sessions       UserSession[]
  conversations  Conversation[]

  @@map("users")
}

model EmailVerificationCode {
  id           String    @id @default(cuid())
  email        String
  codeHash     String
  expiresAt    DateTime
  usedAt       DateTime?
  attempts     Int       @default(0)
  requestIp    String?
  createdAt    DateTime  @default(now())

  @@index([email, createdAt])
  @@index([requestIp, createdAt])
  @@map("email_verification_codes")
}

model UserSession {
  id        String    @id @default(cuid())
  userId    String
  tokenHash String    @unique
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([expiresAt])
  @@map("user_sessions")
}

model Conversation {
  id        String    @id @default(cuid())
  userId    String
  title     String
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages  Message[]

  @@index([userId, updatedAt])
  @@map("conversations")
}

model Message {
  id             String        @id @default(cuid())
  conversationId String
  role           MessageRole
  content        String
  status         MessageStatus?
  events         Json          @default("[]")
  createdAt      DateTime      @default(now())
  conversation   Conversation  @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId, createdAt])
  @@map("messages")
}
```

- [ ] **Step 2: Add SQL migration**

Create `packages/backend/prisma/migrations/20260622000100_add_user_auth_and_conversations/migration.sql`:

```sql
CREATE TYPE "UserStatus" AS ENUM ('enabled', 'disabled');
CREATE TYPE "MessageRole" AS ENUM ('user', 'assistant');
CREATE TYPE "MessageStatus" AS ENUM ('complete', 'streaming', 'stopped', 'error');

CREATE TABLE "users" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "status" "UserStatus" NOT NULL DEFAULT 'enabled',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastLoginAt" TIMESTAMP(3),
  CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

CREATE TABLE "email_verification_codes" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "requestIp" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "email_verification_codes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "email_verification_codes_email_createdAt_idx" ON "email_verification_codes"("email", "createdAt");
CREATE INDEX "email_verification_codes_requestIp_createdAt_idx" ON "email_verification_codes"("requestIp", "createdAt");

CREATE TABLE "user_sessions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_sessions_tokenHash_key" ON "user_sessions"("tokenHash");
CREATE INDEX "user_sessions_userId_idx" ON "user_sessions"("userId");
CREATE INDEX "user_sessions_expiresAt_idx" ON "user_sessions"("expiresAt");

CREATE TABLE "conversations" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "conversations_userId_updatedAt_idx" ON "conversations"("userId", "updatedAt");

CREATE TABLE "messages" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "role" "MessageRole" NOT NULL,
  "content" TEXT NOT NULL,
  "status" "MessageStatus",
  "events" JSONB NOT NULL DEFAULT '[]',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");

ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversations" ADD CONSTRAINT "conversations_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

- [ ] **Step 3: Generate Prisma client**

Run:

```bash
pnpm --filter @rednote/backend prisma:generate
```

Expected: Prisma client generates without schema errors.

- [ ] **Step 4: Run backend tests to catch schema integration issues**

Run:

```bash
pnpm --filter @rednote/backend test
```

Expected: existing backend tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/prisma/schema.prisma packages/backend/prisma/migrations/20260622000100_add_user_auth_and_conversations/migration.sql
git commit -m "feat: add user auth database schema"
```

## Task 2: Auth Core Services

**Files:**
- Create: `packages/backend/src/auth/auth.types.ts`
- Create: `packages/backend/src/auth/auth-session.ts`
- Create: `packages/backend/src/auth/email-code.service.ts`
- Create: `packages/backend/src/auth/user-session.service.ts`
- Create: `packages/backend/src/auth/auth.service.ts`
- Create: `packages/backend/src/auth/mailer.service.ts`
- Create: `packages/backend/src/auth/auth.module.ts`
- Modify: `packages/backend/src/admin/admin.types.ts`
- Modify: `packages/backend/src/admin/runtime-secrets.service.ts`
- Modify: `packages/backend/package.json`
- Test: `packages/backend/src/auth/email-code.service.spec.ts`
- Test: `packages/backend/src/auth/user-session.service.spec.ts`
- Test: `packages/backend/src/auth/auth.service.spec.ts`

- [ ] **Step 1: Use Resend email delivery**

Use the official Resend Node.js SDK for verification email delivery, with `RESEND_API_KEY` and `RESEND_FROM` still read from managed secrets. `RESEND_TEMPLATE_ID` is optional: when it is blank, send the default plain text verification code email; when it is configured, send through Resend hosted templates.

- [ ] **Step 2: Extend managed secrets**

Update `packages/backend/src/admin/admin.types.ts` so `ManagedSecretKey` includes Resend keys:

```ts
export type ManagedSecretKey =
  | "AGENT_MODEL_BASE_URL"
  | "AGENT_MODEL_NAME"
  | "AGENT_MODEL_API_KEY"
  | "TAVILY_API_KEY"
  | "RESEND_API_KEY"
  | "RESEND_FROM"
  | "RESEND_TEMPLATE_ID"
  | "RESEND_TEMPLATE_CODE_VARIABLE";
```

Append these definitions to `MANAGED_SECRETS`:

```ts
  {
    key: "RESEND_API_KEY",
    label: "Resend API Key",
    sensitive: true
  },
  {
    key: "RESEND_FROM",
    label: "Resend From",
    sensitive: false
  },
  {
    key: "RESEND_TEMPLATE_ID",
    label: "Resend Template ID",
    sensitive: false
  },
  {
    key: "RESEND_TEMPLATE_CODE_VARIABLE",
    label: "Resend 验证码变量名",
    sensitive: false
  }
```

- [ ] **Step 3: Expose Resend runtime config**

In `packages/backend/src/admin/runtime-secrets.service.ts`, add:

```ts
export type RuntimeResendConfig = {
  apiKey: string;
  from: string;
  templateId: string;
  templateCodeVariable: string;
};
```

Add this method:

```ts
  async getResendConfig(): Promise<RuntimeResendConfig> {
    const secrets = await this.readSecrets();
    return {
      apiKey: secrets.RESEND_API_KEY ?? "",
      from: secrets.RESEND_FROM ?? "",
      templateId: secrets.RESEND_TEMPLATE_ID ?? "",
      templateCodeVariable: secrets.RESEND_TEMPLATE_CODE_VARIABLE ?? ""
    };
  }
```

- [ ] **Step 4: Create auth types**

Create `packages/backend/src/auth/auth.types.ts`:

```ts
export type PublicUser = {
  id: string;
  email: string;
  status: "enabled" | "disabled";
};

export type CodeRequest = {
  email: string;
};

export type LoginRequest = {
  email: string;
  code: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string) {
  const email = normalizeEmail(value);
  return email.length <= 254 && EMAIL_PATTERN.test(email);
}

export function parseCodeRequest(value: unknown): CodeRequest | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (typeof body.email !== "string" || !isValidEmail(body.email)) return null;
  return { email: normalizeEmail(body.email) };
}

export function parseLoginRequest(value: unknown): LoginRequest | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (typeof body.email !== "string" || !isValidEmail(body.email)) return null;
  if (typeof body.code !== "string" || !/^\d{6}$/.test(body.code.trim())) {
    return null;
  }
  return { email: normalizeEmail(body.email), code: body.code.trim() };
}

export function toPublicUser(user: {
  id: string;
  email: string;
  status: "enabled" | "disabled";
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    status: user.status
  };
}
```

- [ ] **Step 5: Create session helpers**

Create `packages/backend/src/auth/auth-session.ts`:

```ts
import type { Request, Response } from "express";

export const USER_SESSION_COOKIE = "mira_user_session";
export const USER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function readCookie(header: string | undefined, name: string) {
  if (!header) return undefined;
  const cookies = header.split(";").map((part) => part.trim());
  const match = cookies.find((cookie) => cookie.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

export function readUserSessionToken(request: Request) {
  return readCookie(request.headers.cookie, USER_SESSION_COOKIE);
}

export function setUserSessionCookie(response: Response, token: string) {
  response.cookie(USER_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: USER_SESSION_MAX_AGE_SECONDS * 1000
  });
}

export function clearUserSessionCookie(response: Response) {
  response.clearCookie(USER_SESSION_COOKIE, { path: "/" });
}
```

- [ ] **Step 6: Create failing email code tests**

Create `packages/backend/src/auth/email-code.service.spec.ts`:

```ts
import { jest } from "@jest/globals";
import { BadRequestException, TooManyRequestsException } from "@nestjs/common";
import { EmailCodeService } from "./email-code.service.js";

function createPrisma() {
  const rows: Array<{
    id: string;
    email: string;
    codeHash: string;
    expiresAt: Date;
    usedAt: Date | null;
    attempts: number;
    requestIp: string | null;
    createdAt: Date;
  }> = [];

  return {
    rows,
    prisma: {
      emailVerificationCode: {
        count: jest.fn(({ where }: { where: Record<string, unknown> }) => {
          return Promise.resolve(
            rows.filter((row) => {
              if (where.email && row.email !== where.email) return false;
              if (where.requestIp && row.requestIp !== where.requestIp) return false;
              const createdAt = where.createdAt as { gte?: Date } | undefined;
              if (createdAt?.gte && row.createdAt < createdAt.gte) return false;
              return true;
            }).length
          );
        }),
        create: jest.fn(({ data }: { data: (typeof rows)[number] }) => {
          rows.push({ ...data, id: `code-${rows.length + 1}`, createdAt: new Date() });
          return Promise.resolve(rows[rows.length - 1]);
        }),
        findFirst: jest.fn(({ where }: { where: { email: string; usedAt: null } }) => {
          return Promise.resolve(
            [...rows]
              .reverse()
              .find((row) => row.email === where.email && row.usedAt === null) ?? null
          );
        }),
        update: jest.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const row = rows.find((item) => item.id === where.id);
          if (!row) throw new Error("missing row");
          Object.assign(row, data);
          return Promise.resolve(row);
        })
      }
    }
  };
}

describe("EmailCodeService", () => {
  it("stores a hashed six digit code", async () => {
    const { prisma, rows } = createPrisma();
    const service = new EmailCodeService(prisma as never);

    const code = await service.createCode("a@example.com", "127.0.0.1");

    expect(code).toMatch(/^\d{6}$/);
    expect(rows[0].email).toBe("a@example.com");
    expect(rows[0].codeHash).not.toBe(code);
  });

  it("verifies a latest unused code once", async () => {
    const { prisma } = createPrisma();
    const service = new EmailCodeService(prisma as never);
    const code = await service.createCode("a@example.com", "127.0.0.1");

    await expect(service.verifyCode("a@example.com", code)).resolves.toBeUndefined();
    await expect(service.verifyCode("a@example.com", code)).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it("rejects repeated code requests for the same email", async () => {
    const { prisma } = createPrisma();
    const service = new EmailCodeService(prisma as never);
    await service.createCode("a@example.com", "127.0.0.1");

    await expect(service.createCode("a@example.com", "127.0.0.1")).rejects.toBeInstanceOf(
      TooManyRequestsException
    );
  });
});
```

- [ ] **Step 7: Implement email code service**

Create `packages/backend/src/auth/email-code.service.ts`:

```ts
import {
  BadRequestException,
  Injectable,
  TooManyRequestsException
} from "@nestjs/common";
import {
  createHash,
  randomInt,
  timingSafeEqual
} from "node:crypto";
import { PrismaService } from "../database/prisma.service.js";

const CODE_TTL_MS = 10 * 60 * 1000;
const EMAIL_COOLDOWN_MS = 60 * 1000;
const EMAIL_HOURLY_LIMIT = 5;
const IP_HOURLY_LIMIT = 20;
const MAX_ATTEMPTS = 5;

@Injectable()
export class EmailCodeService {
  constructor(private readonly prisma: PrismaService) {}

  async createCode(email: string, requestIp: string | null) {
    await this.assertRateLimit(email, requestIp);

    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    await this.prisma.emailVerificationCode.create({
      data: {
        email,
        codeHash: hashCode(email, code),
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
        requestIp
      }
    });

    return code;
  }

  async verifyCode(email: string, code: string) {
    const row = await this.prisma.emailVerificationCode.findFirst({
      where: {
        email,
        usedAt: null
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    if (!row || row.expiresAt.getTime() < Date.now() || row.attempts >= MAX_ATTEMPTS) {
      throw new BadRequestException("验证码不正确或已过期");
    }

    if (!safeEqual(row.codeHash, hashCode(email, code))) {
      await this.prisma.emailVerificationCode.update({
        where: { id: row.id },
        data: { attempts: { increment: 1 } }
      });
      throw new BadRequestException("验证码不正确或已过期");
    }

    await this.prisma.emailVerificationCode.update({
      where: { id: row.id },
      data: { usedAt: new Date() }
    });
  }

  private async assertRateLimit(email: string, requestIp: string | null) {
    const now = Date.now();
    const cooldownCount = await this.prisma.emailVerificationCode.count({
      where: {
        email,
        createdAt: { gte: new Date(now - EMAIL_COOLDOWN_MS) }
      }
    });
    if (cooldownCount > 0) {
      throw new TooManyRequestsException("验证码发送过于频繁，请稍后再试");
    }

    const hourlyEmailCount = await this.prisma.emailVerificationCode.count({
      where: {
        email,
        createdAt: { gte: new Date(now - 60 * 60 * 1000) }
      }
    });
    if (hourlyEmailCount >= EMAIL_HOURLY_LIMIT) {
      throw new TooManyRequestsException("验证码发送过于频繁，请稍后再试");
    }

    if (!requestIp) return;
    const hourlyIpCount = await this.prisma.emailVerificationCode.count({
      where: {
        requestIp,
        createdAt: { gte: new Date(now - 60 * 60 * 1000) }
      }
    });
    if (hourlyIpCount >= IP_HOURLY_LIMIT) {
      throw new TooManyRequestsException("验证码发送过于频繁，请稍后再试");
    }
  }
}

function hashCode(email: string, code: string) {
  return createHash("sha256").update(`${email}:${code}`).digest("hex");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(new Uint8Array(leftBuffer), new Uint8Array(rightBuffer))
  );
}
```

- [ ] **Step 8: Create session service tests**

Create `packages/backend/src/auth/user-session.service.spec.ts`:

```ts
import { jest } from "@jest/globals";
import { UnauthorizedException } from "@nestjs/common";
import { UserSessionService } from "./user-session.service.js";

function createPrisma() {
  const sessions: Array<Record<string, unknown>> = [];
  const users = [{ id: "user-1", email: "a@example.com", status: "enabled" }];
  return {
    sessions,
    users,
    prisma: {
      userSession: {
        create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
          const row = { ...data, id: "session-1", user: users[0] };
          sessions.push(row);
          return Promise.resolve(row);
        }),
        findUnique: jest.fn(({ where }: { where: { tokenHash: string } }) => {
          const row = sessions.find((session) => session.tokenHash === where.tokenHash);
          return Promise.resolve(row ? { ...row, user: users[0] } : null);
        }),
        updateMany: jest.fn(({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          for (const session of sessions) {
            if (where.userId && session.userId !== where.userId) continue;
            Object.assign(session, data);
          }
          return Promise.resolve({ count: sessions.length });
        })
      }
    }
  };
}

describe("UserSessionService", () => {
  it("creates and validates a session token", async () => {
    const { prisma } = createPrisma();
    const service = new UserSessionService(prisma as never);

    const token = await service.createSession("user-1");
    const session = await service.requireUser(token);

    expect(token.length).toBeGreaterThan(32);
    expect(session.email).toBe("a@example.com");
  });

  it("rejects missing sessions", async () => {
    const { prisma } = createPrisma();
    const service = new UserSessionService(prisma as never);

    await expect(service.requireUser(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
```

- [ ] **Step 9: Implement session service**

Create `packages/backend/src/auth/user-session.service.ts`:

```ts
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../database/prisma.service.js";
import { USER_SESSION_MAX_AGE_SECONDS } from "./auth-session.js";
import { toPublicUser } from "./auth.types.js";

@Injectable()
export class UserSessionService {
  constructor(private readonly prisma: PrismaService) {}

  async createSession(userId: string) {
    const token = randomBytes(32).toString("base64url");
    await this.prisma.userSession.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + USER_SESSION_MAX_AGE_SECONDS * 1000)
      }
    });
    return token;
  }

  async requireUser(token: string | undefined) {
    if (!token) throw new UnauthorizedException("User session required.");

    const session = await this.prisma.userSession.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true }
    });

    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() < Date.now() ||
      session.user.status !== "enabled"
    ) {
      throw new UnauthorizedException("User session required.");
    }

    return toPublicUser(session.user);
  }

  async revokeToken(token: string | undefined) {
    if (!token) return;
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

  async revokeUserSessions(userId: string) {
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

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
```

- [ ] **Step 10: Implement mailer service**

Create `packages/backend/src/auth/mailer.service.ts`:

```ts
import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { Resend } from "resend";
import {
  RuntimeSecretsService,
  type RuntimeResendConfig
} from "../admin/runtime-secrets.service.js";

const UNCONFIGURED_MESSAGE = "邮件服务未配置，请联系管理员";
const SEND_FAILED_MESSAGE = "验证码邮件发送失败，请稍后再试";
const DEFAULT_TEMPLATE_CODE_VARIABLE = "CODE";

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);

  constructor(private readonly runtimeSecrets: RuntimeSecretsService) {}

  async sendVerificationCode(email: string, code: string) {
    const config = await this.runtimeSecrets.getResendConfig();
    if (!isResendConfigured(config)) {
      if (process.env.NODE_ENV !== "production") {
        console.info(`[Mira] Verification code for ${email}: ${code}`);
        return;
      }
      throw new ServiceUnavailableException(UNCONFIGURED_MESSAGE);
    }

    const resend = new Resend(config.apiKey);
    let result: Awaited<ReturnType<typeof resend.emails.send>>;
    try {
      result = await resend.emails.send(createVerificationEmailPayload(config, email, code));
    } catch (error) {
      this.logger.warn(`Resend verification email request failed: ${String(error)}`);
      throw new ServiceUnavailableException(SEND_FAILED_MESSAGE);
    }

    if (result.error) {
      this.logger.warn(`Resend verification email failed: ${result.error.message}`);
      throw new ServiceUnavailableException(SEND_FAILED_MESSAGE);
    }
  }
}

function isResendConfigured(config: { apiKey: string; from: string }) {
  return Boolean(config.apiKey && config.from);
}

function createVerificationEmailPayload(
  config: RuntimeResendConfig,
  email: string,
  code: string
) {
  const templateId = config.templateId.trim();
  const subject = "Mira 登录验证码";
  if (!templateId) {
    return {
      from: config.from,
      to: [email],
      subject,
      text: `你的 Mira 登录验证码是 ${code}，10 分钟内有效。`
    };
  }

  const codeVariable =
    config.templateCodeVariable.trim() || DEFAULT_TEMPLATE_CODE_VARIABLE;
  return {
    from: config.from,
    to: [email],
    subject,
    template: {
      id: templateId,
      variables: {
        [codeVariable]: code
      }
    }
  };
}
```

- [ ] **Step 11: Create auth service tests**

Create `packages/backend/src/auth/auth.service.spec.ts`:

```ts
import { jest } from "@jest/globals";
import { ForbiddenException } from "@nestjs/common";
import { AuthService } from "./auth.service.js";

function createPrisma() {
  const users: Array<{
    id: string;
    email: string;
    status: "enabled" | "disabled";
    createdAt: Date;
    updatedAt: Date;
    lastLoginAt: Date | null;
  }> = [];
  return {
    users,
    prisma: {
      user: {
        upsert: jest.fn(({ where, create, update }: { where: { email: string }; create: { email: string }; update: Record<string, unknown> }) => {
          let user = users.find((item) => item.email === where.email);
          if (!user) {
            user = {
              id: `user-${users.length + 1}`,
              email: create.email,
              status: "enabled",
              createdAt: new Date(),
              updatedAt: new Date(),
              lastLoginAt: null
            };
            users.push(user);
          }
          Object.assign(user, update);
          return Promise.resolve(user);
        })
      }
    }
  };
}

describe("AuthService", () => {
  it("creates a new user and session after code verification", async () => {
    const { prisma } = createPrisma();
    const emailCodes = { createCode: jest.fn(), verifyCode: jest.fn(() => Promise.resolve()) };
    const mailer = { sendVerificationCode: jest.fn() };
    const sessions = { createSession: jest.fn(() => Promise.resolve("token-1")) };
    const service = new AuthService(
      prisma as never,
      emailCodes as never,
      mailer as never,
      sessions as never
    );

    await service.login("a@example.com", "123456");

    expect(emailCodes.verifyCode).toHaveBeenCalledWith("a@example.com", "123456");
    expect(sessions.createSession).toHaveBeenCalledWith("user-1");
  });

  it("rejects disabled users", async () => {
    const { prisma, users } = createPrisma();
    users.push({
      id: "user-1",
      email: "a@example.com",
      status: "disabled",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLoginAt: null
    });
    const service = new AuthService(
      prisma as never,
      { createCode: jest.fn(), verifyCode: jest.fn(() => Promise.resolve()) } as never,
      { sendVerificationCode: jest.fn() } as never,
      { createSession: jest.fn() } as never
    );

    await expect(service.login("a@example.com", "123456")).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });
});
```

- [ ] **Step 12: Implement auth service and module**

Create `packages/backend/src/auth/auth.service.ts`:

```ts
import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import { EmailCodeService } from "./email-code.service.js";
import { MailerService } from "./mailer.service.js";
import { UserSessionService } from "./user-session.service.js";
import { toPublicUser } from "./auth.types.js";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailCodes: EmailCodeService,
    private readonly mailer: MailerService,
    private readonly sessions: UserSessionService
  ) {}

  async requestCode(email: string, requestIp: string | null) {
    const code = await this.emailCodes.createCode(email, requestIp);
    await this.mailer.sendVerificationCode(email, code);
    return { ok: true };
  }

  async login(email: string, code: string) {
    await this.emailCodes.verifyCode(email, code);
    const user = await this.prisma.user.upsert({
      where: { email },
      create: {
        email,
        lastLoginAt: new Date()
      },
      update: {
        lastLoginAt: new Date()
      }
    });

    if (user.status !== "enabled") {
      throw new ForbiddenException("账号已被禁用，请联系管理员");
    }

    return {
      user: toPublicUser(user),
      token: await this.sessions.createSession(user.id)
    };
  }
}
```

Create `packages/backend/src/auth/auth.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { AdminModule } from "../admin/admin.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { EmailCodeService } from "./email-code.service.js";
import { MailerService } from "./mailer.service.js";
import { UserSessionService } from "./user-session.service.js";

@Module({
  imports: [DatabaseModule, AdminModule],
  controllers: [AuthController],
  providers: [AuthService, EmailCodeService, MailerService, UserSessionService],
  exports: [UserSessionService]
})
export class AuthModule {}
```

- [ ] **Step 13: Run auth tests**

Run:

```bash
pnpm --filter @rednote/backend test -- --runTestsByPath src/auth/email-code.service.spec.ts src/auth/user-session.service.spec.ts src/auth/auth.service.spec.ts
```

Expected: new auth service tests pass.

- [ ] **Step 14: Commit**

```bash
git add packages/backend/package.json pnpm-lock.yaml packages/backend/src/admin/admin.types.ts packages/backend/src/admin/runtime-secrets.service.ts packages/backend/src/auth
git commit -m "feat: add email auth services"
```

## Task 3: Auth Controller And Agent Gating

**Files:**
- Create: `packages/backend/src/auth/auth.controller.ts`
- Create: `packages/backend/src/auth/auth.controller.spec.ts`
- Modify: `packages/backend/src/agent/agent.controller.ts`
- Modify: `packages/backend/src/agent/agent.controller.spec.ts`
- Modify: `packages/backend/src/agent/agent.module.ts`
- Modify: `packages/backend/src/app.module.ts`

- [ ] **Step 1: Create auth controller tests**

Create `packages/backend/src/auth/auth.controller.spec.ts`:

```ts
import { Test } from "@nestjs/testing";
import { jest } from "@jest/globals";
import request from "supertest";
import type { Server } from "node:http";
import type { INestApplication } from "@nestjs/common";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { UserSessionService } from "./user-session.service.js";

describe("AuthController", () => {
  let app: INestApplication;
  let server: Server;
  const requestCode = jest.fn();
  const login = jest.fn();
  const requireUser = jest.fn();
  const revokeToken = jest.fn();

  beforeEach(async () => {
    requestCode.mockReset();
    login.mockReset();
    requireUser.mockReset();
    revokeToken.mockReset();

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: { requestCode, login } },
        { provide: UserSessionService, useValue: { requireUser, revokeToken } }
      ]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterEach(async () => {
    await app.close();
  });

  it("requests a code for a valid email", async () => {
    requestCode.mockResolvedValueOnce({ ok: true });

    await request(server).post("/auth/code").send({ email: "A@Example.com " }).expect(200);

    expect(requestCode).toHaveBeenCalledWith("a@example.com", expect.any(String));
  });

  it("sets a user session cookie after login", async () => {
    login.mockResolvedValueOnce({
      user: { id: "user-1", email: "a@example.com", status: "enabled" },
      token: "session-token"
    });

    const response = await request(server)
      .post("/auth/login")
      .send({ email: "a@example.com", code: "123456" })
      .expect(200);

    expect(response.body.user.email).toBe("a@example.com");
    expect(response.headers["set-cookie"]?.[0]).toContain("mira_user_session=");
    expect(response.headers["set-cookie"]?.[0]).toContain("HttpOnly");
  });

  it("returns the current user from the cookie session", async () => {
    requireUser.mockResolvedValueOnce({
      id: "user-1",
      email: "a@example.com",
      status: "enabled"
    });

    const response = await request(server)
      .get("/auth/session")
      .set("Cookie", "mira_user_session=token")
      .expect(200);

    expect(response.body.user.email).toBe("a@example.com");
  });
});
```

- [ ] **Step 2: Implement auth controller**

Create `packages/backend/src/auth/auth.controller.ts`:

```ts
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res
} from "@nestjs/common";
import type { Request, Response } from "express";
import {
  clearUserSessionCookie,
  readUserSessionToken,
  setUserSessionCookie
} from "./auth-session.js";
import { AuthService } from "./auth.service.js";
import { parseCodeRequest, parseLoginRequest } from "./auth.types.js";
import { UserSessionService } from "./user-session.service.js";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessions: UserSessionService
  ) {}

  @Post("code")
  @HttpCode(HttpStatus.OK)
  async requestCode(@Body() body: unknown, @Req() request: Request) {
    const parsed = parseCodeRequest(body);
    if (!parsed) {
      return { message: "请输入有效邮箱" };
    }
    return this.authService.requestCode(parsed.email, readRequestIp(request));
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: unknown, @Res() response: Response) {
    const parsed = parseLoginRequest(body);
    if (!parsed) {
      return response.status(HttpStatus.BAD_REQUEST).json({
        message: "请输入有效邮箱和 6 位验证码"
      });
    }

    const result = await this.authService.login(parsed.email, parsed.code);
    setUserSessionCookie(response, result.token);
    return response.json({ user: result.user });
  }

  @Post("logout")
  @HttpCode(HttpStatus.OK)
  async logout(@Req() request: Request, @Res() response: Response) {
    await this.sessions.revokeToken(readUserSessionToken(request));
    clearUserSessionCookie(response);
    return response.json({ ok: true });
  }

  @Get("session")
  async session(@Req() request: Request) {
    return { user: await this.sessions.requireUser(readUserSessionToken(request)) };
  }
}

function readRequestIp(request: Request) {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    return forwarded.split(",")[0]?.trim() || null;
  }
  return request.ip ?? null;
}
```

- [ ] **Step 3: Update app module**

Modify `packages/backend/src/app.module.ts`:

```ts
import { AuthModule } from "./auth/auth.module.js";
```

and include `AuthModule` in `imports`.

- [ ] **Step 4: Update agent module**

Modify `packages/backend/src/agent/agent.module.ts` to import `AuthModule` so `UserSessionService` can be injected into `AgentController`.

- [ ] **Step 5: Add agent auth test**

Update `packages/backend/src/agent/agent.controller.spec.ts` providers with:

```ts
{
  provide: UserSessionService,
  useValue: {
    requireUser: jest.fn(() =>
      Promise.resolve({ id: "user-1", email: "a@example.com", status: "enabled" })
    )
  }
}
```

Add a test:

```ts
it("requires a user session for chat", async () => {
  const sessions = app.get(UserSessionService);
  jest.spyOn(sessions, "requireUser").mockRejectedValueOnce(
    new UnauthorizedException("User session required.")
  );

  await request(server)
    .post("/agent/chat")
    .send({
      conversationId: "c1",
      messages: [{ role: "user", content: "你好" }]
    })
    .expect(401);

  expect(streamChat).not.toHaveBeenCalled();
});
```

Import `UnauthorizedException` and `UserSessionService`.

- [ ] **Step 6: Gate agent chat**

Modify `packages/backend/src/agent/agent.controller.ts` constructor:

```ts
  constructor(
    private readonly agentService: AgentService,
    private readonly sessions: UserSessionService
  ) {}
```

Add `@Req() request: Request` to `chat`, import `Request`, and call before parsing or streaming:

```ts
    await this.sessions.requireUser(readUserSessionToken(request));
```

Import `readUserSessionToken` and `UserSessionService`.

- [ ] **Step 7: Run controller tests**

Run:

```bash
pnpm --filter @rednote/backend test -- --runTestsByPath src/auth/auth.controller.spec.ts src/agent/agent.controller.spec.ts
```

Expected: auth controller and agent controller tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/backend/src/auth/auth.controller.ts packages/backend/src/auth/auth.controller.spec.ts packages/backend/src/agent packages/backend/src/app.module.ts
git commit -m "feat: add user auth endpoints"
```

## Task 4: Conversation Persistence Backend

**Files:**
- Create: `packages/backend/src/conversations/conversations.types.ts`
- Create: `packages/backend/src/conversations/conversations.service.ts`
- Create: `packages/backend/src/conversations/conversations.controller.ts`
- Create: `packages/backend/src/conversations/conversations.module.ts`
- Create: `packages/backend/src/conversations/conversations.service.spec.ts`
- Create: `packages/backend/src/conversations/conversations.controller.spec.ts`
- Modify: `packages/backend/src/app.module.ts`

- [ ] **Step 1: Create conversation types**

Create `packages/backend/src/conversations/conversations.types.ts`:

```ts
export type PersistedChatMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  status?: "complete" | "streaming" | "stopped" | "error";
  events?: unknown[];
  createdAt?: string;
};

export function parseTitle(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const title = (value as Record<string, unknown>).title;
  if (typeof title !== "string") return null;
  const trimmed = title.trim();
  if (!trimmed || trimmed.length > 120) return null;
  return trimmed;
}

export function parseMessages(value: unknown): PersistedChatMessage[] | null {
  if (!value || typeof value !== "object") return null;
  const messages = (value as Record<string, unknown>).messages;
  if (!Array.isArray(messages)) return null;
  const parsed = messages.map(parseMessage);
  return parsed.every(Boolean) ? (parsed as PersistedChatMessage[]) : null;
}

function parseMessage(value: unknown): PersistedChatMessage | null {
  if (!value || typeof value !== "object") return null;
  const message = value as Record<string, unknown>;
  if (message.role !== "user" && message.role !== "assistant") return null;
  if (typeof message.content !== "string") return null;
  if (
    message.status !== undefined &&
    message.status !== "complete" &&
    message.status !== "streaming" &&
    message.status !== "stopped" &&
    message.status !== "error"
  ) {
    return null;
  }
  return {
    id: typeof message.id === "string" ? message.id : undefined,
    role: message.role,
    content: message.content,
    status: message.status,
    events: Array.isArray(message.events) ? message.events : [],
    createdAt: typeof message.createdAt === "string" ? message.createdAt : undefined
  };
}
```

- [ ] **Step 2: Create service tests**

Create `packages/backend/src/conversations/conversations.service.spec.ts`:

```ts
import { jest } from "@jest/globals";
import { NotFoundException } from "@nestjs/common";
import { ConversationsService } from "./conversations.service.js";

function createPrisma() {
  const conversations = [
    {
      id: "c1",
      userId: "user-1",
      title: "Active",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
      deletedAt: null,
      messages: [
        {
          id: "m1",
          role: "user" as const,
          content: "你好",
          status: null,
          events: [],
          createdAt: new Date("2026-01-01T00:01:00.000Z")
        }
      ]
    },
    {
      id: "c2",
      userId: "user-1",
      title: "Deleted",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-03T00:00:00.000Z"),
      deletedAt: new Date("2026-01-04T00:00:00.000Z"),
      messages: []
    },
    {
      id: "c3",
      userId: "user-2",
      title: "Other user",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-05T00:00:00.000Z"),
      deletedAt: null,
      messages: []
    }
  ];
  const messages: Array<Record<string, unknown>> = [];

  const prisma = {
    conversation: {
      findMany: jest.fn(({ where }: { where: { userId: string; deletedAt: null } }) => {
        return Promise.resolve(
          conversations.filter((conversation) => {
            return (
              conversation.userId === where.userId &&
              conversation.deletedAt === where.deletedAt
            );
          })
        );
      }),
      findFirst: jest.fn(({ where }: { where: { id: string; userId: string; deletedAt: null } }) => {
        return Promise.resolve(
          conversations.find((conversation) => {
            return (
              conversation.id === where.id &&
              conversation.userId === where.userId &&
              conversation.deletedAt === where.deletedAt
            );
          }) ?? null
        );
      }),
      create: jest.fn(({ data }: { data: { userId: string; title: string } }) => {
        const row = {
          id: `c${conversations.length + 1}`,
          userId: data.userId,
          title: data.title,
          createdAt: new Date("2026-01-06T00:00:00.000Z"),
          updatedAt: new Date("2026-01-06T00:00:00.000Z"),
          deletedAt: null,
          messages: []
        };
        conversations.push(row);
        return Promise.resolve(row);
      }),
      update: jest.fn(({ where }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = conversations.find((conversation) => conversation.id === where.id);
        if (!row) throw new Error("missing conversation");
        return Promise.resolve(row);
      }),
      updateMany: jest.fn(({ where, data }: { where: { id: string; userId: string; deletedAt: null }; data: Record<string, unknown> }) => {
        const row = conversations.find((conversation) => {
          return (
            conversation.id === where.id &&
            conversation.userId === where.userId &&
            conversation.deletedAt === where.deletedAt
          );
        });
        if (!row) return Promise.resolve({ count: 0 });
        Object.assign(row, data);
        return Promise.resolve({ count: 1 });
      })
    },
    message: {
      deleteMany: jest.fn(({ where }: { where: { conversationId: string } }) => {
        for (let index = messages.length - 1; index >= 0; index -= 1) {
          if (messages[index].conversationId === where.conversationId) {
            messages.splice(index, 1);
          }
        }
        return Promise.resolve({ count: 1 });
      }),
      createMany: jest.fn(({ data }: { data: Array<Record<string, unknown>> }) => {
        messages.push(...data);
        return Promise.resolve({ count: data.length });
      })
    },
    $transaction: jest.fn((operations: Array<Promise<unknown>>) => Promise.all(operations))
  };

  return { conversations, messages, prisma };
}

describe("ConversationsService", () => {
  it("lists only non-deleted conversations for the current user", async () => {
    const { prisma } = createPrisma();
    const service = new ConversationsService(prisma as never);

    const result = await service.list("user-1");

    expect(result.conversations).toHaveLength(1);
    expect(result.conversations[0]).toEqual(
      expect.objectContaining({
        id: "c1",
        title: "Active",
        messages: [
          expect.objectContaining({
            id: "m1",
            role: "user",
            content: "你好"
          })
        ]
      })
    );
  });

  it("rejects renaming another user's conversation", async () => {
    const { prisma } = createPrisma();
    const service = new ConversationsService(prisma as never);

    await expect(service.rename("user-1", "c3", "Nope")).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it("replaces messages for a user-owned conversation", async () => {
    const { messages, prisma } = createPrisma();
    const service = new ConversationsService(prisma as never);

    await service.replaceMessages("user-1", "c1", [
      {
        id: "m2",
        role: "assistant",
        content: "你好呀",
        status: "complete",
        events: [{ type: "text-delta", text: "你好呀" }],
        createdAt: "2026-01-01T00:02:00.000Z"
      }
    ]);

    expect(prisma.message.deleteMany).toHaveBeenCalledWith({
      where: { conversationId: "c1" }
    });
    expect(messages).toEqual([
      expect.objectContaining({
        id: "m2",
        conversationId: "c1",
        role: "assistant",
        content: "你好呀",
        status: "complete"
      })
    ]);
  });
});
```

- [ ] **Step 3: Implement conversation service**

Create `packages/backend/src/conversations/conversations.service.ts`:

```ts
import { Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../database/prisma.service.js";
import type { PersistedChatMessage } from "./conversations.types.js";

@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const rows = await this.prisma.conversation.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      include: { messages: { orderBy: { createdAt: "asc" } } }
    });
    return { conversations: rows.map(toConversationDto) };
  }

  async create(userId: string, title = "新对话") {
    const row = await this.prisma.conversation.create({
      data: { userId, title },
      include: { messages: true }
    });
    return { conversation: toConversationDto(row) };
  }

  async rename(userId: string, id: string, title: string) {
    const result = await this.prisma.conversation.updateMany({
      where: { id, userId, deletedAt: null },
      data: { title }
    });
    if (result.count === 0) throw new NotFoundException("Conversation not found.");
    return { ok: true };
  }

  async remove(userId: string, id: string) {
    const result = await this.prisma.conversation.updateMany({
      where: { id, userId, deletedAt: null },
      data: { deletedAt: new Date() }
    });
    if (result.count === 0) throw new NotFoundException("Conversation not found.");
    return { ok: true };
  }

  async replaceMessages(userId: string, id: string, messages: PersistedChatMessage[]) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, userId, deletedAt: null }
    });
    if (!conversation) throw new NotFoundException("Conversation not found.");

    await this.prisma.$transaction([
      this.prisma.message.deleteMany({ where: { conversationId: id } }),
      this.prisma.message.createMany({
        data: messages.map((message) => ({
          id: message.id,
          conversationId: id,
          role: message.role,
          content: message.content,
          status: message.status,
          events: (message.events ?? []) as Prisma.InputJsonValue,
          createdAt: message.createdAt ? new Date(message.createdAt) : new Date()
        }))
      }),
      this.prisma.conversation.update({
        where: { id },
        data: { updatedAt: new Date() }
      })
    ]);

    return { ok: true };
  }

  async importConversations(userId: string, conversations: Array<{ title: string; messages: PersistedChatMessage[] }>) {
    for (const item of conversations) {
      const created = await this.prisma.conversation.create({
        data: { userId, title: item.title || "导入对话" }
      });
      await this.replaceMessages(userId, created.id, item.messages);
    }
    return this.list(userId);
  }
}

function toConversationDto(row: {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  messages: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    status: "complete" | "streaming" | "stopped" | "error" | null;
    events: unknown;
    createdAt: Date;
  }>;
}) {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    messages: row.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      status: message.status ?? undefined,
      events: Array.isArray(message.events) ? message.events : [],
      createdAt: message.createdAt.toISOString()
    }))
  };
}
```

- [ ] **Step 4: Create controller tests**

Create `packages/backend/src/conversations/conversations.controller.spec.ts` with supertest coverage:

```ts
it("requires a user session before listing conversations", async () => {
  // UserSessionService.requireUser rejects, GET /conversations returns 401.
});

it("lists conversations for the current user", async () => {
  // requireUser returns user-1, service.list called with user-1.
});

it("renames a conversation with a valid title", async () => {
  // PATCH /conversations/c1 with { title: "Next" } calls service.rename.
});
```

- [ ] **Step 5: Implement controller and module**

Create `packages/backend/src/conversations/conversations.controller.ts`:

```ts
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  Res
} from "@nestjs/common";
import type { Request, Response } from "express";
import { readUserSessionToken } from "../auth/auth-session.js";
import { UserSessionService } from "../auth/user-session.service.js";
import { ConversationsService } from "./conversations.service.js";
import { parseMessages, parseTitle } from "./conversations.types.js";

@Controller("conversations")
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly sessions: UserSessionService
  ) {}

  @Get()
  async list(@Req() request: Request) {
    const user = await this.sessions.requireUser(readUserSessionToken(request));
    return this.conversations.list(user.id);
  }

  @Post()
  async create(@Req() request: Request, @Body() body: unknown) {
    const user = await this.sessions.requireUser(readUserSessionToken(request));
    return this.conversations.create(user.id, parseTitle(body) ?? "新对话");
  }

  @Post("import")
  async import(@Req() request: Request, @Body() body: unknown) {
    const user = await this.sessions.requireUser(readUserSessionToken(request));
    const conversations = Array.isArray((body as { conversations?: unknown }).conversations)
      ? (body as { conversations: Array<{ title: string; messages: unknown[] }> }).conversations
      : [];
    return this.conversations.importConversations(
      user.id,
      conversations.map((conversation) => ({
        title: typeof conversation.title === "string" ? conversation.title : "导入对话",
        messages: Array.isArray(conversation.messages)
          ? conversation.messages.flatMap((message) => parseMessages({ messages: [message] }) ?? [])
          : []
      }))
    );
  }

  @Patch(":id")
  async rename(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown,
    @Res() response: Response
  ) {
    const title = parseTitle(body);
    if (!title) {
      return response.status(HttpStatus.BAD_REQUEST).json({ message: "Invalid title." });
    }
    const user = await this.sessions.requireUser(readUserSessionToken(request));
    return response.json(await this.conversations.rename(user.id, id, title));
  }

  @Delete(":id")
  async remove(@Req() request: Request, @Param("id") id: string) {
    const user = await this.sessions.requireUser(readUserSessionToken(request));
    return this.conversations.remove(user.id, id);
  }

  @Post(":id/messages")
  async replaceMessages(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown,
    @Res() response: Response
  ) {
    const messages = parseMessages(body);
    if (!messages) {
      return response.status(HttpStatus.BAD_REQUEST).json({ message: "Invalid messages." });
    }
    const user = await this.sessions.requireUser(readUserSessionToken(request));
    return response.json(await this.conversations.replaceMessages(user.id, id, messages));
  }
}
```

Create `packages/backend/src/conversations/conversations.module.ts`:

```ts
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../database/database.module.js";
import { ConversationsController } from "./conversations.controller.js";
import { ConversationsService } from "./conversations.service.js";

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService]
})
export class ConversationsModule {}
```

- [ ] **Step 6: Import conversations module**

Modify `packages/backend/src/app.module.ts` to import `ConversationsModule`.

- [ ] **Step 7: Run conversation tests**

Run:

```bash
pnpm --filter @rednote/backend test -- --runTestsByPath src/conversations/conversations.service.spec.ts src/conversations/conversations.controller.spec.ts
```

Expected: conversation tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/backend/src/conversations packages/backend/src/app.module.ts
git commit -m "feat: persist user conversations"
```

## Task 5: Admin Account Management Backend

**Files:**
- Modify: `packages/backend/src/admin/admin.controller.ts`
- Modify: `packages/backend/src/admin/admin.service.ts`
- Modify: `packages/backend/src/admin/admin.controller.spec.ts`
- Modify: `packages/backend/src/admin/admin.module.ts`
- Test: `packages/backend/src/admin/admin.controller.spec.ts`

- [ ] **Step 1: Add admin service tests**

Extend `packages/backend/src/admin/admin.controller.spec.ts` with:

```ts
it("lists users for authenticated admins", async () => {
  const agent = request.agent(server);
  await agent.post("/admin/login").send({ username: "owner", password: "initial-pass" }).expect(200);

  const response = await agent.get("/admin/users?query=a@example.com").expect(200);

  expect(response.body).toEqual(
    expect.objectContaining({
      users: expect.any(Array),
      page: 1,
      pageSize: 20
    })
  );
});

it("disables users and revokes their sessions", async () => {
  const agent = request.agent(server);
  await agent.post("/admin/login").send({ username: "owner", password: "initial-pass" }).expect(200);

  await agent.patch("/admin/users/user-1/status").send({ status: "disabled" }).expect(200);
});
```

Update `createPrismaStore` in that spec to include `user.findMany`, `user.count`, `user.update`, and `userSession.updateMany` mocks.

- [ ] **Step 2: Add service methods**

In `packages/backend/src/admin/admin.service.ts`, add:

```ts
  async listUsers(options: { query?: string; status?: "enabled" | "disabled"; page?: number }) {
    const page = Math.max(1, options.page ?? 1);
    const pageSize = 20;
    const where = {
      ...(options.query
        ? { email: { contains: options.query.trim().toLowerCase(), mode: "insensitive" as const } }
        : {}),
      ...(options.status ? { status: options.status } : {})
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { conversations: true } } }
      }),
      this.prisma.user.count({ where })
    ]);

    return {
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        status: user.status,
        createdAt: user.createdAt.toISOString(),
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
        conversationCount: user._count.conversations
      })),
      total,
      page,
      pageSize
    };
  }

  async updateUserStatus(userId: string, status: "enabled" | "disabled") {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { status }
    });

    if (status === "disabled") {
      await this.prisma.userSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() }
      });
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        status: user.status,
        createdAt: user.createdAt.toISOString(),
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null
      }
    };
  }
```

Inject `PrismaService` into `AdminService` alongside `AdminStore`.

- [ ] **Step 3: Add admin controller routes**

In `packages/backend/src/admin/admin.controller.ts`, import `Patch`, `Param`, and `Query`. Add:

```ts
  @Get("users")
  async users(@Req() request: Request, @Query() query: Record<string, string | undefined>) {
    this.requireSession(request);
    const status =
      query.status === "enabled" || query.status === "disabled" ? query.status : undefined;
    return this.adminService.listUsers({
      query: query.query,
      status,
      page: query.page ? Number(query.page) : 1
    });
  }

  @Patch("users/:id/status")
  async updateUserStatus(
    @Req() request: Request,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    this.requireSession(request);
    const status =
      body &&
      typeof body === "object" &&
      ((body as Record<string, unknown>).status === "enabled" ||
        (body as Record<string, unknown>).status === "disabled")
        ? ((body as Record<string, "enabled" | "disabled">).status)
        : null;
    if (!status) return { message: "Invalid user status." };
    return this.adminService.updateUserStatus(id, status);
  }
```

- [ ] **Step 4: Run admin backend tests**

Run:

```bash
pnpm --filter @rednote/backend test -- --runTestsByPath src/admin/admin.controller.spec.ts
```

Expected: admin controller tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/backend/src/admin
git commit -m "feat: add admin user management api"
```

## Task 6: Frontend Proxy Routes

**Files:**
- Create: `packages/web-frontend/src/app/api/shared/backend-proxy.ts`
- Create: `packages/web-frontend/src/app/api/auth/code/route.ts`
- Create: `packages/web-frontend/src/app/api/auth/login/route.ts`
- Create: `packages/web-frontend/src/app/api/auth/logout/route.ts`
- Create: `packages/web-frontend/src/app/api/auth/session/route.ts`
- Create: `packages/web-frontend/src/app/api/conversations/route.ts`
- Create: `packages/web-frontend/src/app/api/conversations/[id]/route.ts`
- Create: `packages/web-frontend/src/app/api/conversations/[id]/messages/route.ts`
- Create: `packages/web-frontend/src/app/api/admin/users/route.ts`
- Create: `packages/web-frontend/src/app/api/admin/users/[id]/status/route.ts`
- Modify: `packages/web-frontend/src/app/api/admin/proxy.ts`
- Modify: `packages/web-frontend/src/app/api/agent/chat/route.ts`
- Test: `packages/web-frontend/src/app/api/admin/proxy.test.mjs`
- Test: `packages/web-frontend/src/app/api/agent/chat/route.test.mjs`

- [ ] **Step 1: Create shared proxy helper**

Create `packages/web-frontend/src/app/api/shared/backend-proxy.ts`:

```ts
export const BACKEND_AGENT_BASE_URL =
  process.env.BACKEND_AGENT_BASE_URL ?? "http://localhost:3001";

export async function proxyBackendRequest(request: Request, backendPath: string) {
  const target = `${BACKEND_AGENT_BASE_URL}/${backendPath}${new URL(request.url).search}`;
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  const cookie = request.headers.get("cookie");

  if (contentType) headers.set("Content-Type", contentType);
  if (cookie) headers.set("Cookie", cookie);

  const response = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === "GET" ? undefined : await request.text()
  });

  const responseHeaders = new Headers();
  const setCookie = response.headers.get("set-cookie");
  const responseContentType = response.headers.get("content-type");
  const cacheControl = response.headers.get("cache-control");

  if (setCookie) responseHeaders.set("set-cookie", setCookie);
  if (responseContentType) responseHeaders.set("Content-Type", responseContentType);
  if (cacheControl) responseHeaders.set("Cache-Control", cacheControl);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders
  });
}
```

- [ ] **Step 2: Reuse proxy helper for admin**

Replace `packages/web-frontend/src/app/api/admin/proxy.ts` body with:

```ts
import { proxyBackendRequest } from "../shared/backend-proxy";

export async function proxyAdminRequest(request: Request, adminPath: string) {
  return proxyBackendRequest(request, `admin/${adminPath}`);
}
```

- [ ] **Step 3: Add auth routes**

Each file exports the matching method:

`packages/web-frontend/src/app/api/auth/code/route.ts`:

```ts
import { proxyBackendRequest } from "../../shared/backend-proxy";

export const runtime = "nodejs";

export function POST(request: Request) {
  return proxyBackendRequest(request, "auth/code");
}
```

`packages/web-frontend/src/app/api/auth/login/route.ts`:

```ts
import { proxyBackendRequest } from "../../shared/backend-proxy";

export const runtime = "nodejs";

export function POST(request: Request) {
  return proxyBackendRequest(request, "auth/login");
}
```

`packages/web-frontend/src/app/api/auth/logout/route.ts`:

```ts
import { proxyBackendRequest } from "../../shared/backend-proxy";

export const runtime = "nodejs";

export function POST(request: Request) {
  return proxyBackendRequest(request, "auth/logout");
}
```

`packages/web-frontend/src/app/api/auth/session/route.ts`:

```ts
import { proxyBackendRequest } from "../../shared/backend-proxy";

export const runtime = "nodejs";

export function GET(request: Request) {
  return proxyBackendRequest(request, "auth/session");
}
```

- [ ] **Step 4: Add conversation routes**

`packages/web-frontend/src/app/api/conversations/route.ts`:

```ts
import { proxyBackendRequest } from "../shared/backend-proxy";

export const runtime = "nodejs";

export function GET(request: Request) {
  return proxyBackendRequest(request, "conversations");
}

export function POST(request: Request) {
  return proxyBackendRequest(request, "conversations");
}
```

`packages/web-frontend/src/app/api/conversations/[id]/route.ts`:

```ts
import { proxyBackendRequest } from "../../shared/backend-proxy";

export const runtime = "nodejs";

export function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return context.params.then(({ id }) =>
    proxyBackendRequest(request, `conversations/${encodeURIComponent(id)}`),
  );
}

export function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  return context.params.then(({ id }) =>
    proxyBackendRequest(request, `conversations/${encodeURIComponent(id)}`),
  );
}
```

`packages/web-frontend/src/app/api/conversations/[id]/messages/route.ts`:

```ts
import { proxyBackendRequest } from "../../../shared/backend-proxy";

export const runtime = "nodejs";

export function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return context.params.then(({ id }) =>
    proxyBackendRequest(request, `conversations/${encodeURIComponent(id)}/messages`),
  );
}
```

- [ ] **Step 5: Add admin user proxy routes**

`packages/web-frontend/src/app/api/admin/users/route.ts`:

```ts
import { proxyAdminRequest } from "../proxy";

export const runtime = "nodejs";

export function GET(request: Request) {
  return proxyAdminRequest(request, "users");
}
```

`packages/web-frontend/src/app/api/admin/users/[id]/status/route.ts`:

```ts
import { proxyAdminRequest } from "../../../proxy";

export const runtime = "nodejs";

export function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return context.params.then(({ id }) =>
    proxyAdminRequest(request, `users/${encodeURIComponent(id)}/status`),
  );
}
```

- [ ] **Step 6: Forward cookies in agent chat route**

Modify `packages/web-frontend/src/app/api/agent/chat/route.ts` to import `BACKEND_AGENT_BASE_URL`, set `Cookie` when present, and preserve backend 401 responses. The headers block should include:

```ts
      headers: {
        "Content-Type":
          request.headers.get("content-type") ?? "application/json",
        ...(request.headers.get("cookie")
          ? { Cookie: request.headers.get("cookie") as string }
          : {}),
      },
```

- [ ] **Step 7: Update proxy tests**

Extend `packages/web-frontend/src/app/api/admin/proxy.test.mjs` and `packages/web-frontend/src/app/api/agent/chat/route.test.mjs` to assert:

```js
assert.match(routeSource, /Cookie/);
assert.match(proxySource, /set-cookie/);
assert.match(proxySource, /proxyBackendRequest/);
```

- [ ] **Step 8: Run frontend route tests**

Run:

```bash
pnpm --filter @mira/web-frontend test -- src/app/api/admin/proxy.test.mjs src/app/api/agent/chat/route.test.mjs
```

Expected: proxy tests pass.

- [ ] **Step 9: Commit**

```bash
git add packages/web-frontend/src/app/api
git commit -m "feat: proxy auth and conversation routes"
```

## Task 7: Frontend Auth Gate And Login UI

**Files:**
- Create: `packages/web-frontend/src/app/auth/auth-types.ts`
- Create: `packages/web-frontend/src/app/auth/auth-api.ts`
- Create: `packages/web-frontend/src/app/auth/use-auth-session.ts`
- Create: `packages/web-frontend/src/app/auth/email-login-panel.tsx`
- Create: `packages/web-frontend/src/app/auth/email-login-panel.test.mjs`
- Modify: `packages/web-frontend/src/app/page.tsx`
- Modify: `packages/web-frontend/src/app/globals.css` only if an existing shared token needs a small addition.

- [ ] **Step 1: Apply frontend-design direction**

Use the `frontend-design` skill direction for this surface:

```text
Purpose: Let a returning or new Mira user enter the workspace with minimal friction.
Tone: Refined product utility, quiet editorial desk, not landing page and not generic AI chat.
Constraints: Next client components, Tailwind utilities, existing OKLCH tokens, 13px base font, WCAG AA, mobile-first form controls.
Memorable detail: The login panel previews the protected workspace as a compact "recent work" strip, making the account feel like a doorway back to work rather than a marketing sign-up wall.
```

Do not add a hero page. The first screen is the actual auth task.

- [ ] **Step 2: Create auth types**

Create `packages/web-frontend/src/app/auth/auth-types.ts`:

```ts
export type AuthUser = {
  id: string;
  email: string;
  status: "enabled" | "disabled";
};

export type AuthSession = {
  user: AuthUser;
};

export type AuthState =
  | { status: "checking"; user: null }
  | { status: "guest"; user: null }
  | { status: "ready"; user: AuthUser };
```

- [ ] **Step 3: Create auth API client**

Create `packages/web-frontend/src/app/auth/auth-api.ts`:

```ts
import type { AuthSession } from "./auth-types";

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json().catch(() => ({}))) as T;
}

export async function loadAuthSession() {
  const response = await fetch("/api/auth/session");
  if (!response.ok) return null;
  return readJson<AuthSession>(response);
}

export async function requestEmailCode(email: string) {
  const response = await fetch("/api/auth/code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email })
  });
  if (!response.ok) {
    const body = await readJson<{ message?: string }>(response);
    throw new Error(body.message ?? "验证码发送失败");
  }
}

export async function loginWithEmailCode(email: string, code: string) {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code })
  });
  if (!response.ok) {
    const body = await readJson<{ message?: string }>(response);
    throw new Error(body.message ?? "登录失败");
  }
  return readJson<AuthSession>(response);
}

export async function logoutAuthSession() {
  await fetch("/api/auth/logout", { method: "POST" });
}
```

- [ ] **Step 4: Create session hook**

Create `packages/web-frontend/src/app/auth/use-auth-session.ts`:

```ts
"use client";

import { useEffect, useState } from "react";
import { loadAuthSession, logoutAuthSession } from "./auth-api";
import type { AuthState, AuthUser } from "./auth-types";

export function useAuthSession() {
  const [state, setState] = useState<AuthState>({ status: "checking", user: null });

  useEffect(() => {
    let active = true;
    loadAuthSession()
      .then((session) => {
        if (!active) return;
        setState(session ? { status: "ready", user: session.user } : { status: "guest", user: null });
      })
      .catch(() => {
        if (!active) return;
        setState({ status: "guest", user: null });
      });
    return () => {
      active = false;
    };
  }, []);

  return {
    state,
    setUser(user: AuthUser) {
      setState({ status: "ready", user });
    },
    async logout() {
      await logoutAuthSession();
      setState({ status: "guest", user: null });
    }
  };
}
```

- [ ] **Step 5: Create login UI component**

Create `packages/web-frontend/src/app/auth/email-login-panel.tsx`:

```tsx
"use client";

import { ArrowRight, Loader2, Mail, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import { loginWithEmailCode, requestEmailCode } from "./auth-api";
import type { AuthUser } from "./auth-types";

type Phase = "email" | "code";

export function EmailLoginPanel({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const [phase, setPhase] = useState<Phase>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      if (phase === "email") {
        await requestEmailCode(email);
        setPhase("code");
        setMessage("验证码已发送，请查看邮箱");
      } else {
        const session = await loginWithEmailCode(email, code);
        onLogin(session.user);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "操作失败，请稍后再试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--background)] px-4 py-8 text-[var(--ink)]">
      <section className="grid w-full max-w-5xl overflow-hidden rounded-[12px] border border-[var(--border)] bg-[var(--surface)] md:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.72fr)]">
        <div className="hidden border-r border-[var(--border)] bg-[color-mix(in_oklch,var(--surface-muted)_70%,var(--surface))] p-8 md:block">
          <img alt="Mira" className="h-9 w-auto" src="/brand/mira-logo.svg" />
          <div className="mt-14 max-w-[460px]">
            <h1 className="text-[24px] leading-[1.18] font-[720] text-balance">
              回到你的 Mira 工作台
            </h1>
            <p className="mt-3 max-w-[52ch] text-[13px] leading-6 text-[var(--muted-strong)]">
              使用邮箱验证码登录。新邮箱会自动创建账号，对话记录会保存在当前账号下。
            </p>
          </div>
          <div className="mt-10 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-center gap-2 text-sm font-[700]">
              <ShieldCheck aria-hidden="true" size={16} />
              账号会保护这些内容
            </div>
            <div className="mt-4 space-y-3 text-[13px] text-[var(--muted-strong)]">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
                <span>对话记录</span>
                <span className="font-[650] text-[var(--ink)]">按邮箱归档</span>
              </div>
              <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
                <span>设备切换</span>
                <span className="font-[650] text-[var(--ink)]">继续编辑</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>访问权限</span>
                <span className="font-[650] text-[var(--ink)]">管理员可控</span>
              </div>
            </div>
          </div>
        </div>

        <form className="p-5 sm:p-7" onSubmit={submit}>
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] bg-[var(--accent-subtle)] text-[var(--accent-strong)]">
            <Mail aria-hidden="true" size={19} />
          </div>
          <h2 className="mt-5 text-[20px] leading-tight font-[720]">
            {phase === "email" ? "邮箱登录或注册" : "输入验证码"}
          </h2>
          <p className="mt-2 text-[13px] leading-6 text-[var(--muted-strong)]">
            {phase === "email"
              ? "输入你的常用邮箱，Mira 会发送一个 6 位验证码。"
              : `验证码已发送到 ${email}`}
          </p>

          <label className="mt-6 block text-[13px] font-[650]">
            邮箱
            <input
              autoComplete="email"
              className="mt-2 h-10 w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-[13px] text-[var(--ink)] placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
              disabled={phase === "code"}
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              type="email"
              value={email}
            />
          </label>

          {phase === "code" ? (
            <label className="mt-4 block text-[13px] font-[650]">
              验证码
              <input
                autoComplete="one-time-code"
                className="mt-2 h-10 w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] px-3 font-mono text-[13px] tracking-[0.18em] text-[var(--ink)] placeholder:tracking-0 placeholder:text-[var(--muted)] focus:border-[var(--accent)]"
                inputMode="numeric"
                maxLength={6}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                value={code}
              />
            </label>
          ) : null}

          {message ? (
            <div className="mt-4 rounded-[8px] bg-[var(--accent-subtle)] px-3 py-2 text-[13px] leading-5 text-[var(--accent-strong)]">
              {message}
            </div>
          ) : null}

          <button
            className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-[9px] bg-[var(--accent)] px-3 text-[13px] font-[700] text-white hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-55"
            disabled={submitting || !email.trim() || (phase === "code" && code.length !== 6)}
            type="submit"
          >
            {submitting ? <Loader2 aria-hidden="true" className="animate-spin" size={15} /> : null}
            {phase === "email" ? "发送验证码" : "登录 Mira"}
            {!submitting ? <ArrowRight aria-hidden="true" size={15} /> : null}
          </button>

          {phase === "code" ? (
            <button
              className="mt-3 h-9 text-[13px] font-[650] text-[var(--muted-strong)] hover:text-[var(--ink)]"
              onClick={() => {
                setPhase("email");
                setCode("");
                setMessage("");
              }}
              type="button"
            >
              换一个邮箱
            </button>
          ) : null}
        </form>
      </section>
    </main>
  );
}
```

- [ ] **Step 6: Gate page by auth state**

Modify `packages/web-frontend/src/app/page.tsx`:

```tsx
"use client";

import { EmailLoginPanel } from "./auth/email-login-panel";
import { useAuthSession } from "./auth/use-auth-session";
import { AgentWorkspaceShell } from "./agent-workspace/components";
import { useAgentConversation } from "./agent-workspace/use-agent-conversation";

export default function Home() {
  const auth = useAuthSession();
  const workspace = useAgentConversation(auth.state.status === "ready" ? auth.state.user : null);

  if (auth.state.status === "checking") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[var(--background)] px-6 text-[var(--muted)]">
        正在检查登录状态
      </main>
    );
  }

  if (auth.state.status === "guest") {
    return <EmailLoginPanel onLogin={auth.setUser} />;
  }

  return (
    <AgentWorkspaceShell
      activeConversation={workspace.activeConversation}
      conversations={workspace.conversations}
      onDelete={workspace.deleteConversation}
      onNew={workspace.startNewConversation}
      onPrompt={workspace.sendMessage}
      onRename={workspace.renameConversation}
      onRetry={workspace.retryLastUserMessage}
      onSelect={workspace.selectConversation}
      onSend={workspace.sendMessage}
      onStop={workspace.stop}
      sendState={workspace.sendState}
      storageWarning={workspace.storageWarning}
    />
  );
}
```

- [ ] **Step 7: Add login UI source tests**

Create `packages/web-frontend/src/app/auth/email-login-panel.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "email-login-panel.tsx"),
  "utf8",
);

test("email login panel uses the email code flow", () => {
  assert.match(source, /requestEmailCode/);
  assert.match(source, /loginWithEmailCode/);
  assert.match(source, /one-time-code/);
});

test("email login panel does not create a landing page", () => {
  assert.doesNotMatch(source, /hero/i);
  assert.match(source, /邮箱登录或注册/);
  assert.match(source, /发送验证码/);
});
```

- [ ] **Step 8: Run frontend tests**

Run:

```bash
pnpm --filter @mira/web-frontend test -- src/app/auth/email-login-panel.test.mjs
```

Expected: login panel tests pass.

- [ ] **Step 9: Commit**

```bash
git add packages/web-frontend/src/app/auth packages/web-frontend/src/app/page.tsx packages/web-frontend/src/app/globals.css
git commit -m "feat: add email login screen"
```

## Task 8: Frontend Conversation Persistence

**Files:**
- Create: `packages/web-frontend/src/app/agent-workspace/conversation-api.ts`
- Modify: `packages/web-frontend/src/app/agent-workspace/use-agent-conversation.ts`
- Modify: `packages/web-frontend/src/app/agent-workspace/storage.ts`
- Modify: `packages/web-frontend/src/app/agent-workspace/types.ts`
- Test: `packages/web-frontend/src/app/agent-workspace/storage.test.mjs`
- Test: `packages/web-frontend/src/app/agent-workspace/conversation-actions.test.mjs`

- [ ] **Step 1: Create conversation API client**

Create `packages/web-frontend/src/app/agent-workspace/conversation-api.ts`:

```ts
import type { ChatMessage, Conversation } from "./types";

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json().catch(() => ({}))) as T;
}

export async function loadRemoteConversations() {
  const response = await fetch("/api/conversations");
  if (!response.ok) throw new Error("对话记录加载失败");
  return readJson<{ conversations: Conversation[] }>(response);
}

export async function createRemoteConversation(title = "新对话") {
  const response = await fetch("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title })
  });
  if (!response.ok) throw new Error("新对话创建失败");
  return readJson<{ conversation: Conversation }>(response);
}

export async function renameRemoteConversation(id: string, title: string) {
  await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title })
  });
}

export async function deleteRemoteConversation(id: string) {
  await fetch(`/api/conversations/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function saveRemoteMessages(id: string, messages: ChatMessage[]) {
  await fetch(`/api/conversations/${encodeURIComponent(id)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages })
  });
}

export async function importRemoteConversations(conversations: Conversation[]) {
  const response = await fetch("/api/conversations/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversations })
  });
  if (!response.ok) throw new Error("本地对话导入失败");
  return readJson<{ conversations: Conversation[] }>(response);
}
```

- [ ] **Step 2: Add legacy migration marker helpers**

In `packages/web-frontend/src/app/agent-workspace/storage.ts`, add:

```ts
const MIGRATION_PREFIX = "mira.agent-workspace.migrated.";

export function hasMigratedLegacyConversations(userId: string) {
  return window.localStorage.getItem(`${MIGRATION_PREFIX}${userId}`) === "1";
}

export function markLegacyConversationsMigrated(userId: string) {
  window.localStorage.setItem(`${MIGRATION_PREFIX}${userId}`, "1");
}
```

Keep existing `loadWorkspaceState` so old local data can be imported.

- [ ] **Step 3: Update hook signature and remote loading**

Modify `useAgentConversation` to accept `user: AuthUser | null`:

```ts
export function useAgentConversation(user: AuthUser | null) {
```

When `user` becomes available:

1. Load `/api/conversations`.
2. If no remote conversations exist and old local storage exists and not migrated, import old local conversations.
3. If no conversations exist at all, create one remote conversation.
4. Set workspace from remote conversations.

Use `storageLoadedRef` only for legacy import and stop saving every workspace update to `localStorage` as the main source of truth.

- [ ] **Step 4: Sync conversation actions**

Update callbacks:

- `startNewConversation`: call `createRemoteConversation`, optimistically show local conversation, then reconcile ID from backend.
- `rename`: update local state, then call `renameRemoteConversation`.
- `remove`: update local state, then call `deleteRemoteConversation`.
- `sendMessage`: after user and assistant messages are updated, call `saveRemoteMessages(requestConversationId, conversation.messages)`.
- On stream error, save the error-state assistant message too.

- [ ] **Step 5: Add tests for legacy marker**

Extend `packages/web-frontend/src/app/agent-workspace/storage.test.mjs`:

```js
test("tracks legacy migration per user", async () => {
  const { hasMigratedLegacyConversations, markLegacyConversationsMigrated } = await import("./storage.mjs");
  localStorage.clear();
  assert.equal(hasMigratedLegacyConversations("user-1"), false);
  markLegacyConversationsMigrated("user-1");
  assert.equal(hasMigratedLegacyConversations("user-1"), true);
});
```

Mirror exports in `storage.mjs` if tests import the JS mirror.

- [ ] **Step 6: Run workspace tests**

Run:

```bash
pnpm --filter @mira/web-frontend test -- src/app/agent-workspace/storage.test.mjs src/app/agent-workspace/conversation-actions.test.mjs
```

Expected: workspace storage/action tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/web-frontend/src/app/agent-workspace packages/web-frontend/src/app/page.tsx
git commit -m "feat: sync conversations by user"
```

## Task 9: Admin Frontend Account Management

**Files:**
- Modify: `packages/web-frontend/src/app/admin/admin-types.ts`
- Create: `packages/web-frontend/src/app/admin/admin-api.ts`
- Create: `packages/web-frontend/src/app/admin/admin-login-panel.tsx`
- Create: `packages/web-frontend/src/app/admin/admin-password-panel.tsx`
- Create: `packages/web-frontend/src/app/admin/admin-secrets-panel.tsx`
- Create: `packages/web-frontend/src/app/admin/admin-users-panel.tsx`
- Modify: `packages/web-frontend/src/app/admin/admin-shell.tsx`
- Test: `packages/web-frontend/src/app/admin/admin-copy.test.mjs`

- [ ] **Step 1: Extend admin types**

Add to `packages/web-frontend/src/app/admin/admin-types.ts`:

```ts
export type AdminUser = {
  id: string;
  email: string;
  status: "enabled" | "disabled";
  createdAt: string;
  lastLoginAt: string | null;
  conversationCount: number;
};

export type AdminUsersResponse = {
  users: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
};
```

- [ ] **Step 2: Extract admin API client**

Create `packages/web-frontend/src/app/admin/admin-api.ts` with functions:

```ts
export async function loadAdminUsers(query = "", status = "") {
  const params = new URLSearchParams();
  if (query) params.set("query", query);
  if (status) params.set("status", status);
  const response = await fetch(`/api/admin/users?${params}`);
  if (!response.ok) throw new Error("用户列表加载失败");
  return (await response.json()) as AdminUsersResponse;
}

export async function updateAdminUserStatus(id: string, status: "enabled" | "disabled") {
  const response = await fetch(`/api/admin/users/${encodeURIComponent(id)}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status })
  });
  if (!response.ok) throw new Error("用户状态更新失败");
}
```

Also move existing admin login/secrets/password fetch helpers into this file or leave them in shell if the extraction would be too wide.

- [ ] **Step 3: Extract existing panels**

Move existing `LoginPanel`, `PasswordPanel`, and `SecretsPanel` from `admin-shell.tsx` into:

- `admin-login-panel.tsx`
- `admin-password-panel.tsx`
- `admin-secrets-panel.tsx`

Keep behavior identical while reducing `admin-shell.tsx` to layout/state orchestration.

- [ ] **Step 4: Create users panel**

Create `packages/web-frontend/src/app/admin/admin-users-panel.tsx`:

```tsx
"use client";

import { RefreshCw, Search, ShieldOff, ShieldCheck, UsersRound } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { loadAdminUsers, updateAdminUserStatus } from "./admin-api";
import type { AdminUser } from "./admin-types";

export function AdminUsersPanel({ onMessage }: { onMessage: (message: string) => void }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await loadAdminUsers(query, status);
      setUsers(data.users);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "用户列表加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await load();
  }

  async function toggle(user: AdminUser) {
    const nextStatus = user.status === "enabled" ? "disabled" : "enabled";
    await updateAdminUserStatus(user.id, nextStatus);
    onMessage(nextStatus === "disabled" ? "用户已禁用" : "用户已启用");
    await load();
  }

  return (
    <section className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-[700]">
            <UsersRound aria-hidden="true" size={17} />
            账号管理
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            查看用户账号，禁用后会立即失效当前登录会话。
          </p>
        </div>
        <button
          className="inline-flex h-9 items-center gap-2 rounded-[9px] border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm hover:bg-[var(--surface-muted)]"
          onClick={() => void load()}
          type="button"
        >
          <RefreshCw aria-hidden="true" size={15} />
          刷新
        </button>
      </div>

      <form className="mt-4 flex flex-wrap gap-2" onSubmit={submit}>
        <label className="relative min-w-[220px] flex-1">
          <Search aria-hidden="true" className="absolute top-1/2 left-3 -translate-y-1/2 text-[var(--muted)]" size={15} />
          <input
            className="h-10 w-full rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] pr-3 pl-9 text-sm"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索邮箱"
            value={query}
          />
        </label>
        <select
          className="h-10 rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm"
          onChange={(event) => setStatus(event.target.value)}
          value={status}
        >
          <option value="">全部状态</option>
          <option value="enabled">已启用</option>
          <option value="disabled">已禁用</option>
        </select>
        <button className="h-10 rounded-[9px] bg-[var(--accent)] px-4 text-sm font-[700] text-white" type="submit">
          搜索账号
        </button>
      </form>

      <div className="mt-4 overflow-hidden rounded-[8px] border border-[var(--border)]">
        {users.length === 0 ? (
          <div className="bg-[var(--surface-raised)] px-4 py-8 text-center text-sm text-[var(--muted)]">
            {loading ? "正在加载用户" : "暂无用户"}
          </div>
        ) : (
          users.map((user) => (
            <div
              className="grid gap-3 border-b border-[var(--border)] bg-[var(--surface-raised)] p-3 last:border-b-0 md:grid-cols-[minmax(0,1fr)_120px_140px_auto]"
              key={user.id}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-[650]">{user.email}</div>
                <div className="mt-1 text-xs text-[var(--muted)]">
                  创建：{new Date(user.createdAt).toLocaleString()}
                </div>
              </div>
              <div className="text-xs text-[var(--muted)]">
                对话 {user.conversationCount}
              </div>
              <div className="text-xs text-[var(--muted)]">
                最近登录：{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "无"}
              </div>
              <button
                className="inline-flex h-9 items-center justify-center gap-2 rounded-[9px] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-[650] hover:bg-[var(--surface-muted)]"
                onClick={() => void toggle(user)}
                type="button"
              >
                {user.status === "enabled" ? <ShieldOff aria-hidden="true" size={15} /> : <ShieldCheck aria-hidden="true" size={15} />}
                {user.status === "enabled" ? "禁用" : "启用"}
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Wire panel into admin shell**

Update `admin-shell.tsx` layout to include `AdminUsersPanel` as a full-width or right-column panel under Key 管理. Keep sections aligned on desktop:

```tsx
<div className="mx-auto grid max-w-6xl gap-4 px-5 py-5 lg:grid-cols-[320px_minmax(0,1fr)]">
  <AccountInfoPanel session={session} onMessage={setMessage} />
  <div className="grid gap-4">
    <AdminUsersPanel onMessage={setMessage} />
    <AdminSecretsPanel
      onMessage={setMessage}
      onSecrets={setSecrets}
      secrets={secrets}
    />
  </div>
</div>
```

- [ ] **Step 6: Update admin copy tests**

Extend `packages/web-frontend/src/app/admin/admin-copy.test.mjs`:

```js
assert.match(source, /账号管理/);
assert.match(source, /搜索邮箱/);
assert.match(source, /禁用/);
assert.match(source, /启用/);
```

- [ ] **Step 7: Run admin frontend tests**

Run:

```bash
pnpm --filter @mira/web-frontend test -- src/app/admin/admin-copy.test.mjs
```

Expected: admin copy tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/web-frontend/src/app/admin packages/web-frontend/src/app/api/admin/users
git commit -m "feat: add admin account management"
```

## Task 10: Frontend Design Review And Impeccable Polish

**Files:**
- Review targets and allowed visual-fix files:
  - `packages/web-frontend/src/app/auth/email-login-panel.tsx`
  - `packages/web-frontend/src/app/admin/admin-users-panel.tsx`
  - `packages/web-frontend/src/app/agent-workspace/workspace-shell.tsx`
  - `packages/web-frontend/src/app/globals.css`

- [ ] **Step 1: Run impeccable setup**

Run once:

```bash
node /Users/szw/.agents/skills/impeccable/scripts/context.mjs
```

Expected: it prints `PRODUCT.md` and says the register is `product`.

- [ ] **Step 2: Read impeccable product register**

Read:

```bash
sed -n '1,260p' /Users/szw/.agents/skills/impeccable/reference/product.md
```

Apply these checks to the login and admin account surfaces:

- Product UI should feel task-first, not like a marketing landing page.
- Use existing component vocabulary and Tailwind utility classes.
- No decorative motion, nested cards, gradient text, oversized radii, or soft border-plus-large-shadow card pattern.
- Placeholder and muted text must remain readable.
- Mobile controls must be reachable and not overflow.

- [ ] **Step 3: Start local dev servers**

Run:

```bash
pnpm dev
```

Expected: backend starts on `http://localhost:3001` and frontend starts on the Next dev port.

- [ ] **Step 4: Browser QA login surface**

Use Browser or Playwright to open the frontend. Verify:

- Logged-out home shows the email login panel.
- Desktop 1440px: panel is centered, aligned, not a marketing hero, no overflowing text.
- Mobile 390px: form controls are full-width, readable, and the protected-workspace preview does not create horizontal scroll.
- Keyboard focus is visible on buttons and inputs.
- Error/success messages appear under the relevant form area.

- [ ] **Step 5: Browser QA admin surface**

Log into `/admin` and verify:

- Account info, 账号管理, and Key 管理 align on desktop.
- Mobile shows all controls, including search, filter, enable/disable buttons, and Key inputs.
- No control text overflows.
- Disabled/enabled states are clear without relying only on color.

- [ ] **Step 6: Apply polish fixes**

For every defect found in Steps 4-5, make a focused Tailwind-only edit in one of the listed files. Use these exact fix patterns:

- Text overflow in the login panel: add `min-w-0`, `truncate`, or a smaller fixed text size on the overflowing element.
- Mobile horizontal scroll: replace fixed widths with `w-full`, `max-w-*`, or responsive grid columns.
- Weak placeholder contrast: change placeholder classes to `placeholder:text-[var(--muted-strong)]`.
- Misaligned admin columns: use a shared grid wrapper and keep section borders on the same parent width.
- Missing visible state: add icon plus text for enabled/disabled status, not color alone.

Keep custom CSS out unless updating an existing token in `globals.css`.

- [ ] **Step 7: Re-run screenshots**

Repeat desktop and mobile screenshots after fixes. Expected: no overlap, no horizontal scroll, no missing controls, no generic landing-page feel.

- [ ] **Step 8: Commit**

```bash
git add packages/web-frontend/src/app/auth packages/web-frontend/src/app/admin packages/web-frontend/src/app/agent-workspace packages/web-frontend/src/app/globals.css
git commit -m "style: polish auth and account management ui"
```

## Task 11: End-To-End Verification

**Files:**
- Review: all files changed by Tasks 1-10.
- Allowed fixes: the smallest source file set that directly causes a failing command or failed manual verification step.

- [ ] **Step 1: Run backend test suite**

```bash
pnpm --filter @rednote/backend test
```

Expected: all backend tests pass.

- [ ] **Step 2: Run backend lint and build**

```bash
pnpm --filter @rednote/backend lint
pnpm --filter @rednote/backend build
```

Expected: lint and TypeScript build pass.

- [ ] **Step 3: Run frontend test suite**

```bash
pnpm --filter @mira/web-frontend test
```

Expected: all frontend node tests pass.

- [ ] **Step 4: Run frontend lint and build**

```bash
pnpm --filter @mira/web-frontend lint
pnpm --filter @mira/web-frontend build
```

Expected: lint and Next build pass.

- [ ] **Step 5: Check formatting hazards**

```bash
git diff --check
```

Expected: no whitespace or conflict-marker warnings.

- [ ] **Step 6: Run migration deploy locally or against a test database**

```bash
pnpm --filter @rednote/backend prisma:migrate:deploy
```

Expected: migration applies successfully or reports no pending migrations on an already-migrated database.

- [ ] **Step 7: Manual flow verification**

Verify in browser:

- Request email code in development and read the code from backend logs if Resend is not configured.
- Submit code and land in chat.
- Refresh and stay logged in.
- Create, rename, delete, and reload a conversation.
- Send a prompt and verify the backend requires the user cookie.
- Open admin, search the user, disable the user, and verify chat access stops.
- Re-enable the user and verify login works again.

- [ ] **Step 8: Final commit for verification fixes**

When Steps 1-7 produce source changes, commit them with:

```bash
git add packages/backend packages/web-frontend pnpm-lock.yaml
git commit -m "fix: verify email auth flows"
```

When Steps 1-7 produce no source changes, skip this commit.

## Self-Review

- Spec coverage: Tasks cover database models, email code auth, user sessions, Resend managed secrets, admin user management, conversation persistence, frontend auth gate, localStorage migration, agent gating, UI design, impeccable review, and verification.
- UI skill coverage: Task 7 explicitly applies `frontend-design`; Task 10 explicitly runs `impeccable` context and product-register review before polish.
- Scope: This remains one coherent implementation because user auth, user-owned conversations, and admin user management depend on the same user/session model. Hard delete, social login, passwords, organizations, billing, and quotas stay out of scope.
- Type consistency: Public user fields are `id`, `email`, and `status`; conversation DTOs match the existing frontend `Conversation` and `ChatMessage` shape.
- Placeholder scan: No `TBD`, `TODO`, or "implement later" placeholders are intentional plan steps.
