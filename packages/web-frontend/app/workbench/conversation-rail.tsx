"use client";

import { Plus, Save, Trash2 } from "lucide-react";
import type { AutoSaveState, ConversationRecord } from "./types";

type ConversationRailProps = {
  activeConversationId: string | null;
  autoSaveLabel: string;
  autoSaveState: AutoSaveState;
  conversations: ConversationRecord[];
  isGenerating: boolean;
  isHistoryReady: boolean;
  isStartingConversation: boolean;
  onCreateConversation: () => void;
  onDeleteConversation: (record: ConversationRecord) => void;
  onRestoreConversation: (record: ConversationRecord) => void;
  onSaveConversation: () => void;
};

export function ConversationRail({
  activeConversationId,
  autoSaveLabel,
  autoSaveState,
  conversations,
  isGenerating,
  isHistoryReady,
  isStartingConversation,
  onCreateConversation,
  onDeleteConversation,
  onRestoreConversation,
  onSaveConversation,
}: ConversationRailProps) {
  const newConversationTitle = isStartingConversation ? "新建中" : "新增对话";
  const headerButtonClass =
    "grid size-9 place-items-center rounded-md border border-[var(--line)] bg-[var(--surface-tint)] text-[var(--ink)] transition hover:border-[var(--red)] hover:bg-[var(--red-soft)] hover:text-[var(--red-strong)] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-[var(--line)] disabled:hover:bg-[var(--surface-tint)] disabled:hover:text-[var(--ink)]";
  const autoSaveClassByState: Record<AutoSaveState, string> = {
    error: "border-[oklch(82%_0.08_88)] bg-[var(--yellow)] text-[var(--ink)]",
    idle: "border-[var(--line)] bg-[var(--surface-tint)] text-[var(--ink-soft)]",
    saved: "border-[oklch(82%_0.05_158)] bg-[var(--mint)] text-[var(--mint-ink)]",
    saving:
      "border-[oklch(79%_0.08_24)] bg-[var(--red-soft)] text-[var(--red-strong)]",
  };

  return (
    <aside
      className="grid w-full shrink-0 gap-3 rounded-lg border border-[var(--line)] bg-[var(--surface-tint)] p-3 xl:sticky xl:top-3.5"
      aria-labelledby="conversation-rail-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <p className="m-0 text-xs font-bold text-[var(--muted)]">
            历史记录
          </p>
          <h2
            className="text-[1rem] font-bold leading-tight text-[var(--ink)]"
            id="conversation-rail-title"
          >
            创作记录
          </h2>
        </div>
        <span
          className={`grid min-h-[30px] max-w-full place-items-center whitespace-nowrap rounded-md border px-2 text-xs font-bold ${autoSaveClassByState[autoSaveState]}`}
          aria-live="polite"
          title={autoSaveLabel}
        >
          {autoSaveLabel}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          aria-label={newConversationTitle}
          className={headerButtonClass}
          disabled={!isHistoryReady || isStartingConversation || isGenerating}
          onClick={onCreateConversation}
          title={newConversationTitle}
          type="button"
        >
          <Plus aria-hidden="true" size={16} strokeWidth={2.4} />
        </button>
        <button
          aria-label="立即保存"
          className={headerButtonClass}
          disabled={!isHistoryReady}
          onClick={onSaveConversation}
          title="立即保存"
          type="button"
        >
          <Save aria-hidden="true" size={16} strokeWidth={2.4} />
        </button>
      </div>

      {conversations.length ? (
        <ul className="grid list-none gap-2 p-0">
          {conversations.map((record) => {
            const isActive = record.conversationId === activeConversationId;

            return (
              <li
                className={`grid grid-cols-[minmax(0,1fr)_36px] gap-1.5 rounded-md border p-1.5 ${
                  isActive
                    ? "border-[var(--red)] bg-[var(--red-soft)]"
                    : "border-[var(--line)] bg-[var(--surface)]"
                }`}
                key={record.id}
              >
                <button
                  aria-current={isActive ? "true" : undefined}
                  aria-label={`恢复记录：${record.title}`}
                  className="grid min-w-0 gap-1 rounded-md border-0 bg-transparent p-2 text-left text-[var(--ink)]"
                  onClick={() => onRestoreConversation(record)}
                  type="button"
                >
                  <span className="truncate font-mono text-[0.72rem] font-extrabold text-[var(--muted)]">
                    {record.savedAt}
                  </span>
                  <strong className="truncate text-[0.84rem] font-bold leading-snug">
                    {record.title}
                  </strong>
                  <small className="truncate text-[0.74rem] font-extrabold text-[var(--muted)]">
                    {record.outlineCount} 个大纲 ·{" "}
                    {record.snapshot?.postDraft ? "含图文" : "后端记录"}
                  </small>
                </button>
                <button
                  aria-label={`删除记录：${record.title}`}
                  className="grid size-8 place-items-center rounded-md border border-[var(--line)] bg-[var(--surface)] text-[var(--red-strong)] transition hover:border-[var(--red)] hover:bg-[var(--red-soft)]"
                  onClick={() => onDeleteConversation(record)}
                  title="删除"
                  type="button"
                >
                  <Trash2 aria-hidden="true" size={14} strokeWidth={2.4} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-md border border-dashed border-[var(--line)] bg-[var(--surface-tint)] p-3 text-[0.82rem] font-extrabold leading-relaxed text-[var(--muted)]">
          还没有记录，输入想法后会自动保存。
        </p>
      )}
    </aside>
  );
}
