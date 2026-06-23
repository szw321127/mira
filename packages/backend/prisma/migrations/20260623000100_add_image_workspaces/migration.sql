CREATE TYPE "ImageWorkspaceStatus" AS ENUM ('active', 'archived');
CREATE TYPE "ImageTaskStatus" AS ENUM ('queued', 'running', 'complete', 'failed', 'canceled');
CREATE TYPE "ImageTaskType" AS ENUM ('generate', 'edit', 'variation', 'upscale', 'background_removal');

CREATE TABLE "image_workspaces" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" "ImageWorkspaceStatus" NOT NULL DEFAULT 'active',
  "viewport" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "image_workspaces_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "image_workspaces_userId_updatedAt_idx" ON "image_workspaces"("userId", "updatedAt");

CREATE TABLE "image_assets" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "currentVersionId" TEXT,
  "title" TEXT,
  "prompt" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "image_assets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "image_assets_workspaceId_updatedAt_idx" ON "image_assets"("workspaceId", "updatedAt");
CREATE INDEX "image_assets_userId_updatedAt_idx" ON "image_assets"("userId", "updatedAt");

CREATE TABLE "canvas_objects" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "assetId" TEXT,
  "type" TEXT NOT NULL,
  "x" DOUBLE PRECISION NOT NULL,
  "y" DOUBLE PRECISION NOT NULL,
  "width" DOUBLE PRECISION NOT NULL,
  "height" DOUBLE PRECISION NOT NULL,
  "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "zIndex" INTEGER NOT NULL DEFAULT 0,
  "props" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "canvas_objects_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "canvas_objects_workspaceId_zIndex_idx" ON "canvas_objects"("workspaceId", "zIndex");
CREATE INDEX "canvas_objects_assetId_idx" ON "canvas_objects"("assetId");

CREATE TABLE "image_versions" (
  "id" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "parentId" TEXT,
  "storageKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "width" INTEGER NOT NULL,
  "height" INTEGER NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "prompt" TEXT,
  "editPrompt" TEXT,
  "maskKey" TEXT,
  "provider" TEXT NOT NULL,
  "providerJob" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "image_versions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "image_versions_assetId_createdAt_idx" ON "image_versions"("assetId", "createdAt");
CREATE INDEX "image_versions_parentId_idx" ON "image_versions"("parentId");

CREATE TABLE "image_tasks" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "requestIp" TEXT,
  "type" "ImageTaskType" NOT NULL,
  "status" "ImageTaskStatus" NOT NULL DEFAULT 'queued',
  "input" JSONB NOT NULL,
  "output" JSONB,
  "error" TEXT,
  "cost" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "image_tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "image_tasks_workspaceId_createdAt_idx" ON "image_tasks"("workspaceId", "createdAt");
CREATE INDEX "image_tasks_userId_createdAt_idx" ON "image_tasks"("userId", "createdAt");
CREATE INDEX "image_tasks_requestIp_createdAt_idx" ON "image_tasks"("requestIp", "createdAt");
CREATE INDEX "image_tasks_status_createdAt_idx" ON "image_tasks"("status", "createdAt");

ALTER TABLE "image_workspaces" ADD CONSTRAINT "image_workspaces_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "image_assets" ADD CONSTRAINT "image_assets_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "image_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "image_assets" ADD CONSTRAINT "image_assets_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "canvas_objects" ADD CONSTRAINT "canvas_objects_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "image_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "canvas_objects" ADD CONSTRAINT "canvas_objects_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "image_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "image_versions" ADD CONSTRAINT "image_versions_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "image_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "image_tasks" ADD CONSTRAINT "image_tasks_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "image_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "image_tasks" ADD CONSTRAINT "image_tasks_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
