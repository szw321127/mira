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
  GitCompare,
  Image as ImageIcon,
  Maximize2,
  PanelTopOpen,
  RotateCcw,
  Scissors,
  Shuffle,
  Trash2,
  Wand2
} from "lucide-react";
import type {
  LocalEditOverlayState,
  LocalExpandDirection,
  LocalExpandMode,
  LocalExpandOverlayState,
  LocalExpandPadding,
} from "../leafer-canvas-types";
import type { ImageAsset, ImageVersion } from "../types";
import {
  createImageAssetPreviewUrl,
  createImageVersionDownloadUrl,
  createImageVersionPreviewUrl
} from "../workspace-api";

const EXPAND_MODE_OPTIONS: Array<{ value: LocalExpandMode; label: string }> = [
  { value: "free", label: "自由" },
  { value: "ratio", label: "比例" },
  { value: "direction", label: "方向" },
];

const EXPAND_RATIO_OPTIONS: Array<LocalExpandOverlayState["aspectRatio"]> = [
  "1:1",
  "2:1",
  "4:3",
  "16:9",
  "1:2",
  "3:4",
  "9:16",
];

const EXPAND_DIRECTION_OPTIONS: Array<{
  value: LocalExpandDirection;
  label: string;
}> = [
  { value: "left", label: "左" },
  { value: "right", label: "右" },
  { value: "top", label: "上" },
  { value: "bottom", label: "下" },
  { value: "around", label: "四周" },
];

const EXPAND_PADDING_FIELDS: Array<{
  key: keyof LocalExpandPadding;
  label: string;
}> = [
  { key: "left", label: "左" },
  { key: "right", label: "右" },
  { key: "top", label: "上" },
  { key: "bottom", label: "下" },
];

