CREATE TABLE "XhsAuthorization" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'xhs',
    "subType" TEXT NOT NULL DEFAULT 'pc',
    "accountId" TEXT,
    "accountName" TEXT,
    "avatarUrl" TEXT,
    "cookieEncrypted" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastValidatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "XhsAuthorization_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "XhsAuthorization_userId_status_updatedAt_idx" ON "XhsAuthorization"("userId", "status", "updatedAt");
