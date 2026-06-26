"use client";

import { cn } from "./classnames";
import { EmptyState } from "./empty-state";
import { formatTime } from "./format";
import { MarkdownRenderer } from "./markdown-renderer";
import { shouldRenderMarkdown } from "./message-rendering";
import type { ChatGeneratedImage, ChatMessage, Conversation } from "./types";

function getLatestErrorDetail(message: ChatMessage) {
  const errorEvent = [...message.events].reverse().find((event) => {
    return event.type === "error";
  });

  return errorEvent?.message.trim() ?? "";
}

function generatedImageSource(image: ChatGeneratedImage) {
  if (!image.imageBase64) return "";
  return `data:${image.mimeType};base64,${image.imageBase64}`;
}

function imageProgressLabel(image: ChatGeneratedImage) {
  if (image.status === "complete") return "完成";
  if (image.partialIndex > 0) return `预览 ${image.partialIndex}`;
  if (image.progressStage === "queued") return "已提交";
  if (image.progressStage === "finalizing") return "整理中";
  return "生成中";
}

function imageProgressWidth(progressStage: ChatGeneratedImage["progressStage"]) {
  if (progressStage === "finalizing") return "w-[82%]";
  if (progressStage === "generating") return "w-[56%]";
  return "w-[28%]";
}

function GeneratedImageCard({ image }: { image: ChatGeneratedImage }) {
  const src = generatedImageSource(image);
  const isComplete = image.status === "complete";
  const progressStage = image.progressStage ?? "queued";
  const progressMessage =
    image.progressMessage ??
    (image.partialIndex > 0 ? `正在生成预览 ${image.partialIndex}` : "模型正在生成图像");

  return (
    <figure className="mt-2 overflow-hidden rounded-[10px] border border-[var(--border)] bg-[var(--surface-raised)]">
      <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-3 py-2">
        <figcaption className="min-w-0 truncate text-[13px] font-[650]">
          {isComplete ? "图片已生成" : "正在生成图片"}
        </figcaption>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-[var(--muted-strong)]">
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              isComplete ? "bg-[var(--success)]" : "bg-[var(--accent)]",
            )}
          />
          {imageProgressLabel(image)}
        </span>
      </div>
      <div className="bg-[var(--surface-muted)] p-2">
        {src ? (
          <img
            alt={image.prompt || "Mira 生成的图片"}
            className={cn(
              "max-h-[420px] w-full rounded-[8px] object-contain transition-opacity duration-200",
              isComplete ? "opacity-100" : "opacity-90",
            )}
            src={src}
          />
        ) : (
          <div className="flex aspect-[4/3] flex-col items-center justify-center gap-3 rounded-[8px] border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-4 text-center text-[13px] text-[var(--muted-strong)]">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--accent)]" />
            <div className="space-y-1">
              <p className="font-[650] text-[var(--text)]">正在生成图片</p>
              <p>{progressMessage}</p>
            </div>
            <div className="h-1 w-full max-w-[180px] overflow-hidden rounded-full bg-[var(--border)]">
              <div
                className={cn(
                  "h-full rounded-full bg-[var(--accent)] transition-all duration-500",
                  imageProgressWidth(progressStage),
                )}
              />
            </div>
          </div>
        )}
      </div>
      <div className="line-clamp-2 px-3 py-2 text-xs leading-5 text-[var(--muted-strong)]">
        {image.prompt}
      </div>
    </figure>
  );
}

function MessageBlock({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const renderMarkdown = shouldRenderMarkdown(message.role);
  const latestErrorDetail = getLatestErrorDetail(message);
  const hasGeneratedImages = (message.generatedImages?.length ?? 0) > 0;
  const fallback =
    message.status === "streaming" && !hasGeneratedImages
      ? "正在组织回答..."
      : message.status === "error"
        ? "运行失败"
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
      {message.attachments?.length ? (
        <div className="mb-2 flex flex-wrap gap-2">
          {message.attachments.map((attachment) => (
            <div
              className="h-24 w-24 overflow-hidden rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)]"
              key={attachment.id}
            >
              <img
                alt={attachment.name || "上传图片"}
                className="h-full w-full object-cover"
                src={attachment.dataUrl}
              />
            </div>
          ))}
        </div>
      ) : null}
      {message.content ? (
        renderMarkdown ? (
          <MarkdownRenderer content={message.content} />
        ) : (
          <p className="whitespace-pre-wrap text-[13px] leading-6">
            {message.content}
          </p>
        )
      ) : null}
      {hasGeneratedImages ? (
        <div className="space-y-2">
          {message.generatedImages?.map((image) => (
            <GeneratedImageCard image={image} key={image.id} />
          ))}
        </div>
      ) : null}
      {!message.content && fallback ? (
        <p className="text-[13px] leading-6 text-[var(--muted-strong)]">
          {fallback}
        </p>
      ) : null}
      {message.status === "error" && latestErrorDetail ? (
        <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-6 text-[var(--danger)]">
          {latestErrorDetail}
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
