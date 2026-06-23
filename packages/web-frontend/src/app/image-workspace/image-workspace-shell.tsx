"use client";

import { useState } from "react";
import { InspectorPanel } from "./components/inspector-panel";
import {
  MobileDrawerOverlay,
  MobileWorkspaceHeader,
} from "./components/mobile-drawers";
import { WorkspaceRail } from "./components/workspace-rail";
import { ImageCanvas } from "./image-canvas";
import type {
  CanvasSnapshot,
  ImageGenerationSettings,
  ImageWorkspace,
} from "./types";
import { useSelectedImageAsset } from "./use-selected-image-asset";

export function ImageWorkspaceShell({
  activeWorkspace,
  creatingTask,
  error,
  loading,
  onCancelTask,
  onCreate,
  onDeleteAsset,
  onDownloadAsset,
  onEditAsset,
  onGenerate,
  onPersistCanvas,
  onRemoveBackgroundAsset,
  onRevertAsset,
  onRetryTask,
  onSelect,
  onUpscaleAsset,
  onUploadMask,
  onUploadSourceAsset,
  onVariationAsset,
  workspaces,
}: {
  activeWorkspace: ImageWorkspace | null;
  creatingTask: boolean;
  error: string | null;
  loading: boolean;
  onCancelTask: (taskId: string) => Promise<void> | void;
  onCreate: () => void;
  onDeleteAsset: (assetId: string) => Promise<void> | void;
  onDownloadAsset: (assetId: string, versionId?: string) => Promise<void> | void;
  onEditAsset: (
    assetId: string,
    prompt: string,
    maskId?: string,
  ) => Promise<void> | void;
  onGenerate: (prompt: string, settings: ImageGenerationSettings) => void;
  onPersistCanvas: (snapshot: CanvasSnapshot) => Promise<void> | void;
  onRemoveBackgroundAsset: (assetId: string) => Promise<void> | void;
  onRevertAsset: (assetId: string, versionId: string) => Promise<void> | void;
  onRetryTask: (taskId: string) => Promise<void> | void;
  onSelect: (id: string) => void;
  onUpscaleAsset: (assetId: string) => Promise<void> | void;
  onUploadMask: (
    assetId: string,
    dataUrl: string,
  ) => Promise<{ maskId: string; sizeBytes: number }>;
  onUploadSourceAsset: (file: File) => Promise<void> | void;
  onVariationAsset: (assetId: string) => Promise<void> | void;
  workspaces: ImageWorkspace[];
}) {
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const {
    currentVersion,
    previousVersion,
    selectedAsset,
    selectedAssetId,
    selectAsset,
  } = useSelectedImageAsset(activeWorkspace);

  function selectWorkspace(id: string) {
    onSelect(id);
    setMobilePanelOpen(false);
  }

  return (
    <main className="grid h-dvh bg-[var(--background)] text-[var(--ink)] md:grid-cols-[260px_minmax(0,1fr)_320px]">
      <MobileWorkspaceHeader
        onOpenInspector={() => setMobileInspectorOpen(true)}
        onOpenWorkspace={() => setMobilePanelOpen(true)}
        title={activeWorkspace?.title ?? "图像画布"}
      />

      <WorkspaceRail
        activeWorkspaceId={activeWorkspace?.id ?? null}
        mobileOpen={mobilePanelOpen}
        onCreate={onCreate}
        onSelect={selectWorkspace}
        workspaces={workspaces}
      />

      {mobilePanelOpen ? (
        <MobileDrawerOverlay
          label="关闭工作区面板"
          onClose={() => setMobilePanelOpen(false)}
        />
      ) : null}

      <section className="min-h-0 border-r border-[var(--border)] max-md:h-[calc(100dvh-56px)]">
        <ImageCanvas
          loading={loading}
          onPersistCanvas={onPersistCanvas}
          onSelectAsset={selectAsset}
          selectedAssetId={selectedAssetId}
          workspace={activeWorkspace}
        />
      </section>

      {mobileInspectorOpen ? (
        <MobileDrawerOverlay
          label="关闭生成面板"
          onClose={() => setMobileInspectorOpen(false)}
        />
      ) : null}

      <InspectorPanel
        activeWorkspace={activeWorkspace}
        creatingTask={creatingTask}
        currentVersion={currentVersion}
        error={error}
        mobileOpen={mobileInspectorOpen}
        onCloseMobile={() => setMobileInspectorOpen(false)}
        onCancelTask={onCancelTask}
        onDeleteAsset={onDeleteAsset}
        onDownloadAsset={onDownloadAsset}
        onEditAsset={onEditAsset}
        onGenerate={onGenerate}
        onRemoveBackgroundAsset={onRemoveBackgroundAsset}
        onRevertAsset={onRevertAsset}
        onRetryTask={onRetryTask}
        onSelectAsset={selectAsset}
        onUpscaleAsset={onUpscaleAsset}
        onUploadMask={onUploadMask}
        onUploadSourceAsset={onUploadSourceAsset}
        onVariationAsset={onVariationAsset}
        previousVersion={previousVersion}
        selectedAsset={selectedAsset}
      />
    </main>
  );
}
