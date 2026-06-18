"use client";

import { XMarkdown } from "@ant-design/x-markdown";
import "@ant-design/x-markdown/themes/light.css";
import { cn } from "./classnames";
import { EmptyState } from "./empty-state";
import { formatTime } from "./format";
import { shouldRenderMarkdown } from "./message-rendering";
import type { ChatMessage, Conversation } from "./types";

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
      className={cn(
        "rounded-[12px] px-3.5 py-2.5 max-md:rounded-xl max-md:px-3 max-md:py-2.5",
        isUser
          ? "ml-auto max-w-[min(640px,90%)] border border-[color-mix(in_oklch,var(--accent)_20%,var(--border))] bg-[var(--accent-subtle)] max-md:max-w-[94%]"
          : "border border-[var(--border)] bg-[var(--surface)]",
        !isUser &&
          message.status === "error" &&
          "border-[color-mix(in_oklch,var(--danger)_40%,var(--border))]",
      )}
      data-status={message.status}
    >
      <div className="mb-2 flex justify-between gap-4 text-xs text-[var(--muted)]">
        <span>{isUser ? "你" : "Mira Agent"}</span>
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
          <p className="whitespace-pre-wrap text-[13px] leading-6">
            {message.content}
          </p>
        )
      ) : null}
      {!message.content && fallback ? (
        <p className="text-[13px] leading-6 text-[var(--muted-strong)]">
          {fallback}
        </p>
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
    <div className="mx-auto flex w-full max-w-[820px] flex-1 flex-col gap-2.5 p-5 max-md:gap-2.5 max-md:p-3.5">
      {conversation.messages.map((message) => (
        <MessageBlock key={message.id} message={message} />
      ))}
    </div>
  );
}
