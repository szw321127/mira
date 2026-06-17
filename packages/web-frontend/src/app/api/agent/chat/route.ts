import { createOpenAI } from "@ai-sdk/openai";
import {
  agentLoop,
  globTool,
  grepTool,
  listDirectoryTool,
  readFileTool,
  ToolRegistry,
  type AgentLoopEvent,
} from "@rednote/agent";
import type { ModelMessage } from "ai";
import {
  encodeStreamEvent,
  previewValue,
} from "@/app/agent-workspace/streaming";
import type {
  AgentChatRequest,
  AgentStreamEvent,
} from "@/app/agent-workspace/types";

export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return Response.json({ message }, { status });
}

function parseRequest(value: unknown): AgentChatRequest | null {
  if (!value || typeof value !== "object") return null;

  const request = value as Record<string, unknown>;
  if (typeof request.conversationId !== "string") return null;
  if (!Array.isArray(request.messages)) return null;

  const validMessages = request.messages.every((message) => {
    if (!message || typeof message !== "object") return false;
    const record = message as Record<string, unknown>;

    return (
      (record.role === "user" || record.role === "assistant") &&
      typeof record.content === "string"
    );
  });

  if (!validMessages) return null;

  return {
    conversationId: request.conversationId,
    messages: request.messages as AgentChatRequest["messages"],
  };
}

function getModel() {
  const baseURL = process.env.AGENT_MODEL_BASE_URL;
  const apiKey = process.env.AGENT_MODEL_API_KEY;
  const modelName = process.env.AGENT_MODEL_NAME;

  if (!baseURL || !apiKey || !modelName) {
    throw new Error(
      "Missing AGENT_MODEL_BASE_URL, AGENT_MODEL_API_KEY, or AGENT_MODEL_NAME.",
    );
  }

  return createOpenAI({ baseURL, apiKey }).chat(modelName);
}

function normalizeAgentEvent(
  event: AgentLoopEvent,
  index: number,
): AgentStreamEvent {
  switch (event.type) {
    case "text-delta":
      return { type: "text-delta", text: event.text };
    case "tool-call":
      return {
        type: "tool-call",
        id: `tool-${index}`,
        toolName: event.toolName,
        inputPreview: previewValue(event.input),
      };
    case "tool-result":
      return {
        type: "tool-result",
        id: `tool-${index}`,
        toolName: event.toolName,
        outputPreview: event.preview,
      };
    case "retry":
      return {
        type: "retry",
        attempt: event.attempt,
        maxRetries: event.maxRetries,
        delayMs: event.delayMs,
        error: event.error,
      };
    case "detection":
      return {
        type: "detection",
        level: event.level,
        message: event.message,
      };
    case "token-cost":
      return {
        type: "token-cost",
        detail: event.detail,
        cost: event.cost,
      };
    case "token-usage":
      return {
        type: "token-usage",
        totalTokens: event.totalTokens,
        tokenBudget: event.tokenBudget,
        percent: event.percent,
      };
    case "stop":
      return {
        type: "stop",
        reason: event.reason,
        message: event.message,
      };
  }
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = parseRequest(body);

  if (!parsed) {
    return jsonError("Invalid agent chat request.");
  }

  const lastUserMessage = [...parsed.messages].reverse().find((message) => {
    return message.role === "user" && message.content.trim();
  });

  if (!lastUserMessage) {
    return jsonError("Message is required.");
  }

  let model: ReturnType<ReturnType<typeof createOpenAI>["chat"]>;

  try {
    model = getModel();
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 503);
  }

  const encoder = new TextEncoder();
  const registry = new ToolRegistry();
  registry.register(readFileTool, listDirectoryTool, globTool, grepTool);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let eventIndex = 0;

      try {
        const loop = agentLoop({
          model,
          registry,
          messages: parsed.messages as ModelMessage[],
          system:
            "你是 RedNote agent，帮助小红书创作者研究选题、拆解大纲、起草内容。回答要具体、可执行，并在需要时使用可用工具读取项目上下文。",
          maxSteps: Number(process.env.AGENT_MAX_STEPS ?? 8),
        });

        for await (const event of loop) {
          const normalized = normalizeAgentEvent(event, eventIndex);
          eventIndex += 1;
          controller.enqueue(encoder.encode(encodeStreamEvent(normalized)));
        }
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            encodeStreamEvent({
              type: "error",
              message: error instanceof Error ? error.message : String(error),
            }),
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "application/x-ndjson; charset=utf-8",
    },
  });
}
