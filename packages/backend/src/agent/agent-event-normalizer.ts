import type { AgentLoopEvent } from "@rednote/agent";
import type { AgentStreamEvent } from "./agent.types.js";

export function previewValue(value: unknown, maxLength = 180) {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  if (!raw) return "";
  return raw.length > maxLength ? `${raw.slice(0, maxLength)}...` : raw;
}

export function encodeStreamEvent(event: AgentStreamEvent) {
  return `${JSON.stringify(event)}\n`;
}

export function normalizeAgentEvent(
  event: AgentLoopEvent,
  index: number
): AgentStreamEvent {
  switch (event.type) {
    case "text-delta":
      return { type: "text-delta", text: event.text };
    case "tool-call":
      return {
        type: "tool-call",
        id: `tool-${index}`,
        toolName: event.toolName,
        inputPreview: previewValue(event.input)
      };
    case "tool-result":
      return {
        type: "tool-result",
        id: `tool-${index}`,
        toolName: event.toolName,
        outputPreview: event.preview
      };
    case "retry":
      return {
        type: "retry",
        attempt: event.attempt,
        maxRetries: event.maxRetries,
        delayMs: event.delayMs,
        error: event.error
      };
    case "detection":
      return {
        type: "detection",
        level: event.level,
        message: event.message
      };
    case "token-cost":
      return {
        type: "token-cost",
        detail: event.detail,
        cost: event.cost
      };
    case "token-usage":
      return {
        type: "token-usage",
        totalTokens: event.totalTokens,
        tokenBudget: event.tokenBudget,
        percent: event.percent
      };
    case "stop":
      return {
        type: "stop",
        reason: event.reason,
        message: event.message
      };
    default:
      throw new Error(`Unsupported agent event: ${JSON.stringify(event)}`);
  }
}
