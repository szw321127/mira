import type { AgentStreamEvent } from "./types";

export function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function previewValue(value: unknown, maxLength = 180) {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  if (!raw) return "";
  return raw.length > maxLength ? `${raw.slice(0, maxLength)}...` : raw;
}

export function encodeStreamEvent(event: AgentStreamEvent) {
  return `${JSON.stringify(event)}\n`;
}

export function parseStreamLines(buffer: string) {
  const lines = buffer.split("\n");

  return {
    complete: lines.slice(0, -1).filter(Boolean),
    rest: lines.at(-1) ?? "",
  };
}

export function parseAgentStreamEvent(line: string): AgentStreamEvent {
  const value: unknown = JSON.parse(line);

  if (!isAgentStreamEvent(value)) {
    return { type: "error", message: "Received an unknown agent event." };
  }

  return value;
}

export function isAgentStreamEvent(value: unknown): value is AgentStreamEvent {
  if (!value || typeof value !== "object" || !("type" in value)) return false;

  const event = value as Record<string, unknown>;

  switch (event.type) {
    case "text-delta":
      return typeof event.text === "string";
    case "tool-call":
      return (
        typeof event.id === "string" &&
        typeof event.toolName === "string" &&
        typeof event.inputPreview === "string"
      );
    case "tool-result":
      return (
        typeof event.id === "string" &&
        typeof event.toolName === "string" &&
        typeof event.outputPreview === "string"
      );
    case "retry":
      return (
        typeof event.attempt === "number" &&
        typeof event.maxRetries === "number" &&
        typeof event.delayMs === "number" &&
        typeof event.error === "string"
      );
    case "detection":
      return (
        (event.level === "warning" || event.level === "critical") &&
        typeof event.message === "string"
      );
    case "token-cost":
      return typeof event.detail === "string" && typeof event.cost === "string";
    case "token-usage":
      return (
        typeof event.totalTokens === "number" &&
        typeof event.tokenBudget === "number" &&
        typeof event.percent === "string"
      );
    case "stop":
      return typeof event.reason === "string";
    case "error":
      return typeof event.message === "string";
    default:
      return false;
  }
}
