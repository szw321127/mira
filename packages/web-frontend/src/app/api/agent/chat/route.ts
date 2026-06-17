import { createOpenAI } from "@ai-sdk/openai";
import {
  agentLoop,
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

const PROJECT_CONTEXT = {
  product: "RedNote 是一个面向小红书内容创作者的编辑工作台。",
  audience:
    "用户通常有一个主题或一句模糊灵感，需要快速比较表达方向、编辑大纲，并继续生成可发布草稿。",
  workflow: [
    "先把灵感拆成 3 个有差异的内容方向。",
    "让用户选择、编辑或换一批方向。",
    "继续生成标题、正文结构、封面提示和标签。",
  ],
  designPrinciples: [
    "界面像内容编辑工位，不像营销页或通用聊天框。",
    "让选择、编辑权和内容判断可见。",
    "Phase 1 保持 local-first，不接入后端持久化或鉴权。",
  ],
  currentWorkspace:
    "当前 Web MVP 提供左侧对话栏、中间线程、底部输入区和右侧 agent 活动面板。浏览器保存本地对话；Next.js 路由在服务端运行 agent 并流式返回事件。",
};

const projectContextTool = {
  name: "project_context",
  description:
    "返回 RedNote 产品、工作流、设计原则和当前 Web MVP 边界的安全上下文。需要理解 RedNote 目标或工作台约束时使用。",
  parameters: {
    type: "object",
    properties: {
      focus: {
        type: "string",
        enum: ["product", "workflow", "design", "workspace"],
        description: "可选：指定需要关注的上下文部分。",
      },
    },
    additionalProperties: false,
  },
  isConcurrencySafe: true,
  isReadOnly: true,
  maxResultChars: 1800,
  execute: async ({ focus }: { focus?: string }) => {
    if (focus === "product") return PROJECT_CONTEXT.product;
    if (focus === "workflow") return PROJECT_CONTEXT.workflow;
    if (focus === "design") return PROJECT_CONTEXT.designPrinciples;
    if (focus === "workspace") return PROJECT_CONTEXT.currentWorkspace;
    return PROJECT_CONTEXT;
  },
};

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
  registry.register(projectContextTool);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let eventIndex = 0;

      try {
        const loop = agentLoop({
          model,
          registry,
          messages: parsed.messages as ModelMessage[],
          system:
            "你是 RedNote agent，帮助小红书创作者研究选题、拆解大纲、起草内容。回答要具体、可执行。需要了解 RedNote 产品、工作流或当前 Web MVP 边界时，使用 project_context 获取安全上下文；不要尝试读取文件系统。",
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
