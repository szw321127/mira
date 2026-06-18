import { createOpenAI } from "@ai-sdk/openai";
import {
  createGPTAgentHarness,
  pickSearchTool,
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

const MODEL_SETUP_MESSAGE =
  "需要配置模型后才能运行 agent。请在 packages/web-frontend/.env.local 设置 AGENT_MODEL_BASE_URL、AGENT_MODEL_API_KEY 和 AGENT_MODEL_NAME；这些值只在服务端使用，不要加 NEXT_PUBLIC_。";

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
    throw new Error(MODEL_SETUP_MESSAGE);
  }

  return createOpenAI({ baseURL, apiKey }).chat(modelName);
}

function getHistoryBeforeMessage(
  messages: AgentChatRequest["messages"],
  target: AgentChatRequest["messages"][number],
): ModelMessage[] {
  const index = messages.lastIndexOf(target);
  return messages.slice(0, index).map((message) => ({
    role: message.role,
    content: message.content,
  }));
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
  registry.register(pickSearchTool());

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let eventIndex = 0;

      try {
        const harness = createGPTAgentHarness({
          model,
          registry,
          messages: getHistoryBeforeMessage(parsed.messages, lastUserMessage),
          sessionId: parsed.conversationId,
          maxSteps: Number(process.env.AGENT_MAX_STEPS ?? 8),
        });

        for await (const event of harness.runEvents(lastUserMessage.content)) {
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
