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
