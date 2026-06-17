"use client";

import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleStop,
  FileSearch,
  Menu,
  Plus,
  RefreshCcw,
  Search,
  Send,
  Wrench,
  X,
} from "lucide-react";
import { FormEvent, KeyboardEvent, useMemo, useState } from "react";
import type { ChatEvent, ChatMessage, Conversation, SendState } from "./types";

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function eventLabel(event: ChatEvent) {
  switch (event.type) {
    case "tool-call":
      return `调用 ${event.toolName}`;
    case "tool-result":
      return `${event.toolName} 返回结果`;
    case "retry":
      return `第 ${event.attempt}/${event.maxRetries} 次重试`;
    case "detection":
      return event.level === "critical" ? "检测到阻塞风险" : "检测到重复风险";
    case "token-cost":
      return `Token 成本 ${event.cost}`;
    case "token-usage":
      return `Token 使用 ${event.percent}`;
    case "stop":
      return `已停止：${event.reason}`;
    case "error":
      return "运行失败";
    case "text-delta":
      return "";
  }
}

function EventIcon({ event }: { event: ChatEvent }) {
  if (event.type === "tool-call") return <Wrench aria-hidden="true" size={15} />;
  if (event.type === "tool-result") {
    return <CheckCircle2 aria-hidden="true" size={15} />;
  }
  if (event.type === "error" || event.type === "detection") {
    return <AlertTriangle aria-hidden="true" size={15} />;
  }
  return <FileSearch aria-hidden="true" size={15} />;
}

export function ConversationRail({
  activeConversationId,
  conversations,
  onNew,
  onSelect,
}: {
  activeConversationId: string;
  conversations: Conversation[];
  onNew: () => void;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = conversations.filter((conversation) => {
    return conversation.title.toLowerCase().includes(query.trim().toLowerCase());
  });

  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface-muted)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] p-3">
        <button
          aria-label="新对话"
          className="icon-button primary"
          onClick={onNew}
          type="button"
        >
          <Plus aria-hidden="true" size={18} />
        </button>
        <div className="relative flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]"
            size={16}
          />
          <input
            aria-label="搜索对话"
            className="field h-10 w-full pl-9"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索对话"
            value={query}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="px-3 py-10 text-sm text-[var(--muted)]">
            还没有匹配的对话
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((conversation) => (
              <button
                className="conversation-item"
                data-active={conversation.id === activeConversationId}
                key={conversation.id}
                onClick={() => onSelect(conversation.id)}
                type="button"
              >
                <span className="truncate text-sm font-medium">
                  {conversation.title}
                </span>
                <span className="text-xs text-[var(--muted)]">
                  {formatTime(conversation.updatedAt)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--border)] p-3 text-xs leading-5 text-[var(--muted)]">
        本期对话只保存在当前浏览器。后续阶段会接入账号和后端同步。
      </div>
    </aside>
  );
}

function EmptyState({ onPrompt }: { onPrompt: (prompt: string) => void }) {
  const prompts = [
    "帮我把一个护肤选题拆成 3 个不同大纲",
    "研究这个账号的爆款结构，再给我新选题",
    "把这段想法改成适合小红书的发布包",
  ];

  return (
    <section className="mx-auto flex max-w-2xl flex-1 flex-col justify-center px-5 py-16">
      <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
        <Bot aria-hidden="true" size={22} />
      </div>
      <h1 className="text-3xl font-semibold tracking-normal text-[var(--ink)]">
        今天要做哪条小红书内容？
      </h1>
      <p className="mt-3 max-w-xl text-base leading-7 text-[var(--muted-strong)]">
        告诉 agent 你的选题、账号定位或参考方向。它会边思考边展示工作过程。
      </p>
      <div className="mt-7 grid gap-2">
        {prompts.map((prompt) => (
          <button
            className="prompt-chip"
            key={prompt}
            onClick={() => onPrompt(prompt)}
            type="button"
          >
            {prompt}
          </button>
        ))}
      </div>
    </section>
  );
}

