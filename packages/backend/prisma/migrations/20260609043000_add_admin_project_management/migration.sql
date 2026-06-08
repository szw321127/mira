-- CreateTable
CREATE TABLE "AdminProject" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "budget" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "team" TEXT NOT NULL,
    "riskReason" TEXT,
    "riskSeverity" TEXT,
    "riskLatestUpdate" TEXT,
    "riskNextAction" TEXT,
    "riskEscalationOwner" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AdminTask" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "projectId" TEXT,
    "name" TEXT NOT NULL,
    "assignee" TEXT NOT NULL,
    "dueDate" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AdminTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "AdminProject" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AdminNotification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "AdminProject_key_key" ON "AdminProject"("key");

-- CreateIndex
CREATE INDEX "AdminProject_status_updatedAt_idx" ON "AdminProject"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminTask_key_key" ON "AdminTask"("key");

-- CreateIndex
CREATE INDEX "AdminTask_projectId_updatedAt_idx" ON "AdminTask"("projectId", "updatedAt");

-- CreateIndex
CREATE INDEX "AdminTask_status_updatedAt_idx" ON "AdminTask"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "AdminNotification_createdAt_idx" ON "AdminNotification"("createdAt");
