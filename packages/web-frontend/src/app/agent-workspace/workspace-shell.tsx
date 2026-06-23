"use client";

import Link from "next/link";
import { Image as ImageIcon, Menu, Plus, RefreshCcw, X } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChatThread } from "./chat-thread";
import { Composer } from "./composer";
import { ContextDock } from "./context-dock";
import { ConversationRail } from "./conversation-rail";
import { IconButton } from "./icon-button";
import { isScrolledNearBottom, scrollElementToBottom } from "./scroll-follow";
import type { Conversation, SendState } from "./types";

export function AgentWorkspaceShell({
  activeConversation,
  conversations,
  onDelete,
  onNew,
  onPrompt,
  onRename,
  onRetry,
  onSelect,
  onSend,
  onStop,
  sendState,
  storageWarning,
}: {
  activeConversation: Conversation;
  conversations: Conversation[];
  onDelete: (id: string) => void;
  onNew: () => void;
  onPrompt: (prompt: string) => void;
  onRename: (id: string, title: string) => void;
  onRetry: () => void;
  onSelect: (id: string) => void;
  onSend: (value: string) => void;
  onStop: () => void;
  sendState: SendState;
  storageWarning: string | null;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const threadScrollRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const lastAssistantFailed = useMemo(() => {
    const latestAssistant = [...activeConversation.messages].reverse().find((message) => {
      return message.role === "assistant";
    });
    return latestAssistant?.status === "error";
  }, [activeConversation.messages]);

  useEffect(() => {
    if (!sidebarOpen) return;

    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setSidebarOpen(false);
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sidebarOpen]);

  useLayoutEffect(() => {
    const scrollElement = threadScrollRef.current;
    if (!scrollElement) return;
    if (!shouldStickToBottomRef.current) return;

    scrollElementToBottom(scrollElement);
  }, [activeConversation.id, activeConversation.messages]);

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-[var(--background)] text-[var(--ink)]">
      <div className="hidden md:block">
        <ConversationRail
          activeConversationId={activeConversation.id}
          conversations={conversations}
          onDelete={onDelete}
          onNew={onNew}
          onRename={onRename}
          onSelect={onSelect}
        />
      </div>

      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-40 flex bg-[oklch(0.14_0.012_260/0.42)]"
          onClick={() => setSidebarOpen(false)}
        >
          <div
            aria-label="对话列表"
            aria-modal="true"
            className="h-full w-[min(292px,calc(100vw-68px))] [&_aside]:w-full"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <ConversationRail
              activeConversationId={activeConversation.id}
              conversations={conversations}
              onDelete={(id) => {
                onDelete(id);
                setSidebarOpen(false);
              }}
              onNew={() => {
                onNew();
                setSidebarOpen(false);
              }}
              onRename={onRename}
              onSelect={(id) => {
                onSelect(id);
                setSidebarOpen(false);
              }}
            />
          </div>
          <button
            aria-label="关闭侧边栏"
            className="m-3 inline-flex h-[42px] w-[42px] items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-muted)]"
            onClick={() => setSidebarOpen(false)}
            type="button"
          >
            <X aria-hidden="true" size={19} />
          </button>
        </div>
      ) : null}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-2.5 border-b border-[var(--border)] px-2.5 py-2 md:hidden">
          <IconButton
            aria-label="打开侧边栏"
            onClick={() => setSidebarOpen(true)}
            type="button"
          >
            <Menu aria-hidden="true" size={18} />
          </IconButton>
          <div className="min-w-0 flex-1 overflow-hidden text-sm font-[650] text-ellipsis whitespace-nowrap">
            {activeConversation.title}
          </div>
          <Link
            aria-label="打开图像画布"
            className="inline-flex h-10 w-10 items-center justify-center rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] transition-colors hover:bg-[var(--surface-muted)]"
            href="/image-workspace"
          >
            <ImageIcon aria-hidden="true" size={17} />
          </Link>
          <IconButton
            aria-label="新对话"
            onClick={onNew}
            variant="primary"
            type="button"
          >
            <Plus aria-hidden="true" size={18} />
          </IconButton>
        </header>

        <header className="hidden h-[var(--workspace-header-height)] items-center gap-3 border-b border-[var(--border)] bg-[color-mix(in_oklch,var(--background)_82%,var(--surface))] px-[22px] py-3 md:flex">
          <div className="min-w-0 flex-1">
            <h1 className="m-0 max-w-[56ch] overflow-hidden text-[15px] leading-[1.3] font-[650] text-ellipsis whitespace-nowrap">
              {activeConversation.title}
            </h1>
            <p className="mt-[3px] mb-0 text-xs leading-normal text-[var(--muted)]">
              {activeConversation.messages.length === 0
                ? "开始一段新的 agent 对话"
                : `${activeConversation.messages.length} 条消息`}
            </p>
          </div>
          <Link
            className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--surface)] px-3 text-sm text-[var(--ink)] transition-colors hover:bg-[var(--surface-muted)]"
            href="/image-workspace"
          >
            <ImageIcon aria-hidden="true" size={15} />
            图像画布
          </Link>
        </header>

        {storageWarning ? (
          <div className="border-b border-[var(--border)] bg-[var(--warning-soft)] px-4 py-2 text-[13px] text-[var(--warning)]">
            {storageWarning}
          </div>
        ) : null}

        <div
          className="min-h-0 flex-1 overflow-y-auto"
          onScroll={(event) => {
            shouldStickToBottomRef.current = isScrolledNearBottom(
              event.currentTarget,
            );
          }}
          ref={threadScrollRef}
        >
          <ChatThread conversation={activeConversation} onPrompt={onPrompt} />
        </div>

        {lastAssistantFailed ? (
          <div className="mx-auto w-full max-w-[820px] px-6 pb-2 max-md:px-4">
            <button
              className="inline-flex min-h-[38px] items-center gap-2 rounded-[9px] border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--ink)] transition-colors hover:border-[color-mix(in_oklch,var(--accent)_40%,var(--border))] hover:bg-[var(--accent-subtle)]"
              onClick={onRetry}
              type="button"
            >
              <RefreshCcw aria-hidden="true" size={15} />
              重试上一条
            </button>
          </div>
        ) : null}

        <div className="border-t border-[var(--border)] bg-[color-mix(in_oklch,var(--background)_86%,var(--surface))] p-3 max-md:p-2.5">
          <Composer onSend={onSend} onStop={onStop} sendState={sendState} />
        </div>
      </main>

      <ContextDock conversation={activeConversation} />
    </div>
  );
}
