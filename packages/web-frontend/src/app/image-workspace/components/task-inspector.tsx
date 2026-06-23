"use client";

import { RotateCcw, XCircle } from "lucide-react";
import type { ImageTask } from "../types";

export function TaskInspector({
  onCancelTask,
  onRetryTask,
  tasks,
}: {
  onCancelTask: (taskId: string) => Promise<void> | void;
  onRetryTask: (taskId: string) => Promise<void> | void;
  tasks: ImageTask[];
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="mb-2 text-sm font-[700]">任务</div>
      {tasks.length ? (
        <div className="space-y-2">
          {tasks.map((task) => {
            const canCancel =
              task.status === "queued" || task.status === "running";
            const canRetry = task.status === "failed";

            return (
              <div
                className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] p-3"
                key={task.id}
              >
                <div className="flex items-center justify-between gap-3 text-sm font-[650]">
                  <span className="min-w-0 truncate">{task.type}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="rounded-full bg-[var(--accent-subtle)] px-2 py-1 text-xs text-[var(--accent-strong)]">
                      {task.status}
                    </span>
                    {canCancel ? (
                      <button
                        aria-label="取消任务"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-[var(--border)] bg-[var(--danger-soft)] text-[var(--danger)] transition-colors hover:border-[var(--danger)] hover:bg-[var(--surface)]"
                        onClick={() => onCancelTask(task.id)}
                        title="取消任务"
                        type="button"
                      >
                        <XCircle aria-hidden="true" size={14} />
                      </button>
                    ) : null}
                    {canRetry ? (
                      <button
                        aria-label="重试任务"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[var(--accent-strong)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-subtle)]"
                        onClick={() => onRetryTask(task.id)}
                        title="重试任务"
                        type="button"
                      >
                        <RotateCcw aria-hidden="true" size={14} />
                      </button>
                    ) : null}
                  </div>
                </div>
                <div className="mt-2 line-clamp-3 text-xs leading-relaxed text-[var(--muted-strong)]">
                  {typeof task.input.prompt === "string" ? task.input.prompt : "图像任务"}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[8px] border border-dashed border-[var(--border-strong)] bg-[var(--surface-raised)] p-3 text-xs leading-relaxed text-[var(--muted-strong)]">
          暂无任务。输入提示词后，Mira 会先创建可追踪任务，后续接入图像生成。
        </div>
      )}
    </div>
  );
}
