"use client";

import { useMemo, useState } from "react";
import type { XhsResearchRun } from "@/lib/api";
import type { Outline, OutlineGroup } from "./types";
import { toneMeta } from "./workspace-utils";

type OutlineWorkspaceProps = {
  hasPostDraft: boolean;
  isGenerating: boolean;
  isStartingConversation: boolean;
  latestBatch: number;
  latestResearch: XhsResearchRun | null;
  onConfirmOutline: () => void;
  onRegenerate: () => void;
  onSelectOutline: (outline: Outline) => void;
  onUpdateOutline: (id: string, patch: Partial<Outline>) => void;
  outlineGroups: OutlineGroup[];
  selectedId: string;
  selectedOutline: Outline | undefined;
  workspaceKey: string;
};

export function OutlineWorkspace({
  hasPostDraft,
  isGenerating,
  isStartingConversation,
  latestBatch,
  latestResearch,
  onConfirmOutline,
  onRegenerate,
  onSelectOutline,
  onUpdateOutline,
  outlineGroups,
  selectedId,
  selectedOutline,
  workspaceKey,
}: OutlineWorkspaceProps) {
  const [openBatchById, setOpenBatchById] = useState<Record<string, boolean>>({});
  const [touchedBatchById, setTouchedBatchById] = useState<
    Record<string, boolean>
  >({});
  const primaryActionClass =
    "min-h-9 whitespace-nowrap rounded-md border border-transparent bg-[var(--red)] px-3 font-bold text-[var(--surface)] transition hover:bg-[var(--red-strong)] disabled:cursor-not-allowed disabled:opacity-50";
  const quietActionClass =
    "min-h-9 whitespace-nowrap rounded-md border border-[var(--line)] bg-[var(--surface-tint)] px-3 font-bold text-[var(--ink)] transition hover:border-[var(--red)] hover:bg-[var(--red-soft)] disabled:cursor-not-allowed disabled:opacity-50";

  const effectiveOpenBatchById = useMemo(() => {
    const nextOpenBatchById: Record<string, boolean> = {};

    outlineGroups.forEach((group) => {
      const batchKey = `${workspaceKey}:${group.batch}`;

      nextOpenBatchById[batchKey] = touchedBatchById[batchKey]
        ? Boolean(openBatchById[batchKey])
        : group.batch === latestBatch;
    });

    return nextOpenBatchById;
  }, [latestBatch, openBatchById, outlineGroups, touchedBatchById, workspaceKey]);

  return (
    <section
      className="grid gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3"
      aria-labelledby="outline-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <p className="m-0 text-xs font-bold text-[var(--muted)]">
            大纲
          </p>
          <h2
            className="text-[1rem] font-bold leading-tight text-[var(--ink)]"
            id="outline-title"
          >
            选择并调整方向
          </h2>
        </div>
        <button
          className={quietActionClass}
          disabled={isGenerating || isStartingConversation}
          onClick={onRegenerate}
          type="button"
        >
          {isGenerating ? "生成中" : "换一批"}
        </button>
      </div>

      {latestResearch ? <ResearchSummary research={latestResearch} /> : null}

      <div className="grid gap-3" aria-label="大纲方向">
        {outlineGroups.map((group) => {
          const batchKey = `${workspaceKey}:${group.batch}`;
          const isLatestBatch = group.batch === latestBatch;

          return (
            <details
              className="rounded-lg border border-[var(--line)] bg-[var(--surface-tint)] p-2.5"
              key={batchKey}
              onToggle={(event) => {
                // Ignore toggle events caused by React updating the controlled open prop.
                if (!event.nativeEvent.isTrusted) return;

                const isOpen = event.currentTarget.open;

                setTouchedBatchById((previousTouchedBatchById) => ({
                  ...previousTouchedBatchById,
                  [batchKey]: true,
                }));
                setOpenBatchById((previousOpenBatchById) => ({
                  ...previousOpenBatchById,
                  [batchKey]: isOpen,
                }));
              }}
              open={Boolean(effectiveOpenBatchById[batchKey])}
            >
              <summary className="cursor-pointer text-[0.82rem] font-bold text-[var(--ink)] marker:text-[var(--red)]">
                {isLatestBatch ? "最新一批" : `第 ${group.batch + 1} 批`}
                ，{group.outlines.length} 个方向
              </summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {group.outlines.map((outline) => {
                  const meta = toneMeta[outline.tone];
                  const isSelected = outline.id === selectedId;

                  return (
                    <button
                      aria-pressed={isSelected}
                      className={`grid min-h-[128px] gap-1.5 rounded-md border p-2.5 text-left transition ${
                        isSelected
                          ? "border-[var(--red)] bg-[var(--red-soft)]"
                          : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--red)] hover:bg-[var(--red-soft)]"
                      }`}
                      key={outline.id}
                      onClick={() => onSelectOutline(outline)}
                      type="button"
                    >
                      <span className="flex items-center gap-2 text-[0.72rem] font-bold text-[var(--muted)]">
                        <strong className="rounded-full bg-[var(--red)] px-2 py-0.5 text-[0.68rem] text-white">
                          {meta.mark}
                        </strong>
                        <em className="not-italic">{outline.label}</em>
                      </span>
                      <span className="text-[0.9rem] font-bold leading-snug text-[var(--ink)]">
                        {outline.title}
                      </span>
                      <span className="line-clamp-2 text-[0.76rem] font-semibold leading-normal text-[var(--muted)]">
                        {outline.hook}
                      </span>
                    </button>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>

      {selectedOutline ? (
        <article className="grid gap-2.5 rounded-lg border border-[var(--line)] bg-[var(--surface-tint)] p-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="grid gap-1">
              <span className="text-[0.72rem] font-bold text-[var(--muted)]">
                编辑中的大纲
              </span>
              <strong className="text-[0.96rem] font-bold text-[var(--ink)]">
                {toneMeta[selectedOutline.tone].name}
              </strong>
            </div>
            <button
              className={primaryActionClass}
              disabled={isGenerating}
              onClick={onConfirmOutline}
              type="button"
            >
              {isGenerating ? "生成中" : hasPostDraft ? "刷新图文" : "生成图文"}
            </button>
          </div>

          <label className="grid gap-1.5 text-[0.82rem] font-extrabold text-[var(--muted)]">
            <span>标题</span>
            <input
              className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[0.9rem] font-semibold text-[var(--ink)] outline-none transition focus-visible:border-[var(--red)] focus-visible:ring-2 focus-visible:ring-[var(--red-soft)]"
              onChange={(event) =>
                onUpdateOutline(selectedOutline.id, { title: event.target.value })
              }
              value={selectedOutline.title}
            />
          </label>

          <label className="grid gap-1.5 text-[0.82rem] font-extrabold text-[var(--muted)]">
            <span>开场钩子</span>
            <textarea
              className="resize-y rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[0.9rem] font-semibold leading-normal text-[var(--ink)] outline-none transition focus-visible:border-[var(--red)] focus-visible:ring-2 focus-visible:ring-[var(--red-soft)]"
              onChange={(event) =>
                onUpdateOutline(selectedOutline.id, { hook: event.target.value })
              }
              rows={2}
              value={selectedOutline.hook}
            />
          </label>

          <label className="grid gap-1.5 text-[0.82rem] font-extrabold text-[var(--muted)]">
            <span>内容结构</span>
            <textarea
              className="resize-y rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-[0.9rem] font-semibold leading-normal text-[var(--ink)] outline-none transition focus-visible:border-[var(--red)] focus-visible:ring-2 focus-visible:ring-[var(--red-soft)]"
              onChange={(event) =>
                onUpdateOutline(selectedOutline.id, {
                  points: event.target.value
                    .split("\n")
                    .map((point) => point.trim())
                    .filter(Boolean),
                })
              }
              rows={4}
              value={selectedOutline.points.join("\n")}
            />
          </label>
        </article>
      ) : null}
    </section>
  );
}

function ResearchSummary({ research }: { research: XhsResearchRun }) {
  const confidenceText = {
    high: "高",
    low: "低",
    medium: "中",
  }[research.confidence];
  const patterns = [
    ...research.summary.hookPatterns,
    ...research.summary.outlinePatterns,
  ].slice(0, 4);

  return (
    <aside className="grid gap-2 rounded-md border border-[var(--line)] bg-[var(--surface-tint)] p-2.5">
      <div className="flex flex-wrap items-center gap-2 text-[0.72rem] font-black text-[var(--muted)]">
        <span className="rounded bg-[var(--surface)] px-2 py-0.5 text-[var(--red-strong)]">
          研究参考
        </span>
        <span>置信度 {confidenceText}</span>
        <span>样本 {research.sampleCount}</span>
        <span>关键词 {research.keywords.slice(0, 3).join(" / ")}</span>
      </div>

      {research.warnings[0] ? (
        <p className="m-0 text-[0.76rem] font-bold leading-normal text-[var(--red-strong)]">
          {research.warnings[0]}
        </p>
      ) : null}

      {patterns.length ? (
        <div className="flex flex-wrap gap-1.5">
          {patterns.map((pattern) => (
            <span
              className="rounded bg-[var(--surface)] px-2 py-1 text-[0.72rem] font-bold text-[var(--ink-soft)]"
              key={pattern}
            >
              {pattern}
            </span>
          ))}
        </div>
      ) : null}

      {research.summary.standoutSamples.length ? (
        <div className="grid gap-1">
          {research.summary.standoutSamples.slice(0, 2).map((sample) => (
            <p
              className="m-0 line-clamp-1 text-[0.74rem] font-semibold text-[var(--muted)]"
              key={`${sample.sourceId}:${sample.matchedKeyword}`}
            >
              {sample.title} · {sample.interactionSummary} ·{" "}
              {sample.matchedKeyword}
            </p>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
