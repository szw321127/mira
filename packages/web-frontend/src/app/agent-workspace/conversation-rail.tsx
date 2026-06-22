"use client";

import {
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import Image from "next/image";
import { KeyboardEvent, useRef, useState } from "react";
import { cn } from "./classnames";
import { formatTime } from "./format";
import { IconButton } from "./icon-button";
import type { Conversation } from "./types";

function conversationPreview(conversation: Conversation) {
  const latestMessage = [...conversation.messages].reverse().find((message) => {
    return message.content.trim().length > 0;
  });

  return latestMessage?.content.trim() ?? "尚未发送消息";
}

export function ConversationRail({
  activeConversationId,
  conversations,
  onDelete,
  onNew,
  onRename,
  onSelect,
}: {
  activeConversationId: string;
  conversations: Conversation[];
  onDelete: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const skipNextEditBlurRef = useRef(false);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = conversations.filter((conversation) => {
    if (!normalizedQuery) return true;
    return (
      conversation.title.toLowerCase().includes(normalizedQuery) ||
      conversation.messages.some((message) => {
        return message.content.toLowerCase().includes(normalizedQuery);
      })
    );
  });

  function startEditing(conversation: Conversation) {
    setEditingId(conversation.id);
    setEditingTitle(conversation.title);
    setOpenMenuId(null);
  }

  function saveEditing() {
    if (skipNextEditBlurRef.current) {
      skipNextEditBlurRef.current = false;
      return;
    }
    if (!editingId) return;
    onRename(editingId, editingTitle);
    setEditingId(null);
    setEditingTitle("");
  }

  function cancelEditing() {
    skipNextEditBlurRef.current = true;
    setEditingId(null);
    setEditingTitle("");
  }

  function confirmDelete(conversation: Conversation) {
    setOpenMenuId(null);
    const confirmed = window.confirm(`删除对话“${conversation.title}”？`);
    if (confirmed) onDelete(conversation.id);
  }

  return (
    <aside className="flex h-full w-[292px] flex-col border-r border-[var(--border)] bg-[var(--surface-muted)]">
      <div className="flex h-[var(--workspace-header-height)] items-center gap-2.5 border-b border-[var(--border)] p-3">
        <div
          aria-label="Mira Agent"
          className="flex min-w-0 flex-1 items-center gap-2.5"
        >
          <span className="inline-flex h-[38px] w-[38px] items-center justify-center rounded-[10px] border border-[var(--border)] bg-[var(--surface)] shadow-[0_10px_22px_oklch(0.24_0.02_260/0.06)]">
            <Image
              alt=""
              aria-hidden="true"
              className="h-[26px] w-[29px]"
              height={26}
              src="/brand/mira-mark.svg"
              width={29}
            />
          </span>
          <span className="min-w-0">
            <span className="block overflow-hidden text-sm leading-[1.25] font-bold text-ellipsis whitespace-nowrap text-[var(--ink)]">
              Mira
            </span>
            <span className="block overflow-hidden text-xs leading-[1.4] text-ellipsis whitespace-nowrap text-[var(--muted)]">
              Agent chat
            </span>
          </span>
        </div>
        <IconButton
          aria-label="新对话"
          onClick={onNew}
          variant="primary"
          type="button"
        >
          <Plus aria-hidden="true" size={18} />
        </IconButton>
      </div>

      <div className="border-b border-[var(--border)] px-3 py-2.5">
        <div className="grid min-h-10 grid-cols-[18px_minmax(0,1fr)_auto] items-center rounded-[9px] border border-[var(--border)] bg-[var(--surface)] py-0 pr-[9px] pl-[11px] text-[var(--muted-strong)] transition-colors focus-within:border-[var(--accent)] focus-within:text-[var(--accent)]">
          <Search
            aria-hidden="true"
            className="pointer-events-none text-current"
            size={16}
          />
          <input
            aria-label="搜索对话"
            className="w-full min-w-0 border-0 bg-transparent px-2 py-[9px] text-[var(--ink)] outline-0 placeholder:text-[var(--muted-strong)] placeholder:opacity-100"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索对话"
            value={query}
          />
          {query ? (
            <button
              aria-label="清空搜索"
              className="inline-flex h-7 w-7 items-center justify-center rounded-[7px] bg-transparent text-[var(--muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--ink)]"
              onClick={() => setQuery("")}
              type="button"
            >
              <X aria-hidden="true" size={14} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="flex min-h-[140px] items-center justify-center gap-2 text-center text-[13px] text-[var(--muted)]">
            <Search aria-hidden="true" size={16} />
            还没有匹配的对话
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((conversation) => {
              const active = conversation.id === activeConversationId;
              const editing = conversation.id === editingId;
              return (
                <div
                  className={cn(
                    "group relative grid min-h-[66px] w-full grid-cols-[minmax(0,1fr)_30px] items-start rounded-[10px] border p-[5px] text-left text-[var(--ink)] transition-colors",
                    active
                      ? "border-[var(--border-strong)] bg-[var(--surface)]"
                      : "border-transparent hover:border-[var(--border)] hover:bg-[var(--surface)]",
                  )}
                  key={conversation.id}
                >
                  {editing ? (
                    <form
                      className="col-span-2 w-full"
                      onSubmit={(event) => {
                        event.preventDefault();
                        saveEditing();
                      }}
                    >
                      <input
                        aria-label="修改对话名称"
                        autoFocus
                        className="min-h-[38px] w-full rounded-lg border border-[var(--accent)] bg-[var(--surface)] px-[9px] text-[13px] font-[650] text-[var(--ink)] outline-0"
                        onBlur={saveEditing}
                        onChange={(event) => setEditingTitle(event.target.value)}
                        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                          if (event.key === "Escape") {
                            event.preventDefault();
                            cancelEditing();
                          }
                        }}
                        value={editingTitle}
                      />
                    </form>
                  ) : (
                    <>
                      <button
                        aria-current={active ? "page" : undefined}
                        className="flex min-h-[54px] min-w-0 flex-col gap-1 bg-transparent px-[7px] py-[5px] text-left text-inherit"
                        onClick={() => {
                          setOpenMenuId(null);
                          onSelect(conversation.id);
                        }}
                        type="button"
                      >
                        <span className="flex w-full items-baseline gap-2">
                          <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] leading-[1.4] font-[650]">
                            {conversation.title}
                          </span>
                          <span className="shrink-0 text-[11px] leading-[1.4] text-[var(--muted)]">
                            {formatTime(conversation.updatedAt)}
                          </span>
                        </span>
                        <span className="line-clamp-2 text-xs leading-[1.45] text-[var(--muted)]">
                          {conversationPreview(conversation)}
                        </span>
                      </button>
                      <div className="relative flex min-w-0 items-start justify-end">
                        <button
                          aria-expanded={openMenuId === conversation.id}
                          aria-label="对话操作"
                          className={cn(
                            "inline-flex h-[30px] w-[30px] items-center justify-center rounded-[7px] bg-transparent text-[var(--muted)] opacity-0 transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--ink)] group-hover:opacity-100",
                            active || openMenuId === conversation.id
                              ? "opacity-100"
                              : "",
                          )}
                          onClick={() =>
                            setOpenMenuId((current) =>
                              current === conversation.id
                                ? null
                                : conversation.id,
                            )
                          }
                          type="button"
                        >
                          <MoreHorizontal aria-hidden="true" size={16} />
                        </button>
                        {openMenuId === conversation.id ? (
                          <div
                            className="absolute top-[34px] right-0 z-5 grid min-w-[116px] overflow-hidden rounded-[9px] border border-[var(--border)] bg-[var(--surface)] p-1 shadow-[0_18px_40px_oklch(0.25_0.02_260/0.12)]"
                            role="menu"
                          >
                            <button
                              className="flex min-h-8 items-center gap-2 rounded-[7px] bg-transparent px-2 text-left text-[13px] whitespace-nowrap text-[var(--ink)] hover:bg-[var(--surface-muted)]"
                              onClick={() => startEditing(conversation)}
                              role="menuitem"
                              type="button"
                            >
                              <Pencil aria-hidden="true" size={14} />
                              重命名
                            </button>
                            <button
                              className="flex min-h-8 items-center gap-2 rounded-[7px] bg-transparent px-2 text-left text-[13px] whitespace-nowrap text-[var(--danger)] hover:bg-[var(--surface-muted)]"
                              onClick={() => confirmDelete(conversation)}
                              role="menuitem"
                              type="button"
                            >
                              <Trash2 aria-hidden="true" size={14} />
                              删除
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--border)] p-3 text-xs leading-[1.6] text-[var(--muted)]">
        对话保存在当前浏览器。后续可接入账号同步和更多工具。
      </div>
    </aside>
  );
}