function AgentEventRow({ event }: { event: ChatEvent }) {
  if (event.type === "text-delta") return null;

  const detail =
    event.type === "tool-call"
      ? event.inputPreview
      : event.type === "tool-result"
        ? event.outputPreview
        : event.type === "retry"
          ? `${event.error}，${event.delayMs}ms 后重试`
          : event.type === "detection"
            ? event.message
            : event.type === "token-cost"
              ? event.detail
              : event.type === "token-usage"
                ? `${event.totalTokens}/${event.tokenBudget}`
                : event.type === "error"
                  ? event.message
                  : event.message ?? "";

  return (
    <div className="agent-event" data-kind={event.type}>
      <span className="agent-event-icon">
        <EventIcon event={event} />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium">{eventLabel(event)}</span>
        {detail ? (
          <span className="line-clamp-2 text-xs text-[var(--muted)]">
            {detail}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function MessageBlock({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <article className={isUser ? "message user" : "message assistant"}>
      <div className="message-meta">
        <span>{isUser ? "你" : "RedNote agent"}</span>
        <span>{formatTime(message.createdAt)}</span>
      </div>
      {message.content ? (
        <p className="whitespace-pre-wrap text-sm leading-7">{message.content}</p>
      ) : null}
      {!message.content && message.status === "streaming" ? (
        <p className="text-sm text-[var(--muted)]">正在思考...</p>
      ) : null}
      {message.events.length > 0 ? (
        <div className="mt-3 space-y-2">
          {message.events.map((event) => (
            <AgentEventRow event={event} key={event.eventId} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function ChatThread({
  conversation,
  onPrompt,
}: {
  conversation: Conversation;
  onPrompt: (prompt: string) => void;
}) {
  if (conversation.messages.length === 0) {
    return <EmptyState onPrompt={onPrompt} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-5 py-6">
      {conversation.messages.map((message) => (
        <MessageBlock key={message.id} message={message} />
      ))}
    </div>
  );
}

export function ContextDock({ conversation }: { conversation: Conversation }) {
  const latestAssistant = [...conversation.messages].reverse().find((message) => {
    return message.role === "assistant";
  });
  const events =
    latestAssistant?.events
      .filter((event) => event.type !== "text-delta")
      .slice(-5) ?? [];

  return (
    <aside className="hidden h-full w-[300px] shrink-0 border-l border-[var(--border)] bg-[var(--surface)] xl:flex xl:flex-col">
      <div className="border-b border-[var(--border)] p-4">
        <h2 className="text-sm font-semibold">Agent 工作</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
          最近的工具、重试和停止状态。
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {events.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] p-4 text-sm leading-6 text-[var(--muted)]">
            运行后会在这里显示 agent 的关键动作。
          </div>
        ) : (
          events.map((event) => (
            <AgentEventRow event={event} key={event.eventId} />
          ))
        )}
      </div>
    </aside>
  );
}

export function Composer({
  onSend,
  onStop,
  sendState,
}: {
  onSend: (value: string) => void;
  onStop: () => void;
  sendState: SendState;
}) {
  const [value, setValue] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const message = value.trim();
    if (!message) return;
    onSend(message);
    setValue("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  const isStreaming = sendState === "streaming";

  return (
    <form className="composer" onSubmit={submit}>
      <textarea
        aria-label="向 RedNote agent 输入消息"
        className="composer-input"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="问 RedNote agent..."
        rows={1}
        value={value}
      />
      {isStreaming ? (
        <button
          aria-label="停止"
          className="icon-button"
          onClick={onStop}
          type="button"
        >
          <CircleStop aria-hidden="true" size={18} />
        </button>
      ) : (
        <button
          aria-label="发送"
          className="icon-button primary"
          disabled={!value.trim()}
          type="submit"
        >
          <Send aria-hidden="true" size={18} />
        </button>
      )}
    </form>
  );
}

export function AgentWorkspaceShell({
  activeConversation,
  conversations,
  onNew,
  onPrompt,
  onRetry,
  onSelect,
  onSend,
  onStop,
  sendState,
  storageWarning,
}: {
  activeConversation: Conversation;
  conversations: Conversation[];
  onNew: () => void;
  onPrompt: (prompt: string) => void;
  onRetry: () => void;
  onSelect: (id: string) => void;
  onSend: (value: string) => void;
  onStop: () => void;
  sendState: SendState;
  storageWarning: string | null;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const lastAssistantFailed = useMemo(() => {
    return [...activeConversation.messages].reverse().some((message) => {
      return message.role === "assistant" && message.status === "error";
    });
  }, [activeConversation.messages]);

  return (
    <div className="flex h-dvh overflow-hidden bg-[var(--background)] text-[var(--ink)]">
      <div className="hidden md:block">
        <ConversationRail
          activeConversationId={activeConversation.id}
          conversations={conversations}
          onNew={onNew}
          onSelect={onSelect}
        />
      </div>

      {sidebarOpen ? (
        <div className="fixed inset-0 z-40 flex bg-black/30 md:hidden">
          <ConversationRail
            activeConversationId={activeConversation.id}
            conversations={conversations}
            onNew={() => {
              onNew();
              setSidebarOpen(false);
            }}
            onSelect={(id) => {
              onSelect(id);
              setSidebarOpen(false);
            }}
          />
          <button
            aria-label="关闭侧边栏"
            className="m-3 h-11 w-11 rounded-full bg-white"
            onClick={() => setSidebarOpen(false)}
            type="button"
          >
            <X aria-hidden="true" className="mx-auto" size={19} />
          </button>
        </div>
      ) : null}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-[var(--border)] px-3 md:hidden">
          <button
            aria-label="打开侧边栏"
            className="icon-button"
            onClick={() => setSidebarOpen(true)}
            type="button"
          >
            <Menu aria-hidden="true" size={18} />
          </button>
          <div className="min-w-0 flex-1 truncate text-sm font-semibold">
            {activeConversation.title}
          </div>
          <button
            aria-label="新对话"
            className="icon-button primary"
            onClick={onNew}
            type="button"
          >
            <Plus aria-hidden="true" size={18} />
          </button>
        </header>

        {storageWarning ? <div className="notice">{storageWarning}</div> : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <ChatThread conversation={activeConversation} onPrompt={onPrompt} />
        </div>

        {lastAssistantFailed ? (
          <div className="mx-auto w-full max-w-3xl px-5 pb-2">
            <button className="retry-button" onClick={onRetry} type="button">
              <RefreshCcw aria-hidden="true" size={15} />
              重试上一条
            </button>
          </div>
        ) : null}

        <div className="border-t border-[var(--border)] bg-[var(--background)] px-3 py-3">
          <Composer onSend={onSend} onStop={onStop} sendState={sendState} />
        </div>
      </main>

      <ContextDock conversation={activeConversation} />
    </div>
  );
}
