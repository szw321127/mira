-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PostDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "outlineId" TEXT,
    "title" TEXT NOT NULL,
    "coverLine" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "imagePrompt" TEXT NOT NULL,
    "imageUrl" TEXT,
    "imageStatus" TEXT NOT NULL DEFAULT 'idle',
    "imageProvider" TEXT,
    "imageError" TEXT,
    "imageGeneratedAt" DATETIME,
    "sections" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PostDraft_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PostDraft_outlineId_fkey" FOREIGN KEY ("outlineId") REFERENCES "Outline" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PostDraft" ("caption", "conversationId", "coverLine", "createdAt", "id", "imagePrompt", "outlineId", "sections", "stale", "tags", "title", "updatedAt") SELECT "caption", "conversationId", "coverLine", "createdAt", "id", "imagePrompt", "outlineId", "sections", "stale", "tags", "title", "updatedAt" FROM "PostDraft";
DROP TABLE "PostDraft";
ALTER TABLE "new_PostDraft" RENAME TO "PostDraft";
CREATE INDEX "PostDraft_conversationId_updatedAt_idx" ON "PostDraft"("conversationId", "updatedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
