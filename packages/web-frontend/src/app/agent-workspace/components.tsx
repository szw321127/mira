"use client";

import { XMarkdown } from "@ant-design/x-markdown";
import "@ant-design/x-markdown/themes/light.css";
import {
  AlertTriangle,
  Bot,
  ChevronRight,
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
import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { shouldRenderMarkdown } from "./message-rendering";
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

function conversationPreview(conversation: Conversation) {
  const latestMessage = [...conversation.messages].reverse().find((message) => {
    return message.content.trim().length > 0;
  });

  return latestMessage?.content.trim() ?? "尚未发送消息";
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

  return (
    <aside className="conversation-rail">
      <div className="rail-header">
        <div className="rail-brand" aria-label="RedNote Agent">
          <span className="rail-brand-icon">
            <Bot aria-hidden="true" size={18} />
          </span>
          <span className="min-w-0">
            <span className="rail-title">RedNote</span>
            <span className="rail-subtitle">Agent chat</span>
          </span>
        </div>
        <button
          aria-label="新对话"
          className="icon-button primary"
          onClick={onNew}
          type="button"
        >
          <Plus aria-hidden="true" size={18} />
        </button>
      </div>

      <div className="rail-search">
        <div className="search-control">
          <Search
            aria-hidden="true"
            className="search-control-icon"
            size={16}
          />
          <input
            aria-label="搜索对话"
            className="search-control-input"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索对话"
            value={query}
          />
          {query ? (
            <button
              aria-label="清空搜索"
              className="search-clear"
              onClick={() => setQuery("")}
              type="button"
            >
              <X aria-hidden="true" size={14} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="conversation-list">
        {filtered.length === 0 ? (
          <div className="rail-empty">
            <Search aria-hidden="true" size={16} />
            还没有匹配的对话
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((conversation) => {
              const active = conversation.id === activeConversationId;
              return (
                <button
                  aria-current={active ? "page" : undefined}
                  className="conversation-item"
                  data-active={active}
                  key={conversation.id}
                  onClick={() => onSelect(conversation.id)}
                  type="button"
                >
                  <span className="conversation-item-top">
                    <span className="conversation-title">
                      {conversation.title}
                    </span>
                    <span className="conversation-time">
                      {formatTime(conversation.updatedAt)}
                    </span>
                  </span>
                  <span className="conversation-preview">
                    {conversationPreview(conversation)}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="rail-footer">
        对话保存在当前浏览器。后续可接入账号同步和更多工具。
      </div>
    </aside>
  );
}

function EmptyState({ onPrompt }: { onPrompt: (prompt: string) => void }) {
  const prompts = [
    "总结这段资料并列出下一步",
    "帮我比较两个方案的利弊",
    "把这个想法整理成可执行计划",
  ];

  return (
    <section className="empty-state">
      <div className="empty-icon">
        <Bot aria-hidden="true" size={22} />
      </div>
      <h1 className="empty-title">
        今天想让 agent 帮你做什么？
      </h1>
      <p className="empty-copy">
        输入问题、资料、计划或想法。RedNote 会保留上下文，并把关键过程显示出来。
      </p>
      <div className="prompt-list">
        {prompts.map((prompt) => (
          <button
            className="prompt-chip"
            key={prompt}
            onClick={() => onPrompt(prompt)}
            type="button"
          >
            <span>{prompt}</span>
            <ChevronRight aria-hidden="true" size={16} />
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
      <span className="agent-event-body">
        <span className="agent-event-header">
          <span>{eventLabel(event)}</span>
          <time dateTime={event.createdAt}>{formatTime(event.createdAt)}</time>
        </span>
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
  const renderMarkdown = shouldRenderMarkdown(message.role);
  const fallback =
    message.status === "streaming"
      ? "正在组织回答..."
      : message.status === "error"
        ? "运行失败，请查看下方错误。"
        : "";

  return (
    <article
      className={isUser ? "message user" : "message assistant"}
      data-status={message.status}
    >
      <div className="message-meta">
        <span>{isUser ? "你" : "RedNote Agent"}</span>
        <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
      </div>
      {message.content ? (
        renderMarkdown ? (
          <XMarkdown
            className="message-markdown"
            content={message.content}
            escapeRawHtml
            openLinksInNewTab
          />
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-7">
            {message.content}
          </p>
        )
      ) : null}
      {!message.content && fallback ? (
        <p className="text-sm text-[var(--muted-strong)]">{fallback}</p>
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
    <div className="thread">
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
  const status = latestAssistant?.status ?? "idle";
  const statusLabel =
    status === "streaming"
      ? "运行中"
      : status === "error"
        ? "需要处理"
        : status === "stopped"
          ? "已停止"
          : status === "complete"
            ? "已完成"
            : "待运行";
  const events =
    latestAssistant?.events
      .filter((event) => event.type !== "text-delta")
      .slice(-5) ?? [];

  return (
    <aside className="activity-dock">
      <div className="dock-header">
        <div>
          <h2 className="dock-title">运行状态</h2>
          <p className="dock-copy">查看最近的工具调用、重试和停止原因。</p>
        </div>
        <span className="dock-status" data-status={status}>
          <span aria-hidden="true" />
          {statusLabel}
        </span>
      </div>
      <div className="dock-events">
        {events.length === 0 ? (
          <div className="dock-empty">
            发送消息后，这里会显示 agent 的关键动作。
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, [value]);

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
    <form className="composer" data-streaming={isStreaming} onSubmit={submit}>
      <textarea
        aria-label="向 RedNote Agent 输入消息"
        className="composer-input"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="输入问题、资料或想法..."
        ref={textareaRef}
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

  return (
    <div className="workspace-shell">
      <div className="hidden md:block">
        <ConversationRail
          activeConversationId={activeConversation.id}
          conversations={conversations}
          onNew={onNew}
          onSelect={onSelect}
        />
      </div>

      {sidebarOpen ? (
        <div
          className="mobile-rail-overlay"
          onClick={() => setSidebarOpen(false)}
        >
          <div
            aria-label="对话列表"
            aria-modal="true"
            className="mobile-rail-panel"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
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
          </div>
          <button
            aria-label="关闭侧边栏"
            className="mobile-rail-close"
            onClick={() => setSidebarOpen(false)}
            type="button"
          >
            <X aria-hidden="true" size={19} />
          </button>
        </div>
      ) : null}

      <main className="workspace-main">
        <header className="mobile-header">
          <button
            aria-label="打开侧边栏"
            className="icon-button"
            onClick={() => setSidebarOpen(true)}
            type="button"
          >
            <Menu aria-hidden="true" size={18} />
          </button>
          <div className="mobile-title">
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

        <header className="workspace-topbar">
          <div className="min-w-0">
            <h1>{activeConversation.title}</h1>
            <p>
              {activeConversation.messages.length === 0
                ? "开始一段新的 agent 对话"
                : `${activeConversation.messages.length} 条消息`}
            </p>
          </div>
        </header>

        {storageWarning ? <div className="notice">{storageWarning}</div> : null}

        <div className="thread-scroll">
          <ChatThread conversation={activeConversation} onPrompt={onPrompt} />
        </div>

        {lastAssistantFailed ? (
          <div className="retry-row">
            <button className="retry-button" onClick={onRetry} type="button">
              <RefreshCcw aria-hidden="true" size={15} />
              重试上一条
            </button>
          </div>
        ) : null}

        <div className="composer-bar">
          <Composer onSend={onSend} onStop={onStop} sendState={sendState} />
        </div>
      </main>

      <ContextDock conversation={activeConversation} />
    </div>
  );
}
