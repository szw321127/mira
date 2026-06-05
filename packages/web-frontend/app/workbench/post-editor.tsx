"use client";

import { Copy, Download, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { PostCoverPreview } from "./post-cover-preview";
import type { PostDraft, SavedDraft } from "./types";
import { getFullPostText } from "./workspace-utils";

type EditablePostDraftPatch = Partial<
  Pick<
    PostDraft,
    "caption" | "coverLine" | "imagePrompt" | "sections" | "tags" | "title"
  >
>;

type PostEditorProps = {
  draftStale: boolean;
  isGeneratingImage?: boolean;
  isSavingDraft: boolean;
  onCopy: (text: string, label: string) => void;
  onDraftChange: (patch: EditablePostDraftPatch) => void;
  onDownloadImage?: () => void;
  onGenerateImage?: () => void;
  onOpenSavedDraft: (draft: SavedDraft) => void;
  onSaveDraft: () => void;
  postDraft: PostDraft | null;
  savedDrafts: SavedDraft[];
  selectedTitle?: string;
};

const fieldClass =
  "rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[0.9rem] font-semibold leading-relaxed text-[var(--ink)] outline-none transition placeholder:text-[var(--muted)] focus-visible:border-[var(--red)] focus-visible:ring-2 focus-visible:ring-[var(--red-soft)]";

const labelClass = "grid gap-2 text-[0.82rem] font-bold text-[var(--muted)]";
const primaryActionClass =
  "inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-transparent bg-[var(--red)] px-3 font-bold text-[var(--surface)] transition hover:bg-[var(--red-strong)] disabled:cursor-not-allowed disabled:opacity-50";
const quietActionClass =
  "inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-[var(--line)] bg-[var(--surface-tint)] px-3 font-bold text-[var(--ink)] transition hover:border-[var(--red)] hover:bg-[var(--red-soft)] disabled:cursor-not-allowed disabled:opacity-50";

export function PostEditor({
  draftStale,
  isGeneratingImage = false,
  isSavingDraft,
  onCopy,
  onDraftChange,
  onDownloadImage,
  onGenerateImage,
  onOpenSavedDraft,
  onSaveDraft,
  postDraft,
  savedDrafts,
  selectedTitle,
}: PostEditorProps) {
  const sourceSectionsText = postDraft?.sections.join("\n") ?? "";
  const sourceTagsText = postDraft?.tags.join(" ") ?? "";
  const [sectionsText, setSectionsText] = useState(sourceSectionsText);
  const [tagsText, setTagsText] = useState(sourceTagsText);
  const canDownloadImage = Boolean(postDraft?.imageUrl && onDownloadImage);

  useEffect(() => {
    const syncDraftText = window.setTimeout(() => {
      setSectionsText(sourceSectionsText);
      setTagsText(sourceTagsText);
    }, 0);

    return () => window.clearTimeout(syncDraftText);
  }, [sourceSectionsText, sourceTagsText]);

  return (
    <aside
      className="grid gap-4 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4"
      aria-labelledby="post-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <h2
            className="text-[1.08rem] font-bold leading-tight text-[var(--ink)]"
            id="post-title"
          >
            发布包
          </h2>
        </div>
        {postDraft ? (
          <span
            className={`rounded-full px-2.5 py-1 text-[0.72rem] font-bold ${
              draftStale
                ? "bg-[var(--yellow)] text-[var(--ink)]"
                : "bg-[var(--red-soft)] text-[var(--red-strong)]"
            }`}
          >
            {draftStale ? "大纲已改" : "已生成"}
          </span>
        ) : null}
      </div>

      {postDraft ? (
        <div className="grid gap-3">
          <PostCoverPreview
            isGeneratingImage={isGeneratingImage}
            onGenerateImage={onGenerateImage}
            postDraft={postDraft}
          />

          <label className={labelClass}>
            <span>标题</span>
            <input
              className={fieldClass}
              onChange={(event) => onDraftChange({ title: event.target.value })}
              value={postDraft.title}
            />
          </label>

          <label className={labelClass}>
            <span>封面文案</span>
            <input
              className={fieldClass}
              onChange={(event) => onDraftChange({ coverLine: event.target.value })}
              value={postDraft.coverLine}
            />
          </label>

          <label className={labelClass}>
            <span>正文开场</span>
            <textarea
              className={`${fieldClass} min-h-[96px] resize-y`}
              onChange={(event) => onDraftChange({ caption: event.target.value })}
              rows={4}
              value={postDraft.caption}
            />
          </label>

          <label className={labelClass}>
            <span>正文结构</span>
            <textarea
              className={`${fieldClass} min-h-[132px] resize-y`}
              onBlur={(event) =>
                onDraftChange({
                  sections: event.target.value
                    .split("\n")
                    .map((section) => section.trim())
                    .filter(Boolean),
                })
              }
              onChange={(event) =>
                setSectionsText(event.target.value)
              }
              rows={6}
              value={sectionsText}
            />
          </label>

          <label className={labelClass}>
            <span>标签</span>
            <input
              className={fieldClass}
              onBlur={(event) =>
                onDraftChange({
                  tags: event.target.value
                    .split(/\s+/)
                    .map((tag) => tag.replace(/^#+/, "").trim())
                    .filter(Boolean),
                })
              }
              onChange={(event) =>
                setTagsText(event.target.value)
              }
              value={tagsText}
            />
          </label>

          <label className={labelClass}>
            <span>封面提示</span>
            <textarea
              className={`${fieldClass} min-h-[112px] resize-y`}
              onChange={(event) => onDraftChange({ imagePrompt: event.target.value })}
              rows={5}
              value={postDraft.imagePrompt}
            />
          </label>
        </div>
      ) : (
        <div className="grid min-h-[220px] place-items-center rounded-lg border border-dashed border-[var(--line)] bg-[var(--surface-tint)] p-5 text-center">
          <div className="grid gap-2">
            <span className="text-[0.78rem] font-bold text-[var(--red-strong)]">
              等待发布包
            </span>
            <strong className="text-[1rem] font-bold leading-snug text-[var(--ink)]">
              {selectedTitle ?? "先选择一个大纲"}
            </strong>
            <small className="text-[0.82rem] font-semibold leading-relaxed text-[var(--muted)]">
              标题、封面、正文会在这里成组整理。
            </small>
          </div>
        </div>
      )}

      {postDraft ? (
        <div className="grid gap-2" aria-label="发布包操作">
          <div className="grid gap-2 sm:grid-cols-3">
            <button
              className={primaryActionClass}
              onClick={() => onCopy(getFullPostText(postDraft), "完整笔记")}
              type="button"
            >
              <Copy aria-hidden="true" size={16} strokeWidth={2.4} />
              复制完整笔记
            </button>
            <button
              className={quietActionClass}
              disabled={!canDownloadImage}
              onClick={canDownloadImage ? onDownloadImage : undefined}
              type="button"
            >
              <Download aria-hidden="true" size={16} strokeWidth={2.4} />
              下载封面
            </button>
            <button
              className={quietActionClass}
              disabled={isSavingDraft}
              onClick={onSaveDraft}
              type="button"
            >
              <Save aria-hidden="true" size={16} strokeWidth={2.4} />
              {isSavingDraft ? "保存中" : "保存草稿"}
            </button>
          </div>
          {draftStale ? (
            <p className="m-0 text-[0.8rem] font-semibold leading-relaxed text-[var(--muted)]">
              大纲已调整，需要新版内容时请回到大纲区重新生成。
            </p>
          ) : null}
        </div>
      ) : null}

      {savedDrafts.length ? (
        <div className="grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-tint)] p-3">
          <h3 className="text-[0.82rem] font-bold text-[var(--ink)]">
            已保存草稿
          </h3>
          <div className="grid gap-2" aria-label="已保存草稿">
            {savedDrafts.map((draft) => (
              <button
                className="grid gap-1 rounded-md border border-[var(--line)] bg-[var(--surface)] p-2.5 text-left text-[var(--ink)] transition hover:border-[var(--red)] hover:bg-[var(--red-soft)]"
                key={draft.savedDraftId}
                onClick={() => onOpenSavedDraft(draft)}
                type="button"
              >
                <span className="font-mono text-[0.72rem] font-extrabold text-[var(--red-strong)]">
                  {draft.savedAt}
                </span>
                <strong className="text-[0.86rem] font-bold leading-snug">
                  {draft.title}
                </strong>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </aside>
  );
}
