"use client";

/* eslint-disable @next/next/no-img-element */

import { ImageIcon, LoaderCircle, RefreshCcw } from "lucide-react";
import type { PostDraft } from "./types";

type PostCoverPreviewProps = {
  isGeneratingImage?: boolean;
  onGenerateImage?: () => void;
  postDraft: PostDraft;
};

const actionClass =
  "inline-flex min-h-9 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 text-[0.82rem] font-bold text-[var(--ink)] transition hover:border-[var(--red)] hover:bg-[var(--red-soft)] disabled:cursor-not-allowed disabled:opacity-50";

const previewFrameClass =
  "grid aspect-[4/5] min-h-[220px] overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface)]";

export function PostCoverPreview({
  isGeneratingImage = false,
  onGenerateImage,
  postDraft,
}: PostCoverPreviewProps) {
  const imageStatus = isGeneratingImage ? "generating" : postDraft.imageStatus;
  const canGenerate = Boolean(onGenerateImage) && imageStatus !== "generating";
  const actionLabel =
    imageStatus === "ready"
      ? "重新生成"
      : imageStatus === "failed"
        ? "重试生成"
        : "生成封面";
  const shouldShowIdlePreview =
    imageStatus === "idle" || (imageStatus === "ready" && !postDraft.imageUrl);

  return (
    <section
      aria-labelledby="cover-preview-title"
      className="grid gap-3 rounded-md border border-[var(--line)] bg-[var(--surface-tint)] p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="grid gap-0.5">
          <p className="m-0 text-xs font-bold text-[var(--muted)]">封面</p>
          <h3
            className="text-[0.95rem] font-bold leading-tight text-[var(--ink)]"
            id="cover-preview-title"
          >
            封面预览
          </h3>
        </div>
        <button
          className={actionClass}
          disabled={!canGenerate}
          onClick={canGenerate ? onGenerateImage : undefined}
          type="button"
        >
          <RefreshCcw aria-hidden="true" size={15} strokeWidth={2.4} />
          {actionLabel}
        </button>
      </div>

      <div className={previewFrameClass}>
        {imageStatus === "ready" && postDraft.imageUrl ? (
          <img
            alt={postDraft.coverLine || postDraft.title}
            className="h-full w-full object-cover"
            src={postDraft.imageUrl}
          />
        ) : null}

        {imageStatus === "generating" ? (
          <div className="grid h-full place-items-center bg-[var(--surface)] p-5 text-center">
            <span className="inline-flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-tint)] px-3 py-2 text-[0.84rem] font-bold text-[var(--ink)]">
              <LoaderCircle
                aria-hidden="true"
                className="animate-spin text-[var(--red)]"
                size={16}
                strokeWidth={2.4}
              />
              生成中
            </span>
          </div>
        ) : null}

        {imageStatus === "failed" ? (
          <div className="grid h-full grid-rows-[minmax(0,1fr)_auto] gap-3 bg-[var(--surface)] p-4 text-center">
            <div className="grid min-h-0 place-items-center rounded-md border border-dashed border-[var(--line)] bg-[var(--surface-tint)] p-4">
              <div className="grid max-w-[16rem] gap-3">
                <ImageIcon
                  aria-hidden="true"
                  className="mx-auto text-[var(--red)]"
                  size={24}
                  strokeWidth={2.2}
                />
                <strong className="text-[1.18rem] font-black leading-tight text-[var(--ink)]">
                  {postDraft.coverLine || postDraft.title}
                </strong>
                <span
                  aria-hidden="true"
                  className="mx-auto h-1 w-12 rounded-md bg-[var(--red)]"
                />
                <small className="text-[0.78rem] font-bold leading-relaxed text-[var(--muted)]">
                  {postDraft.title}
                </small>
              </div>
            </div>
            <div className="grid gap-1 rounded-md border border-[var(--line)] bg-[var(--red-soft)] p-2.5 text-left">
              <strong className="inline-flex items-center gap-2 text-[0.84rem] font-bold text-[var(--ink)]">
                <ImageIcon
                  aria-hidden="true"
                  className="text-[var(--red-strong)]"
                  size={15}
                  strokeWidth={2.2}
                />
                生成失败
              </strong>
              <small className="text-[0.76rem] font-semibold leading-relaxed text-[var(--muted)]">
                {postDraft.imageError ?? "封面生成失败"}
              </small>
            </div>
          </div>
        ) : null}

        {shouldShowIdlePreview ? (
          <div className="grid h-full place-items-center bg-[var(--surface)] p-5 text-center">
            <div className="grid max-w-[16rem] gap-3">
              <ImageIcon
                aria-hidden="true"
                className="mx-auto text-[var(--red)]"
                size={24}
                strokeWidth={2.2}
              />
              <strong className="text-[1.28rem] font-black leading-tight text-[var(--ink)]">
                {postDraft.coverLine || postDraft.title}
              </strong>
              <span
                aria-hidden="true"
                className="mx-auto h-1 w-12 rounded-md bg-[var(--red)]"
              />
              <small className="text-[0.78rem] font-bold leading-relaxed text-[var(--muted)]">
                {postDraft.title}
              </small>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
