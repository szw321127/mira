"use client";

import type { PostDraft, SavedDraft } from "./types";
import { getFullPostText, getPostBodyText } from "./workspace-utils";

type PostEditorProps = {
  draftStale: boolean;
  isGenerating: boolean;
  isSavingDraft: boolean;
  onCopy: (text: string, label: string) => void;
  onDraftChange: (patch: Partial<PostDraft>) => void;
  onOpenSavedDraft: (draft: SavedDraft) => void;
  onRefresh: () => void;
  onSaveDraft: () => void;
  postDraft: PostDraft | null;
  savedDrafts: SavedDraft[];
  selectedTitle?: string;
};

const fieldClass =
  "rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-[0.9rem] font-semibold leading-relaxed text-[var(--ink)] outline-none transition placeholder:text-[var(--muted)] focus-visible:border-[var(--red)] focus-visible:ring-2 focus-visible:ring-[var(--red-soft)]";

const labelClass = "grid gap-2 text-[0.82rem] font-extrabold text-[var(--muted)]";

export function PostEditor({
  draftStale,
  isGenerating,
  isSavingDraft,
  onCopy,
  onDraftChange,
  onOpenSavedDraft,
  onRefresh,
  onSaveDraft,
  postDraft,
  savedDrafts,
  selectedTitle,
}: PostEditorProps) {
  const tagsText = postDraft?.tags.map((tag) => `#${tag}`).join(" ") ?? "";

  return (
    <aside
      className="grid gap-4 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4"
      aria-labelledby="post-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <p className="section-kicker">图文</p>
          <h2
            className="text-[1.08rem] font-black leading-tight text-[var(--ink)]"
            id="post-title"
          >
            编辑最终发布内容
          </h2>
        </div>
        {postDraft ? (
          <span
            className={`rounded-full px-2.5 py-1 text-[0.72rem] font-black ${
              draftStale
                ? "bg-[var(--yellow)] text-[var(--ink)]"
                : "bg-[var(--red-soft)] text-[var(--red-strong)]"
            }`}
          >
            {draftStale ? "待刷新" : "已生成"}
          </span>
        ) : null}
      </div>

      {postDraft ? (
        <div className="grid gap-3">
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
              onChange={(event) =>
                onDraftChange({
                  sections: event.target.value
                    .split("\n")
                    .map((section) => section.trim())
                    .filter(Boolean),
                })
              }
              rows={6}
              value={postDraft.sections.join("\n")}
            />
          </label>

          <label className={labelClass}>
            <span>标签</span>
            <input
              className={fieldClass}
              onChange={(event) =>
                onDraftChange({
                  tags: event.target.value
                    .split(/\s+/)
                    .map((tag) => tag.replace(/^#+/, "").trim())
                    .filter(Boolean),
                })
              }
              value={postDraft.tags.join(" ")}
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
            <span className="text-[0.78rem] font-black uppercase tracking-[0.12em] text-[var(--red-strong)]">
              等待图文
            </span>
            <strong className="text-[1rem] font-black leading-snug text-[var(--ink)]">
              {selectedTitle ?? "先选择一个大纲"}
            </strong>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2" aria-label="图文操作">
        <button
          className="quiet-action compact"
          disabled={!postDraft}
          onClick={() => postDraft && onCopy(getFullPostText(postDraft), "完整笔记")}
          type="button"
        >
          复制完整笔记
        </button>
        <button
          className="quiet-action compact"
          disabled={!postDraft}
          onClick={() => postDraft && onCopy(postDraft.title, "标题")}
          type="button"
        >
          复制标题
        </button>
        <button
          className="quiet-action compact"
          disabled={!postDraft}
          onClick={() => postDraft && onCopy(postDraft.coverLine, "封面文案")}
          type="button"
        >
          复制封面文案
        </button>
        <button
          className="quiet-action compact"
          disabled={!postDraft}
          onClick={() => postDraft && onCopy(getPostBodyText(postDraft), "正文")}
          type="button"
        >
          复制正文
        </button>
        <button
          className="quiet-action compact"
          disabled={!postDraft}
          onClick={() => onCopy(tagsText, "标签")}
          type="button"
        >
          复制标签
        </button>
        <button
          className="quiet-action compact"
          disabled={!postDraft}
          onClick={() => postDraft && onCopy(postDraft.imagePrompt, "封面提示")}
          type="button"
        >
          复制封面提示
        </button>
        <button
          className="quiet-action compact"
          disabled={!postDraft || isSavingDraft}
          onClick={onSaveDraft}
          type="button"
        >
          {isSavingDraft ? "保存中" : "保存草稿"}
        </button>
        {draftStale ? (
          <button
            className="primary-action compact"
            disabled={isGenerating}
            onClick={onRefresh}
            type="button"
          >
            {isGenerating ? "生成中" : "刷新图文"}
          </button>
        ) : null}
      </div>

      {savedDrafts.length ? (
        <div className="grid gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-tint)] p-3">
          <h3 className="text-[0.82rem] font-black text-[var(--ink)]">
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
                <strong className="text-[0.86rem] font-black leading-snug">
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
