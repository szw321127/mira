"use client";

import Link from "next/link";
import { ChevronLeft, Sparkles, X } from "lucide-react";
import type {
  ImageAsset,
  ImageGenerationSettings,
  ImageVersion,
  ImageWorkspace,
} from "../types";
import { AssetVersionPanel } from "./asset-version-panel";
import { PromptPanel } from "./prompt-panel";
import { TaskInspector } from "./task-inspector";

export function InspectorPanel({
  activeWorkspace,
  creatingTask,
  currentVersion,
  error,
  mobileOpen,
  onCancelTask,
  onCloseMobile,
  onDeleteAsset,
  onDownloadAsset,
  onEditAsset,
  onGenerate,
  onRemoveBackgroundAsset,
  onRevertAsset,
  onRetryTask,
  onSelectAsset,
  onUpscaleAsset,
  onUploadMask,
  onUploadSourceAsset,
  onVariationAsset,
  previousVersion,
  selectedAsset,
}: {
  activeWorkspace: ImageWorkspace | null;
  creatingTask: boolean;
  currentVersion: ImageVersion | null;
  error: string | null;
  mobileOpen: boolean;
  onCancelTask: (taskId: string) => Promise<void> | void;
  onCloseMobile: () => void;
  onDeleteAsset: (assetId: string) => Promise<void> | void;
  onDownloadAsset: (assetId: string, versionId?: string) => Promise<void> | void;
  onEditAsset: (
    assetId: string,
    prompt: string,
    maskId?: string,
  ) => Promise<void> | void;
  onGenerate: (prompt: string, settings: ImageGenerationSettings) => void;
  onRemoveBackgroundAsset: (assetId: string) => Promise<void> | void;
  onRevertAsset: (assetId: string, versionId: string) => Promise<void> | void;
  onRetryTask: (taskId: string) => Promise<void> | void;
  onSelectAsset: (assetId: string) => void;
  onUpscaleAsset: (assetId: string) => Promise<void> | void;
  onUploadMask: (
    assetId: string,
    dataUrl: string,
  ) => Promise<{ maskId: string; sizeBytes: number }>;
  onUploadSourceAsset: (file: File) => Promise<void> | void;
  onVariationAsset: (assetId: string) => Promise<void> | void;
  previousVersion: ImageVersion | null;
  selectedAsset: ImageAsset | null;
}) {
  return (
    <aside
      className={`min-h-0 flex-col bg-[var(--surface)] ${
        mobileOpen
          ? "max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-40 max-md:flex max-md:max-h-[78dvh] max-md:rounded-t-[8px] max-md:border-t max-md:border-[var(--border)]"
          : "max-md:hidden"
      } md:flex`}
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <Link
          className="hidden h-9 items-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] px-3 text-sm transition-colors hover:bg-[var(--surface-muted)] md:inline-flex"
          href="/"
        >
          <ChevronLeft aria-hidden="true" size={15} />
          返回对话
        </Link>
        <div className="flex items-center gap-2 text-sm font-[700] md:hidden">
          <Sparkles aria-hidden="true" size={16} />
          生成与任务
        </div>
        <button
          aria-label="关闭生成面板"
          className="inline-flex h-9 w-9 items-center justify-center rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] md:hidden"
          onClick={onCloseMobile}
          type="button"
        >
          <X aria-hidden="true" size={16} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <PromptPanel
          activeWorkspace={activeWorkspace}
          creatingTask={creatingTask}
          error={error}
          onGenerate={onGenerate}
          onUploadSourceAsset={onUploadSourceAsset}
        />
        <AssetVersionPanel
          assets={activeWorkspace?.assets ?? []}
          currentVersion={currentVersion}
          disabled={creatingTask}
          onDelete={onDeleteAsset}
          onDownload={onDownloadAsset}
          onEdit={onEditAsset}
          onRemoveBackground={onRemoveBackgroundAsset}
          onRevert={onRevertAsset}
          onSelectAsset={onSelectAsset}
          onUpscale={onUpscaleAsset}
          onUploadMask={onUploadMask}
          onVariation={onVariationAsset}
          previousVersion={previousVersion}
          selectedAsset={selectedAsset}
        />
        <TaskInspector
          onCancelTask={onCancelTask}
          onRetryTask={onRetryTask}
          tasks={activeWorkspace?.tasks ?? []}
        />
      </div>
    </aside>
  );
}
