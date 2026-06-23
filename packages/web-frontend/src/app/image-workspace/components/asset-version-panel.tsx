"use client";

import {
  FormEvent,
  type PointerEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
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
  onDelete,
  onDownload,
  onEdit,
  onRemoveBackground,
  onRevert,
  onSelectAsset,
  onUpscale,
  onUploadMask,
  onVariation,
  previousVersion,
  selectedAsset,
}: {
  assets: ImageAsset[];
  currentVersion: ImageVersion | null;
  disabled: boolean;
  onDelete: (assetId: string) => Promise<void> | void;
  onDownload: (assetId: string, versionId?: string) => Promise<void> | void;
  onEdit: (
    assetId: string,
    prompt: string,
    maskId?: string,
  ) => Promise<void> | void;
  onRemoveBackground: (assetId: string) => Promise<void> | void;
  onRevert: (assetId: string, versionId: string) => Promise<void> | void;
  onSelectAsset: (assetId: string) => void;
  onUpscale: (assetId: string) => Promise<void> | void;
  onUploadMask: (
    assetId: string,
    dataUrl: string,
  ) => Promise<{ maskId: string; sizeBytes: number }>;
  onVariation: (assetId: string) => Promise<void> | void;
  previousVersion: ImageVersion | null;
  selectedAsset: ImageAsset | null;
}) {
  const [compareOpen, setCompareOpen] = useState(false);
  const [editPrompt, setEditPrompt] = useState("");
  const [maskDirty, setMaskDirty] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const lastMaskPointRef = useRef<{ x: number; y: number } | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskDrawingRef = useRef(false);
  const canAct = Boolean(selectedAsset && currentVersion && !disabled);
  const currentDownloadUrl =
    selectedAsset && currentVersion
      ? createImageVersionDownloadUrl(selectedAsset.id, currentVersion.id)
      : "";

  const sortedVersions = useMemo(() => {
    return [...(selectedAsset?.versions ?? [])].sort((left, right) => {
      return Date.parse(right.createdAt) - Date.parse(left.createdAt);
    });
  }, [selectedAsset]);

  useEffect(() => {
    clearMaskCanvas();
  }, [currentVersion?.id, selectedAsset?.id]);

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAsset) return;
    const prompt = editPrompt.trim();
    if (!prompt) {
      setLocalError("请输入图片编辑提示词");
      return;
    }
    setLocalError(null);
    try {
      const maskId =
        maskDirty && maskCanvasRef.current
          ? (await onUploadMask(
              selectedAsset.id,
              createEditableMaskDataUrl(maskCanvasRef.current),
            )).maskId
          : undefined;

      await onEdit(selectedAsset.id, prompt, maskId);
      setEditPrompt("");
      clearMaskCanvas();
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

  function clearMaskCanvas() {
    const canvas = maskCanvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    context.clearRect(0, 0, canvas.width, canvas.height);
    lastMaskPointRef.current = null;
    maskDrawingRef.current = false;
    setMaskDirty(false);
  }

  function startMaskStroke(event: PointerEvent<HTMLCanvasElement>) {
    if (!canAct) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    maskDrawingRef.current = true;
    lastMaskPointRef.current = null;
    drawMaskStroke(event);
  }

  function drawMaskStroke(event: PointerEvent<HTMLCanvasElement>) {
    if (!maskDrawingRef.current || !canAct) return;

    const canvas = event.currentTarget;
    const context = canvas.getContext("2d");
    if (!context) return;

    const point = getCanvasPoint(canvas, event);
    const previous = lastMaskPointRef.current;
    context.strokeStyle = "rgba(225, 29, 72, 0.68)";
    context.fillStyle = "rgba(225, 29, 72, 0.68)";
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 34;

    if (previous) {
      context.beginPath();
      context.moveTo(previous.x, previous.y);
      context.lineTo(point.x, point.y);
      context.stroke();
    } else {
      context.beginPath();
      context.arc(point.x, point.y, 17, 0, Math.PI * 2);
      context.fill();
    }

    lastMaskPointRef.current = point;
    setMaskDirty(true);
  }

  function finishMaskStroke(event: PointerEvent<HTMLCanvasElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    maskDrawingRef.current = false;
    lastMaskPointRef.current = null;
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

          <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] p-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 text-[11px] font-[700] text-[var(--muted)]">
                <Brush aria-hidden="true" size={13} />
                蒙版
              </div>
              <button
                className="inline-flex h-8 items-center gap-1 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-2 text-[11px] font-[650] transition-colors hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-45"
                disabled={!maskDirty || disabled}
                onClick={clearMaskCanvas}
                type="button"
              >
                <Eraser aria-hidden="true" size={12} />
                清除
              </button>
            </div>
            <div
              className="relative max-h-[190px] w-full overflow-hidden rounded-[6px] border border-[var(--border)] bg-[var(--surface)]"
              style={{
                aspectRatio: `${currentVersion.width || 1} / ${
                  currentVersion.height || 1
                }`,
              }}
            >
              <img
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
                draggable={false}
                src={createImageVersionPreviewUrl(selectedAsset.id, currentVersion.id)}
              />
              <canvas
                aria-label="绘制蒙版"
                className="absolute inset-0 h-full w-full touch-none cursor-crosshair"
                height={512}
                onPointerCancel={finishMaskStroke}
                onPointerDown={startMaskStroke}
                onPointerLeave={finishMaskStroke}
                onPointerMove={drawMaskStroke}
                onPointerUp={finishMaskStroke}
                ref={maskCanvasRef}
                width={512}
              />
            </div>
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
              placeholder="描述要局部调整的内容"
              value={editPrompt}
            />
            <button
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-[8px] bg-[var(--ink)] px-3 text-xs font-[700] text-white transition-colors hover:bg-[var(--accent-strong)] disabled:cursor-not-allowed disabled:opacity-55"
              disabled={!canAct || !editPrompt.trim()}
              type="submit"
            >
              <Wand2 aria-hidden="true" size={14} />
              创建编辑任务
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

function getCanvasPoint(
  canvas: HTMLCanvasElement,
  event: PointerEvent<HTMLCanvasElement>,
) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function createEditableMaskDataUrl(canvas: HTMLCanvasElement) {
  const sourceContext = canvas.getContext("2d", { willReadFrequently: true });
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = canvas.width;
  outputCanvas.height = canvas.height;
  const outputContext = outputCanvas.getContext("2d");
  if (!sourceContext || !outputContext) {
    return canvas.toDataURL("image/png");
  }

  outputContext.fillStyle = "rgba(0, 0, 0, 1)";
  outputContext.fillRect(0, 0, outputCanvas.width, outputCanvas.height);

  const sourcePixels = sourceContext.getImageData(0, 0, canvas.width, canvas.height);
  const outputPixels = outputContext.getImageData(
    0,
    0,
    outputCanvas.width,
    outputCanvas.height,
  );

  for (let index = 3; index < sourcePixels.data.length; index += 4) {
    if (sourcePixels.data[index] > 0) {
      outputPixels.data[index] = 0;
    }
  }

  outputContext.putImageData(outputPixels, 0, 0);
  return outputCanvas.toDataURL("image/png");
}

function formatImageSize(version: ImageVersion) {
  return `${version.width}x${version.height}`;
}
