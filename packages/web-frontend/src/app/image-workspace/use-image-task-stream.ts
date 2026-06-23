"use client";

import { useEffect } from "react";
import { createImageTaskStreamUrl } from "./workspace-api";
import type { ImageTaskEvent } from "./types";

export type UseImageTaskStreamInput = {
  workspaceId: string | null;
  taskId: string | null;
  onEvent: (event: ImageTaskEvent) => void;
  onError: (message: string) => void;
};

const unsafeTaskMessagePattern = /tool_call|tool_result|b64_json|stack/i;

export function useImageTaskStream({
  workspaceId,
  taskId,
  onEvent,
  onError,
}: UseImageTaskStreamInput) {
  useEffect(() => {
    if (!workspaceId || !taskId) return;

    const activeTaskId = taskId;
    const activeWorkspaceId = workspaceId;
    const controller = new AbortController();

    async function connect() {
      try {
        const response = await fetch(createImageTaskStreamUrl(activeWorkspaceId, activeTaskId), {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("任务进度连接失败");
        }

        const body: ReadableStream<Uint8Array> | null = response.body;
        const reader = body?.getReader();
        if (!reader) {
          throw new Error("任务进度连接失败");
        }

        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parsed = parseStreamBuffer(buffer);
          buffer = parsed.rest;
          for (const line of parsed.lines) {
            const event = parseTaskEvent(line);
            if (event) onEvent(event);
          }
        }
      } catch (streamError) {
        if (controller.signal.aborted) return;
        onError(sanitizeTaskMessage(
          streamError instanceof Error ? streamError.message : "任务进度连接失败",
        ));
      }
    }

    void connect();
    return () => {
      controller.abort();
    };
  }, [onError, onEvent, taskId, workspaceId]);
}

function parseStreamBuffer(buffer: string) {
  const parts = buffer.split("\n");
  return {
    lines: parts.slice(0, -1).filter((line) => line.trim()),
    rest: parts.at(-1) ?? "",
  };
}

function parseTaskEvent(line: string): ImageTaskEvent | null {
  try {
    const value = JSON.parse(line) as unknown;
    if (!isRecord(value) || typeof value.type !== "string") return null;
    if (
      value.type === "task-created" &&
      typeof value.taskId === "string" &&
      typeof value.taskType === "string"
    ) {
      return {
        type: "task-created",
        taskId: value.taskId,
        taskType: normalizeTaskType(value.taskType),
      };
    }
    if (
      value.type === "task-progress" &&
      typeof value.taskId === "string" &&
      typeof value.status === "string" &&
      typeof value.message === "string"
    ) {
      return {
        type: "task-progress",
        taskId: value.taskId,
        status: normalizeTaskStatus(value.status),
        message: sanitizeTaskMessage(value.message),
      };
    }
    if (
      value.type === "asset-placeholder" &&
      typeof value.taskId === "string" &&
      typeof value.objectId === "string" &&
      typeof value.x === "number" &&
      typeof value.y === "number" &&
      Number.isFinite(value.x) &&
      Number.isFinite(value.y)
    ) {
      return {
        type: "asset-placeholder",
        taskId: value.taskId,
        objectId: value.objectId,
        x: value.x,
        y: value.y,
      };
    }
    if (
      value.type === "asset-created" &&
      typeof value.taskId === "string" &&
      typeof value.assetId === "string" &&
      typeof value.versionId === "string" &&
      typeof value.objectId === "string"
    ) {
      return {
        type: "asset-created",
        taskId: value.taskId,
        assetId: value.assetId,
        versionId: value.versionId,
        objectId: value.objectId,
      };
    }
    if (
      value.type === "asset-updated" &&
      typeof value.taskId === "string" &&
      typeof value.assetId === "string" &&
      typeof value.versionId === "string"
    ) {
      return {
        type: "asset-updated",
        taskId: value.taskId,
        assetId: value.assetId,
        versionId: value.versionId,
      };
    }
    if (
      value.type === "asset-version-created" &&
      typeof value.taskId === "string" &&
      typeof value.assetId === "string" &&
      typeof value.versionId === "string"
    ) {
      return {
        type: "asset-version-created",
        taskId: value.taskId,
        assetId: value.assetId,
        versionId: value.versionId,
      };
    }
    if (
      value.type === "canvas-updated" &&
      typeof value.workspaceId === "string" &&
      Array.isArray(value.objectIds) &&
      value.objectIds.every((objectId) => typeof objectId === "string")
    ) {
      return {
        type: "canvas-updated",
        workspaceId: value.workspaceId,
        objectIds: value.objectIds,
      };
    }
    if (
      value.type === "usage" &&
      typeof value.taskId === "string" &&
      typeof value.provider === "string"
    ) {
      return {
        type: "usage",
        taskId: value.taskId,
        provider: sanitizeTaskMessage(value.provider),
        ...(typeof value.cost === "string"
          ? { cost: sanitizeTaskMessage(value.cost) }
          : {}),
      };
    }
    if (
      value.type === "error" &&
      typeof value.taskId === "string" &&
      typeof value.message === "string"
    ) {
      return {
        type: "error",
        taskId: value.taskId,
        message: sanitizeTaskMessage(value.message),
      };
    }
    return null;
  } catch {
    return null;
  }
}

function normalizeTaskStatus(value: string): ImageTaskEvent & {
  type: "task-progress";
} extends { status: infer Status }
  ? Status
  : never {
  if (
    value === "queued" ||
    value === "running" ||
    value === "complete" ||
    value === "failed" ||
    value === "canceled"
  ) {
    return value;
  }
  return "running";
}

function normalizeTaskType(value: string): ImageTaskEvent & {
  type: "task-created";
} extends { taskType: infer TaskType }
  ? TaskType
  : never {
  if (
    value === "generate" ||
    value === "edit" ||
    value === "variation" ||
    value === "upscale" ||
    value === "background_removal"
  ) {
    return value;
  }
  return "generate";
}

function sanitizeTaskMessage(message: string) {
  if (unsafeTaskMessagePattern.test(message)) {
    return "图像任务运行失败，请稍后再试";
  }
  return message.slice(0, 160);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
