CREATE TABLE "XhsResearchRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "idea" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "providerType" TEXT NOT NULL,
    "providerEndpoint" TEXT,
    "keywords" TEXT NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "samples" TEXT NOT NULL,
    "analysis" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "XhsResearchRun_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "XhsResearchRun_conversationId_createdAt_idx" ON "XhsResearchRun"("conversationId", "createdAt");
