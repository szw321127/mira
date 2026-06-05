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

  return (
    <aside
      className="sticky top-3.5 grid w-[248px] shrink-0 gap-3.5 bg-[var(--surface)] p-3.5"
      aria-labelledby="conversation-rail-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-1">
          <p className="section-kicker">对话</p>
          <h2
            className="text-[1rem] font-black leading-tight text-[var(--ink)]"
            id="conversation-rail-title"
          >
            当前创作
          </h2>
        </div>
        <span
          className={`autosave-pill is-${autoSaveState} max-w-[104px] truncate`}
          aria-live="polite"
          title={autoSaveLabel}
        >
          {autoSaveLabel}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          aria-label={newConversationTitle}
          className="icon-button"
          disabled={!isHistoryReady || isStartingConversation || isGenerating}
          onClick={onCreateConversation}
          title={newConversationTitle}
          type="button"
        >
          <Plus aria-hidden="true" size={16} strokeWidth={2.4} />
        </button>
        <button
          aria-label="立即保存"
          className="icon-button"
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
                    : "border-[var(--line)] bg-[var(--surface-tint)]"
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
                  <strong className="truncate text-[0.84rem] font-black leading-snug">
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
