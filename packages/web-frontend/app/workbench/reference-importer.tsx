"use client";

import { FileText, Link2, LoaderCircle, UserRound, X } from "lucide-react";
import type { ReferenceImportMode, ReferenceImportState } from "./types";

type ReferenceImporterProps = {
  isDisabled: boolean;
  isImporting: boolean;
  onClearAccount: () => void;
  onImport: () => void;
  onModeChange: (mode: ReferenceImportMode) => void;
  onRemovePost: (key: string) => void;
  onUrlChange: (value: string) => void;
  referenceImport: ReferenceImportState;
};

const modeOptions: Array<{
  icon: typeof FileText;
  label: string;
  mode: ReferenceImportMode;
}> = [
  { icon: FileText, label: "帖子 URL", mode: "post" },
  { icon: UserRound, label: "账号 URL", mode: "account" },
];

function formatCompactNumber(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
  return String(value);
}

function getImportedPostKey(
  post: ReferenceImportState["importedPosts"][number],
) {
  return (
    post.imported.sources[0]?.normalizedId ??
    post.analysis.post.url ??
    post.analysis.post.title
  );
}

export function ReferenceImporter({
  isDisabled,
  isImporting,
  onClearAccount,
  onImport,
  onModeChange,
  onRemovePost,
  onUrlChange,
  referenceImport,
}: ReferenceImporterProps) {
  const importedAccount = referenceImport.importedAccount;
  const importedPosts = referenceImport.importedPosts;
  const currentModeLabel =
    referenceImport.mode === "post" ? "帖子 URL" : "账号 URL";

  return (
    <section
      aria-labelledby="reference-import-title"
      className="grid gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <p className="m-0 text-xs font-bold text-[var(--muted)]">
            参考来源
          </p>
          <h2
            className="text-[1rem] font-bold leading-tight text-[var(--ink)]"
            id="reference-import-title"
          >
            导入账号或帖子信号
          </h2>
        </div>

        <div className="flex rounded-md border border-[var(--line)] bg-[var(--surface-tint)] p-1">
          {modeOptions.map(({ icon: Icon, label, mode }) => (
            <button
              aria-pressed={referenceImport.mode === mode}
              className={`inline-flex min-h-8 items-center gap-1.5 rounded px-2 text-[0.78rem] font-bold transition ${
                referenceImport.mode === mode
                  ? "bg-[var(--surface)] text-[var(--red-strong)]"
                  : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
              }`}
              key={mode}
              onClick={() => onModeChange(mode)}
              type="button"
            >
              <Icon aria-hidden="true" size={14} strokeWidth={2.4} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <form
        className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          onImport();
        }}
      >
        <label className="grid gap-1.5 text-[0.82rem] font-extrabold text-[var(--muted)]">
          <span>{currentModeLabel}</span>
          <span className="relative block">
            <Link2
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
              size={15}
              strokeWidth={2.4}
            />
            <input
              className="min-h-9 rounded-md border border-[var(--line)] bg-[var(--surface-tint)] py-1.5 pl-9 pr-3 text-[0.9rem] font-semibold text-[var(--ink)] outline-none transition placeholder:text-[var(--muted)] focus-visible:border-[var(--red)] focus-visible:ring-2 focus-visible:ring-[var(--red-soft)]"
              disabled={isDisabled || isImporting}
              onChange={(event) => onUrlChange(event.target.value)}
              placeholder={
                referenceImport.mode === "post"
                  ? "粘贴一条小红书帖子链接"
                  : "粘贴一个小红书账号主页"
              }
              value={referenceImport.url}
            />
          </span>
        </label>

        <button
          className="inline-flex min-h-9 items-center justify-center gap-2 self-end rounded-md border border-transparent bg-[var(--red)] px-3 text-[0.86rem] font-black text-[var(--surface)] transition hover:bg-[var(--red-strong)] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isDisabled || isImporting}
          type="submit"
        >
          {isImporting ? (
            <LoaderCircle
              aria-hidden="true"
              className="animate-spin"
              size={15}
              strokeWidth={2.4}
            />
          ) : null}
          {isImporting ? "分析中" : "导入参考"}
        </button>
      </form>

      {referenceImport.error ? (
        <p className="m-0 rounded-md border border-[var(--red-soft)] bg-[var(--surface-tint)] px-3 py-2 text-[0.8rem] font-bold text-[var(--red-strong)]">
          {referenceImport.error}
        </p>
      ) : null}

      {importedAccount ? (
        <article className="grid gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-tint)] p-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[0.72rem] font-bold text-[var(--muted)]">
                账号定位
              </span>
              <strong className="block truncate text-[0.9rem] font-extrabold text-[var(--ink)]">
                {importedAccount.analysis.snapshot.name || "已导入账号"}
              </strong>
            </div>
            <button
              aria-label="移除账号参考"
              className="grid size-8 place-items-center rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--red-strong)] transition hover:border-[var(--red)] hover:bg-[var(--red-soft)]"
              onClick={onClearAccount}
              type="button"
            >
              <X aria-hidden="true" size={14} strokeWidth={2.4} />
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5 text-[0.74rem] font-bold">
            <span className="rounded-full bg-[var(--surface)] px-2 py-1 text-[var(--ink-soft)]">
              {formatCompactNumber(importedAccount.analysis.snapshot.followers)}
              粉丝
            </span>
            <span className="rounded-full bg-[var(--surface)] px-2 py-1 text-[var(--ink-soft)]">
              {importedAccount.analysis.snapshot.postCount} 篇参考
            </span>
            {importedAccount.analysis.contentPillars.slice(0, 4).map((pillar) => (
              <span
                className="rounded-full bg-[var(--red-soft)] px-2 py-1 text-[var(--red-strong)]"
                key={pillar.name}
              >
                {pillar.name}
              </span>
            ))}
          </div>
        </article>
      ) : null}

      {importedPosts.length ? (
        <div className="grid gap-2" aria-label="已导入帖子参考">
          {importedPosts.map((post) => {
            const postKey = getImportedPostKey(post);

            return (
              <article
                className="grid gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-tint)] p-2.5"
                key={postKey}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[0.72rem] font-bold text-[var(--muted)]">
                      爆点信号
                    </span>
                    <strong className="line-clamp-1 text-[0.9rem] font-extrabold text-[var(--ink)]">
                      {post.analysis.post.title}
                    </strong>
                  </div>
                  <button
                    aria-label="移除帖子参考"
                    className="grid size-8 place-items-center rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--red-strong)] transition hover:border-[var(--red)] hover:bg-[var(--red-soft)]"
                    onClick={() => onRemovePost(postKey)}
                    type="button"
                  >
                    <X aria-hidden="true" size={14} strokeWidth={2.4} />
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5 text-[0.74rem] font-bold">
                  <span className="rounded-full bg-[var(--surface)] px-2 py-1 text-[var(--ink-soft)]">
                    {formatCompactNumber(post.analysis.engagement.total)} 互动
                  </span>
                  {[
                    ...post.analysis.viralSignals,
                    ...post.analysis.tagPatterns.map((tag) => `#${tag}`),
                  ]
                    .slice(0, 5)
                    .map((signal) => (
                      <span
                        className="rounded-full bg-[var(--red-soft)] px-2 py-1 text-[var(--red-strong)]"
                        key={signal}
                      >
                        {signal}
                      </span>
                    ))}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
