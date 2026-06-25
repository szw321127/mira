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

export type ChatEvent = AgentStreamEvent & {
  eventId: string;
  createdAt: string;
};

export type ChatImageAttachment = {
  id: string;
  type: "image";
  name: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  dataUrl: string;
  sizeBytes: number;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: ChatImageAttachment[];
  createdAt: string;
  status?: "streaming" | "complete" | "error" | "stopped";
  events: ChatEvent[];
};

export type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

export type WorkspaceState = {
  activeConversationId: string;
  conversations: Conversation[];
};

export type SendState = "idle" | "streaming" | "error";

export type AgentChatRequest = {
  conversationId: string;
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    attachments?: ChatImageAttachment[];
  }>;
};

export type AgentChatError = {
  message: string;
};