export function AssetVersionPanel({
  assets,
  currentVersion,
  disabled,
  localEditOverlayState,
  localExpandOverlayState,
  onDelete,
  onDownload,
  onLocalEditRadiusChange,
  onLocalExpandAspectRatioChange,
  onLocalExpandDirectionChange,
  onLocalExpandModeChange,
  onLocalExpandPaddingChange,
  onLocalExpandPercentChange,
  onRemoveBackground,
  onRevert,
  onSelectAsset,
  onSelectVersion,
  onSubmitExpand,
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
  localExpandOverlayState: LocalExpandOverlayState;
  onDelete: (assetId: string) => Promise<void> | void;
  onDownload: (assetId: string, versionId?: string) => Promise<void> | void;
  onLocalEditRadiusChange: (radius: number) => void;
  onLocalExpandAspectRatioChange: (
    aspectRatio: LocalExpandOverlayState["aspectRatio"],
  ) => void;
  onLocalExpandDirectionChange: (direction: LocalExpandDirection) => void;
  onLocalExpandModeChange: (mode: LocalExpandMode) => void;
  onLocalExpandPaddingChange: (padding: Partial<LocalExpandPadding>) => void;
  onLocalExpandPercentChange: (percent: number) => void;
  onRemoveBackground: (assetId: string) => Promise<void> | void;
  onRevert: (assetId: string, versionId: string) => Promise<void> | void;
  onSelectAsset: (assetId: string) => void;
  onSelectVersion: (versionId: string) => void;
  onSubmitExpand: (
    assetId: string,
    version: ImageVersion,
    prompt: string,
  ) => Promise<void> | void;
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
  const [expandOpen, setExpandOpen] = useState(false);
  const [expandPrompt, setExpandPrompt] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const canAct = Boolean(selectedAsset && currentVersion && !disabled);
  const expandMode = localExpandOverlayState.mode;
  const expandPercent = Math.round(localExpandOverlayState.percent * 100);
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

  async function submitExpand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAsset || !currentVersion) return;
    await runAction(async () => {
      await onSubmitExpand(selectedAsset.id, currentVersion, expandPrompt);
      setExpandPrompt("");
    });
  }

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
                onSelect={() => onSelectVersion(currentVersion.id)}
                version={currentVersion}
              />
              <CompareVersion
                assetId={selectedAsset.id}
                label="对比"
                onSelect={() => onSelectVersion(previousVersion.id)}
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
              label="扩展图片"
              onClick={() => {
                setExpandOpen((value) => {
                  const nextValue = !value;
                  if (nextValue) onLocalExpandModeChange(expandMode);
                  return nextValue;
                });
              }}
            >
              <PanelTopOpen aria-hidden="true" size={15} />
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

          {expandOpen ? (
            <form
              className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] p-3"
              onSubmit={submitExpand}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-[12px] font-[700]">
                  <PanelTopOpen aria-hidden="true" size={14} />
                  扩展图片
                </div>
                <div className="text-[11px] font-[650] text-[var(--muted-strong)]">
                  {localExpandOverlayState.target
                    ? `${localExpandOverlayState.target.width}x${localExpandOverlayState.target.height}`
                    : "未设置"}
                </div>
              </div>

              <div className="mt-2 grid grid-cols-3 gap-1 rounded-[8px] bg-[var(--surface-muted)] p-1">
                {EXPAND_MODE_OPTIONS.map((option) => (
                  <button
                    aria-pressed={expandMode === option.value}
                    className={`h-7 rounded-[6px] text-[11px] font-[700] transition-colors ${
                      expandMode === option.value
                        ? "bg-[var(--surface)] text-[var(--accent-strong)]"
                        : "text-[var(--muted-strong)] hover:bg-[var(--surface)]"
                    }`}
                    disabled={disabled}
                    key={option.value}
                    onClick={() => onLocalExpandModeChange(option.value)}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              {expandMode === "ratio" ? (
                <div className="mt-2 grid grid-cols-4 gap-1">
                  {EXPAND_RATIO_OPTIONS.map((ratio) => (
                    <button
                      aria-pressed={localExpandOverlayState.aspectRatio === ratio}
                      className={`h-7 rounded-[6px] border px-2 text-[11px] font-[650] transition-colors ${
                        localExpandOverlayState.aspectRatio === ratio
                          ? "border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent-strong)]"
                          : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-muted)]"
                      }`}
                      disabled={disabled}
                      key={ratio}
                      onClick={() => onLocalExpandAspectRatioChange(ratio)}
                      type="button"
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              ) : null}

              {expandMode === "direction" ? (
                <div className="mt-2 space-y-2">
                  <div className="grid grid-cols-5 gap-1">
                    {EXPAND_DIRECTION_OPTIONS.map((direction) => (
                      <button
                        aria-pressed={
                          localExpandOverlayState.direction === direction.value
                        }
                        className={`h-7 rounded-[6px] border px-1 text-[11px] font-[650] transition-colors ${
                          localExpandOverlayState.direction === direction.value
                            ? "border-[var(--accent)] bg-[var(--accent-subtle)] text-[var(--accent-strong)]"
                            : "border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-muted)]"
                        }`}
                        disabled={disabled}
                        key={direction.value}
                        onClick={() =>
                          onLocalExpandDirectionChange(direction.value)
                        }
                        type="button"
                      >
                        {direction.label}
                      </button>
                    ))}
                  </div>
                  <label className="grid gap-1.5 text-[11px] font-[650] text-[var(--muted-strong)]">
                    <span className="flex items-center justify-between">
                      <span>扩展比例</span>
                      <input
                        aria-label="扩展比例百分比"
                        className="h-7 w-16 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-2 text-right text-[11px] text-[var(--ink)] focus:border-[var(--accent)]"
                        disabled={disabled}
                        max={100}
                        min={10}
                        onChange={(event) =>
                          onLocalExpandPercentChange(Number(event.target.value) / 100)
                        }
                        step={1}
                        type="number"
                        value={expandPercent}
                      />
                    </span>
                    <input
                      aria-label="扩展比例"
                      className="h-7 w-full accent-[var(--accent)]"
                      disabled={disabled}
                      max={100}
                      min={10}
                      onChange={(event) =>
                        onLocalExpandPercentChange(Number(event.target.value) / 100)
                      }
                      step={1}
                      type="range"
                      value={expandPercent}
                    />
                  </label>
                </div>
              ) : null}

              {expandMode === "free" ? (
                <div className="mt-2 grid grid-cols-4 gap-1">
                  {EXPAND_PADDING_FIELDS.map((field) => (
                    <label
                      className="grid gap-1 text-[11px] font-[650] text-[var(--muted-strong)]"
                      key={field.key}
                    >
                      <span>{field.label}</span>
                      <input
                        aria-label={`扩展留白${field.label}`}
                        className="h-7 min-w-0 rounded-[6px] border border-[var(--border)] bg-[var(--surface)] px-1.5 text-right text-[11px] text-[var(--ink)] focus:border-[var(--accent)]"
                        disabled={disabled}
                        min={0}
                        onChange={(event) =>
                          onLocalExpandPaddingChange({
                            [field.key]: Number(event.target.value),
                          })
                        }
                        step={1}
                        type="number"
                        value={localExpandOverlayState.padding[field.key]}
                      />
                    </label>
                  ))}
                </div>
              ) : null}

              <div className="mt-2 grid gap-1 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-[11px] text-[var(--muted-strong)]">
                <div className="flex justify-between gap-2">
                  <span>留白</span>
                  <span className="font-[650] text-[var(--ink)]">
                    左 {localExpandOverlayState.padding.left} / 右{" "}
                    {localExpandOverlayState.padding.right} / 上{" "}
                    {localExpandOverlayState.padding.top} / 下{" "}
                    {localExpandOverlayState.padding.bottom}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span>目标</span>
                  <span className="font-[650] text-[var(--ink)]">
                    {localExpandOverlayState.target
                      ? `${localExpandOverlayState.target.width}x${localExpandOverlayState.target.height}`
                      : "--"}
                  </span>
                </div>
              </div>

              <textarea
                className="mt-2 min-h-[72px] w-full resize-none rounded-[8px] border border-[var(--border)] bg-[var(--surface)] p-2.5 text-xs leading-relaxed placeholder:text-[var(--muted-strong)] focus:border-[var(--accent)] focus:outline-none focus-visible:outline-none"
                disabled={disabled}
                onChange={(event) => setExpandPrompt(event.target.value)}
                placeholder="留空使用默认扩展提示词"
                value={expandPrompt}
              />
              <button
                className="mt-2 inline-flex h-9 w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--ink)] px-3 text-xs font-[700] text-white transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-55"
                disabled={!canAct}
                type="submit"
              >
                <PanelTopOpen aria-hidden="true" size={14} />
                提交扩展图片
              </button>
            </form>
          ) : null}

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
                  onClick={() => onSelectVersion(version.id)}
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
  onSelect,
  version,
}: {
  assetId: string;
  label: string;
  onSelect: () => void;
  version: ImageVersion;
}) {
  return (
    <button
      className="min-w-0 rounded-[8px] border border-transparent p-1 text-left transition-colors hover:border-[var(--accent)] hover:bg-[var(--surface-muted)] focus:outline-none focus-visible:border-[var(--accent)]"
      onClick={onSelect}
      type="button"
    >
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
    </button>
  );
}

function formatImageSize(version: ImageVersion) {
  return `${version.width}x${version.height}`;
}
