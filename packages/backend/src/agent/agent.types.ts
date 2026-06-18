export type AgentChatMessage = {
  role: "user" | "assistant";
  content: string;
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

    return (
      (record.role === "user" || record.role === "assistant") &&
      typeof record.content === "string"
    );
  });

  if (!validMessages) return null;

  return {
    conversationId: request.conversationId,
    messages: request.messages as AgentChatMessage[]
  };
}
