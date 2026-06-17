import { AgentEventRow } from "./agent-event-row";
import { cn } from "./classnames";
import type { Conversation } from "./types";

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
    <aside className="hidden h-full w-[318px] shrink-0 border-l border-[var(--border)] bg-[var(--surface)] xl:flex xl:flex-col">
      <div className="flex h-[var(--workspace-header-height)] items-center justify-between gap-3 overflow-hidden border-b border-[var(--border)] px-4 py-2.5">
        <div>
          <h2 className="m-0 text-sm leading-[1.35] font-bold">运行状态</h2>
          <p className="mt-0.5 mb-0 max-w-44 overflow-hidden text-xs leading-[1.35] text-ellipsis whitespace-nowrap text-[var(--muted)]">
            查看最近的工具调用、重试和停止原因。
          </p>
        </div>
        <span
          className={cn(
            "inline-flex min-h-[26px] shrink-0 items-center gap-1.5 self-start rounded-full border border-[var(--border)] bg-[var(--surface-muted)] px-[9px] text-xs text-[var(--muted-strong)]",
            status === "streaming" &&
              "border-[color-mix(in_oklch,var(--accent)_35%,var(--border))] bg-[var(--accent-soft)] text-[var(--accent-strong)]",
            status === "error" &&
              "border-[color-mix(in_oklch,var(--danger)_35%,var(--border))] bg-[var(--danger-soft)] text-[var(--danger)]",
            status === "complete" &&
              "border-[color-mix(in_oklch,var(--success)_32%,var(--border))] bg-[var(--success-soft)] text-[var(--success)]",
          )}
          data-status={status}
        >
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-current"
          />
          {statusLabel}
        </span>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {events.length === 0 ? (
          <div className="rounded-[10px] border border-dashed border-[var(--border)] p-3.5 text-[13px] leading-[1.7] text-[var(--muted)]">
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
