"use client";

import { useState } from "react";
import { ChevronDown, RotateCcw, Trash2, XCircle } from "lucide-react";
import type { ImageTask } from "../types";

export function TaskInspector({
  onCancelTask,
  onDeleteTask,
  onRetryTask,
  tasks,
}: {
  onCancelTask: (taskId: string) => Promise<void> | void;
  onDeleteTask: (taskId: string) => Promise<void> | void;
  onRetryTask: (taskId: string) => Promise<void> | void;
  tasks: ImageTask[];
}) {
  const [expanded, setExpanded] = useState(false);
  const latestTask = tasks[0] ?? null;
  const runningCount = tasks.filter(
    (task) => task.status === "queued" || task.status === "running",
  ).length;
  const failedCount = tasks.filter((task) => task.status === "failed").length;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <button
        aria-controls="image-task-history"
        aria-expanded={expanded}
        className="mb-2 flex w-full items-center justify-between gap-3 rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-left transition-colors hover:bg-[var(--surface-muted)]"
        onClick={() => setExpanded((value) => !value)}
        type="button"
      >
        <span className="min-w-0">
          <span className="block text-sm font-[700]">任务</span>
          <span className="mt-0.5 block truncate text-xs text-[var(--muted-strong)]">
            {latestTask
              ? `${taskTypeLabel(latestTask.type)} · ${taskStatusLabel(latestTask.status)}`
              : "暂无任务"}
          </span>
        </span>
        <span className="flex shrink-0 flex-wrap items-center justify-end gap-2 text-xs text-[var(--muted-strong)]">
          {runningCount ? (
            <span className="rounded-full bg-[var(--accent-subtle)] px-2 py-1 text-[var(--accent-strong)]">
              {runningCount} 进行中
            </span>
          ) : null}
          {failedCount ? (
            <span className="rounded-full bg-[var(--danger-soft)] px-2 py-1 text-[var(--danger)]">
              {failedCount} 失败
            </span>
          ) : null}
          <ChevronDown
            aria-hidden="true"
            className={`transition-transform ${expanded ? "rotate-180" : ""}`}
            size={16}
          />
        </span>
      </button>
      {tasks.length ? (
        <div
          className={`space-y-2 ${expanded ? "" : "hidden"}`}
          id="image-task-history"
        >
          {tasks.map((task) => {
            const canCancel =
              task.status === "queued" || task.status === "running";
            const canRetry = task.status === "failed";

            return (
              <TaskCard
                key={task.id}
                canCancel={canCancel}
                canRetry={canRetry}
                onCancelTask={onCancelTask}
                onDeleteTask={onDeleteTask}
                onRetryTask={onRetryTask}
                task={task}
              />
            );
          })}
        </div>
      ) : (
        <div
          className={`rounded-[8px] border border-dashed border-[var(--border-strong)] bg-[var(--surface-raised)] p-3 text-xs leading-relaxed text-[var(--muted-strong)] ${
            expanded ? "" : "hidden"
          }`}
          id="image-task-history"
        >
          暂无任务。输入提示词后，Mira 会先创建可追踪任务，后续接入图像生成。
        </div>
      )}
    </div>
  );
}

function TaskCard({
  canCancel,
  canRetry,
  onCancelTask,
  onDeleteTask,
  onRetryTask,
  task,
}: {
  canCancel: boolean;
  canRetry: boolean;
  onCancelTask: (taskId: string) => Promise<void> | void;
  onDeleteTask: (taskId: string) => Promise<void> | void;
  onRetryTask: (taskId: string) => Promise<void> | void;
  task: ImageTask;
}) {
  return (
    <div className="rounded-[8px] border border-[var(--border)] bg-[var(--surface-raised)] p-3">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm font-[650]">
        <span className="min-w-0 truncate">{taskTypeLabel(task.type)}</span>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-[var(--accent-subtle)] px-2 py-1 text-xs text-[var(--accent-strong)]">
            {taskStatusLabel(task.status)}
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
          <button
            aria-label="删除任务"
            className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] transition-colors hover:border-[var(--danger)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]"
            onClick={() => onDeleteTask(task.id)}
            title="删除任务"
            type="button"
          >
            <Trash2 aria-hidden="true" size={14} />
          </button>
        </div>
      </div>
      <div className="mt-2 line-clamp-3 text-xs leading-relaxed text-[var(--muted-strong)]">
        {typeof task.input.prompt === "string" ? task.input.prompt : "图像任务"}
      </div>
      {task.error ? (
        <div className="mt-2 rounded-[8px] border border-[var(--danger)] bg-[var(--danger-soft)] px-2 py-1.5 text-xs leading-relaxed text-[var(--danger)]">
          {task.error}
        </div>
      ) : null}
    </div>
  );
}

function taskTypeLabel(type: ImageTask["type"]): string {
  const labels = {
    generate: "生成图像",
    edit: "编辑图像",
    variation: "生成变体",
    upscale: "放大图像",
    background_removal: "移除背景",
    expand: "扩展图片",
  } satisfies Record<ImageTask["type"], string>;
  return labels[type];
}

function taskStatusLabel(status: ImageTask["status"]): string {
  const labels = {
    queued: "排队中",
    running: "进行中",
    complete: "已完成",
    failed: "失败",
    canceled: "已取消",
  } satisfies Record<ImageTask["status"], string>;
  return labels[status];
}
