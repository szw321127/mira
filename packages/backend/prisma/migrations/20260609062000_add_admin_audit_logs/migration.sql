-- CreateTable
CREATE TABLE "AdminAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetKey" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "metadata" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "AdminAuditLog_targetType_targetKey_createdAt_idx" ON "AdminAuditLog"("targetType", "targetKey", "createdAt");
