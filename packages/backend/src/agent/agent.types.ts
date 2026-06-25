export type AgentChatMessage = {
  role: "user" | "assistant";
  content: string;
  attachments?: AgentChatImageAttachment[];
};

export type AgentChatImageAttachment = {
  id: string;
  type: "image";
  name: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  dataUrl: string;
  sizeBytes: number;
};

export type AgentChatRequest = {
  conversationId: string;
  messages: AgentChatMessage[];
};

export type AgentStreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; id: string; toolName: string; inputPreview: string }
  | { type: "tool-result"; id: string; toolName: string; outputPreview: string }
  | {
      type: "retry";
      attempt: number;
      maxRetries: number;
      delayMs: number;
      error: string;
    }
  | { type: "detection"; level: "warning" | "critical"; message: string }
  | { type: "token-cost"; detail: string; cost: string }
  | {
      type: "token-usage";
      totalTokens: number;
      tokenBudget: number;
      percent: string;
    }
  | { type: "stop"; reason: string; message?: string }
  | { type: "error"; message: string };

export function parseAgentChatRequest(value: unknown): AgentChatRequest | null {
  if (!value || typeof value !== "object") return null;

  const request = value as Record<string, unknown>;
  if (typeof request.conversationId !== "string") return null;
  if (!Array.isArray(request.messages)) return null;

  const validMessages = request.messages.every((message) => {
    if (!message || typeof message !== "object") return false;
    const record = message as Record<string, unknown>;

    if (
      (record.role !== "user" && record.role !== "assistant") ||
      typeof record.content !== "string"
    ) {
      return false;
    }

    if (record.attachments === undefined) return true;
    if (!Array.isArray(record.attachments)) return false;
    return record.attachments.every(isAgentChatImageAttachment);
  });

  if (!validMessages) return null;

  return {
    conversationId: request.conversationId,
    messages: request.messages as AgentChatMessage[]
  };
}

function isAgentChatImageAttachment(
  value: unknown
): value is AgentChatImageAttachment {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    record.type === "image" &&
    typeof record.name === "string" &&
    isSupportedImageMimeType(record.mimeType) &&
    typeof record.dataUrl === "string" &&
    record.dataUrl.startsWith(`data:${record.mimeType};base64,`) &&
    typeof record.sizeBytes === "number" &&
    Number.isFinite(record.sizeBytes) &&
    record.sizeBytes >= 0
  );
}

function isSupportedImageMimeType(
  value: unknown
): value is AgentChatImageAttachment["mimeType"] {
  return (
    value === "image/png" ||
    value === "image/jpeg" ||
    value === "image/webp"
  );
}
