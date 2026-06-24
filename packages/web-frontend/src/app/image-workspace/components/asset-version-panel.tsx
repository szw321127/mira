"use client";

import {
  FormEvent,
  type ReactNode,
  useMemo,
  useState
} from "react";
import {
  Brush,
  Download,
  Eraser,
  GitCompare,
  Image as ImageIcon,
  Maximize2,
  RotateCcw,
  Scissors,
  Shuffle,
  Trash2,
  Wand2
} from "lucide-react";
import type { LocalEditOverlayState } from "../leafer-canvas-types";
import type { ImageAsset, ImageVersion } from "../types";
import {
  createImageAssetPreviewUrl,
  createImageVersionDownloadUrl,
  createImageVersionPreviewUrl
} from "../workspace-api";

export function AssetVersionPanel({
  assets,
  currentVersion,
  disabled,
  localEditOverlayState,
  onClearLocalEditOverlay,
  onDelete,
  onDownload,
  onLocalEditRadiusChange,
  onRemoveBackground,
  onRevert,
  onSelectAsset,
  onSubmitLocalEdit,
  onUpscale,
  onVariation,
  previousVersion,
  selectedAsset,
}: {
  assets: ImageAsset[];
  currentVersion: ImageVersion | null;
  disabled: boolean;
  localEditOverlayState: LocalEditOverlayState;
  onClearLocalEditOverlay: () => void;
  onDelete: (assetId: string) => Promise<void> | void;
  onDownload: (assetId: string, versionId?: string) => Promise<void> | void;
  onLocalEditRadiusChange: (radius: number) => void;
  onRemoveBackground: (assetId: string) => Promise<void> | void;
  onRevert: (assetId: string, versionId: string) => Promise<void> | void;
  onSelectAsset: (assetId: string) => void;
  onSubmitLocalEdit: (
    assetId: string,
    version: ImageVersion,
    prompt: string,
  ) => Promise<void> | void;
  onUpscale: (assetId: string) => Promise<void> | void;
  onVariation: (assetId: string) => Promise<void> | void;
  previousVersion: ImageVersion | null;
  selectedAsset: ImageAsset | null;
}) {
  const [compareOpen, setCompareOpen] = useState(false);
  const [editPrompt, setEditPrompt] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const canAct = Boolean(selectedAsset && currentVersion && !disabled);
  const localEditReady = Boolean(
    selectedAsset &&
      localEditOverlayState.dirty &&
      localEditOverlayState.assetId === selectedAsset.id,
  );
  const localEditLabel =
    localEditReady && localEditOverlayState.source === "marker"
      ? "已标记局部"
      : localEditReady && localEditOverlayState.source === "mask"
        ? "已绘制蒙版"
        : "未选择区域";
  const currentDownloadUrl =
    selectedAsset && currentVersion
      ? createImageVersionDownloadUrl(selectedAsset.id, currentVersion.id)
      : "";

  const sortedVersions = useMemo(() => {
    return [...(selectedAsset?.versions ?? [])].sort((left, right) => {
      return Date.parse(right.createdAt) - Date.parse(left.createdAt);
    });
  }, [selectedAsset]);

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAsset || !currentVersion) return;
    const prompt = editPrompt.trim();
    if (!prompt) {
      setLocalError("请输入图片编辑提示词");
      return;
    }
    if (!localEditReady) {
      setLocalError("请先在画布中绘制蒙版或标记局部区域");
      return;
    }
    setLocalError(null);
    try {
      await onSubmitLocalEdit(selectedAsset.id, currentVersion, prompt);
      setEditPrompt("");
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "图片操作失败");
    }
  }

  async function runAction(action: () => Promise<void> | void) {
    setLocalError(null);
    try {
      await action();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "图片操作失败");
    }
  }

  return (
    <section className="border-b border-[var(--border)] p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-[700]">
        <ImageIcon aria-hidden="true" size={16} />
        图片版本
      </div>

      {assets.length ? (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {assets.map((asset) => (
            <button
              className={`flex h-12 max-w-[190px] shrink-0 items-center gap-2 rounded-[8px] border p-1.5 pr-3 text-left text-xs font-[650] transition-colors ${
                asset.id === selectedAsset?.id
                  ? "border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent-strong)]"
                  : "border-[var(--border)] bg-[var(--surface-raised)] hover:bg-[var(--surface-muted)]"
              }`}
              key={asset.id}
              onClick={() => onSelectAsset(asset.id)}
              type="button"
            >
              <img
                alt=""
                className="h-8 w-8 shrink-0 rounded-[6px] border border-[var(--border)] object-cover"
                decoding="async"
                draggable={false}
                loading="lazy"
                src={createImageAssetPreviewUrl(asset.id)}
              />
              <span className="min-w-0 truncate">
                {asset.title || asset.prompt || "未命名图片"}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-[8px] border border-dashed border-[var(--border-strong)] bg-[var(--surface-raised)] p-3 text-xs leading-relaxed text-[var(--muted-strong)]">
          生成图片后，版本和局部编辑会出现在这里。
        </div>
      )}

      {selectedAsset && currentVersion ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <VersionStat label="当前版本" version={currentVersion} />
            <VersionStat label="上一版本" version={previousVersion} />
          </div>

          <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[12px] font-[700]">
                <Brush aria-hidden="true" size={14} />
                局部重绘
              </div>
              <button
                className="inline-flex h-8 items-center gap-1 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2 text-[11px] font-[650] transition-colors hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-45"
                disabled={!localEditReady || disabled}
                onClick={onClearLocalEditOverlay}
                type="button"
              >
                <Eraser aria-hidden="true" size={12} />
                清除
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-[11px]">
              <span className="font-[650] text-[var(--muted-strong)]">
                {localEditLabel}
              </span>
              {localEditReady && localEditOverlayState.source === "marker" ? (
                <span className="shrink-0 text-[var(--muted)]">
                  范围 {Math.round(localEditOverlayState.markerRadius)}
                </span>
              ) : null}
            </div>
            {localEditReady && localEditOverlayState.source === "marker" ? (
              <label className="mt-2 grid gap-1.5 text-[11px] font-[650] text-[var(--muted-strong)]">
                <span>标记范围</span>
                <input
                  className="h-7 w-full accent-[var(--accent)]"
                  disabled={disabled}
                  max={260}
                  min={24}
                  onChange={(event) =>
                    onLocalEditRadiusChange(Number(event.target.value))
                  }
                  step={4}
                  type="range"
                  value={localEditOverlayState.markerRadius}
                />
              </label>
            ) : null}
          </div>

          {compareOpen && previousVersion ? (
            <div className="grid grid-cols-2 gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] p-2">
              <CompareVersion
                assetId={selectedAsset.id}
                label="当前"
                version={currentVersion}
              />
              <CompareVersion
                assetId={selectedAsset.id}
                label="对比"
                version={previousVersion}
              />
            </div>
          ) : null}

          <div className="grid grid-cols-4 gap-2">
            <IconButton
              disabled={!canAct || !previousVersion}
              label="比较版本"
              onClick={() => setCompareOpen((value) => !value)}
            >
              <GitCompare aria-hidden="true" size={15} />
            </IconButton>
            <IconButton
              disabled={!canAct}
              label="生成变体"
              onClick={() => runAction(() => onVariation(selectedAsset.id))}
            >
              <Shuffle aria-hidden="true" size={15} />
            </IconButton>
            <IconButton
              disabled={!canAct}
              label="放大图片"
              onClick={() => runAction(() => onUpscale(selectedAsset.id))}
            >
              <Maximize2 aria-hidden="true" size={15} />
            </IconButton>
            <IconButton
              disabled={!canAct}
              label="移除背景"
              onClick={() => runAction(() => onRemoveBackground(selectedAsset.id))}
            >
              <Scissors aria-hidden="true" size={15} />
            </IconButton>
            <IconButton
              disabled={!canAct || !previousVersion}
              label="恢复上一版本"
              onClick={() =>
                previousVersion
                  ? runAction(() => onRevert(selectedAsset.id, previousVersion.id))
                  : undefined
              }
            >
              <RotateCcw aria-hidden="true" size={15} />
            </IconButton>
            <a
              aria-disabled={!canAct}
              aria-label="下载图片"
              className={`inline-flex h-9 items-center justify-center rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] transition-colors hover:bg-[var(--surface-muted)] ${
                canAct ? "" : "pointer-events-none opacity-45"
              }`}
              href={currentDownloadUrl || "#"}
              onClick={(event) => {
                event.preventDefault();
                if (canAct && currentVersion) {
                  void runAction(() => onDownload(selectedAsset.id, currentVersion.id));
                }
              }}
              title="下载图片"
            >
              <Download aria-hidden="true" size={15} />
            </a>
            <IconButton
              disabled={!canAct}
              label="删除图片"
              onClick={() => runAction(() => onDelete(selectedAsset.id))}
            >
              <Trash2 aria-hidden="true" size={15} />
            </IconButton>
          </div>

          <form className="space-y-2" onSubmit={submitEdit}>
            <textarea
              className="min-h-[84px] w-full resize-none rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] p-3 text-xs leading-relaxed placeholder:text-[var(--muted-strong)] focus:border-[var(--accent)] focus:outline-none focus-visible:outline-none"
              onChange={(event) => setEditPrompt(event.target.value)}
              placeholder="描述要重绘的局部内容"
              value={editPrompt}
            />
            <button
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--ink)] px-3 text-xs font-[700] text-white transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-55"
              disabled={!canAct || !localEditReady || !editPrompt.trim()}
              type="submit"
            >
              <Wand2 aria-hidden="true" size={14} />
              提交局部重绘
            </button>
          </form>

          {localError ? (
            <div className="rounded-[8px] border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-xs text-[var(--danger)]">
              {localError}
            </div>
          ) : null}

          {sortedVersions.length ? (
            <div className="space-y-1">
              {sortedVersions.map((version) => (
                <button
                  className={`h-9 w-full rounded-[8px] border px-3 text-left text-xs transition-colors ${
                    version.id === currentVersion.id
                      ? "border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent-strong)]"
                      : "border-[var(--border)] bg-[var(--surface-raised)] hover:bg-[var(--surface-muted)]"
                  }`}
                  disabled={version.id === currentVersion.id || disabled}
                  key={version.id}
                  onClick={() => runAction(() => onRevert(selectedAsset.id, version.id))}
                  type="button"
                >
                  {version.editPrompt || version.prompt || "图片版本"} ·{" "}
                  {formatImageSize(version)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function IconButton({
  children,
  disabled,
  label,
  onClick,
}: {
  children: ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="inline-flex h-9 items-center justify-center rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] transition-colors hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-45"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

function VersionStat({
  label,
  version,
}: {
  label: string;
  version: ImageVersion | null;
}) {
  return (
    <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] p-2">
      <div className="text-[11px] text-[var(--muted)]">{label}</div>
      <div className="mt-1 truncate text-xs font-[650]">
        {version ? version.editPrompt || version.prompt || version.id : "暂无"}
      </div>
      <div className="mt-1 text-[11px] text-[var(--muted-strong)]">
        {version ? formatImageSize(version) : "--"}
      </div>
    </div>
  );
}

function CompareVersion({
  assetId,
  label,
  version,
}: {
  assetId: string;
  label: string;
  version: ImageVersion;
}) {
  return (
    <div className="min-w-0">
      <img
        alt={label}
        className="mb-2 aspect-square w-full rounded-[6px] border border-[var(--border)] object-cover"
        decoding="async"
        loading="lazy"
        src={createImageVersionPreviewUrl(assetId, version.id)}
      />
      <div className="text-[11px] font-[700] text-[var(--muted)]">{label}</div>
      <div className="mt-1 truncate text-xs">
        {version.editPrompt || version.prompt || version.id}
      </div>
      <div className="mt-1 text-[11px] text-[var(--muted-strong)]">
        {formatImageSize(version)}
      </div>
    </div>
  );
}

function formatImageSize(version: ImageVersion) {
  return `${version.width}x${version.height}`;
}
