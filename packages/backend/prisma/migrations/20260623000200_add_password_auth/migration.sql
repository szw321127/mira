ALTER TABLE "users" ADD COLUMN "username" TEXT;
ALTER TABLE "users" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "users" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

UPDATE "users"
SET "emailVerifiedAt" = COALESCE("lastLoginAt", "createdAt")
WHERE "email" IS NOT NULL;

ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

CREATE UNIQUE INDEX "users_username_key" ON "users"("username");
