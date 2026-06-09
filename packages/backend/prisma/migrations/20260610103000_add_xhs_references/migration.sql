-- CreateTable
CREATE TABLE "XhsReference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "providerType" TEXT NOT NULL,
    "providerEndpoint" TEXT,
    "sourceId" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "title" TEXT NOT NULL,
    "imported" TEXT NOT NULL,
    "analysis" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "XhsReference_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "XhsReference_conversationId_kind_sourceId_key" ON "XhsReference"("conversationId", "kind", "sourceId");

-- CreateIndex
CREATE INDEX "XhsReference_conversationId_createdAt_idx" ON "XhsReference"("conversationId", "createdAt");
