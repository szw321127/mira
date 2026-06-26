import {
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  Wrench,
} from "lucide-react";
import { cn } from "./classnames";
import { formatTime } from "./format";
import type { ChatEvent } from "./types";

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
    case "image-generation-start":
    case "image-generation-partial":
    case "image-generation-complete":
      return "";
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

export function AgentEventRow({ event }: { event: ChatEvent }) {
  if (event.type === "text-delta") return null;
  if (event.type.startsWith("image-generation-")) return null;

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
                  : "";

  return (
    <div
      className={cn(
        "flex items-start gap-[9px] rounded-[10px] border border-[var(--border)] bg-[var(--surface-muted)] px-2.5 py-[9px] text-[var(--muted-strong)]",
        event.type === "tool-result" &&
          "bg-[var(--success-soft)] text-[var(--success)]",
        (event.type === "error" || event.type === "detection") &&
          "bg-[var(--danger-soft)] text-[var(--danger)]",
      )}
      data-kind={event.type}
    >
      <span className="inline-flex pt-px text-current">
        <EventIcon event={event} />
      </span>
      <span className="min-w-0 w-full">
        <span className="flex items-center justify-between gap-2.5 text-xs leading-[1.45] font-[650] text-current">
          <span>{eventLabel(event)}</span>
          <time
            className="shrink-0 text-[11px] font-medium text-[var(--muted)]"
            dateTime={event.createdAt}
          >
            {formatTime(event.createdAt)}
          </time>
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
