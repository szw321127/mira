"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { EmailLoginPanel } from "../auth/email-login-panel";
import { useAuthSession } from "../auth/use-auth-session";
import type { CanvasAssetSelection } from "./leafer-canvas-types";
import { useImageWorkspace } from "./use-image-workspace";

const ImageWorkspaceShell = dynamic(
  () => import("./image-workspace-shell").then((module) => module.ImageWorkspaceShell),
  {
    loading: () => (
      <main className="flex min-h-dvh items-center justify-center bg-[var(--background)] px-5 text-[var(--ink)]">
        <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted)]">
          正在加载图像工作区
        </div>
      </main>
    ),
    ssr: false,
  },
);

export default function ImageWorkspacePage() {
  const auth = useAuthSession();

  if (auth.status === "checking") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-[var(--background)] px-5 text-[var(--ink)]">
        <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--muted)]">
          正在验证 Mira 会话
        </div>
      </main>
    );
  }

  if (auth.status === "guest") {
    return <EmailLoginPanel onLogin={auth.setUser} />;
  }

  return <ImageWorkspaceHome />;
}

function ImageWorkspaceHome() {
  const workspace = useImageWorkspace();
  const [uploadedSourceSelection, setUploadedSourceSelection] =
    useState<CanvasAssetSelection | null>(null);

  async function handleUploadSourceAsset(file: File) {
    const upload = await workspace.uploadSourceAsset(file);
    if (upload) {
      setUploadedSourceSelection(upload.selection);
    }
  }

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-[var(--background)] text-[var(--ink)]">
      <ImageWorkspaceShell
        activeWorkspace={workspace.activeWorkspace}
        creatingTask={workspace.creatingTask}
        error={workspace.error}
        loading={workspace.loading}
        onCreate={workspace.createWorkspace}
        onCancelTask={workspace.cancelTask}
        onDeleteAsset={workspace.removeImageAsset}
        onDeleteTask={workspace.deleteTask}
        onDeleteWorkspace={workspace.deleteWorkspace}
        onDownloadAsset={workspace.downloadAsset}
        onEditAsset={workspace.editImageAsset}
        onExpandAsset={workspace.expandImageAsset}
        onGenerate={workspace.generateImage}
        onPersistCanvas={workspace.persistCanvas}
        onRemoveBackgroundAsset={workspace.createImageBackgroundRemoval}
        onRenameWorkspace={workspace.renameWorkspace}
        onRevertAsset={workspace.revertAssetVersion}
        onRetryTask={workspace.retryTask}
        onSelect={workspace.selectWorkspace}
        onUpscaleAsset={workspace.createImageUpscale}
        onUploadMask={workspace.uploadAssetMask}
        onUploadSourceAsset={handleUploadSourceAsset}
        onVariationAsset={workspace.createImageVariation}
        uploadedSourceSelection={uploadedSourceSelection}
        workspaces={workspace.workspaces}
      />
    </main>
  );
}
