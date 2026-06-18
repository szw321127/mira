export function createId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function previewValue(value, maxLength = 180) {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  if (!raw) return "";
  return raw.length > maxLength ? `${raw.slice(0, maxLength)}...` : raw;
}

export function encodeStreamEvent(event) {
  return `${JSON.stringify(event)}\n`;
}

export function parseStreamLines(buffer) {
  const lines = buffer.split("\n");

  return {
    complete: lines.slice(0, -1).filter(Boolean),
    rest: lines.at(-1) ?? "",
  };
}

export function parseAgentStreamEvent(line) {
  const value = JSON.parse(line);

  if (!isAgentStreamEvent(value)) {
    return { type: "error", message: "Received an unknown agent event." };
  }

  return value;
}

export function isAgentStreamEvent(value) {
  if (!value || typeof value !== "object" || !("type" in value)) return false;

  switch (value.type) {
    case "text-delta":
      return typeof value.text === "string";
    case "tool-call":
      return (
        typeof value.id === "string" &&
        typeof value.toolName === "string" &&
        typeof value.inputPreview === "string"
      );
    case "tool-result":
      return (
        typeof value.id === "string" &&
        typeof value.toolName === "string" &&
        typeof value.outputPreview === "string"
      );
    case "retry":
      return (
        typeof value.attempt === "number" &&
        typeof value.maxRetries === "number" &&
        typeof value.delayMs === "number" &&
        typeof value.error === "string"
      );
    case "detection":
      return (
        (value.level === "warning" || value.level === "critical") &&
        typeof value.message === "string"
      );
    case "token-cost":
      return typeof value.detail === "string" && typeof value.cost === "string";
    case "token-usage":
      return (
        typeof value.totalTokens === "number" &&
        typeof value.tokenBudget === "number" &&
        typeof value.percent === "string"
      );
    case "stop":
      return typeof value.reason === "string";
    case "error":
      return typeof value.message === "string";
    default:
      return false;
  }
}
