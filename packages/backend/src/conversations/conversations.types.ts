export type ChatMessageRole = "user" | "assistant";
export type ChatMessageStatus = "complete" | "streaming" | "stopped" | "error";

export type PersistedChatMessage = {
  id?: string;
  role: ChatMessageRole;
  content: string;
  status?: ChatMessageStatus;
  events?: unknown[];
  createdAt?: string;
};

export function parseTitle(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;

  const title = (body as { title?: unknown }).title;
  if (typeof title !== "string") return null;

  const trimmed = title.trim();
  if (!trimmed || trimmed.length > 120) return null;

  return trimmed;
}

export function parseMessages(body: unknown): PersistedChatMessage[] | null {
  if (!body || typeof body !== "object") return null;

  const messages = (body as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return null;

  const parsed: PersistedChatMessage[] = [];

  for (const message of messages) {
    if (!message || typeof message !== "object") return null;
    const raw = message as Record<string, unknown>;

    if (!isMessageRole(raw.role) || typeof raw.content !== "string") {
      return null;
    }

    if (raw.status !== undefined && !isMessageStatus(raw.status)) {
      return null;
    }

    if (raw.id !== undefined && typeof raw.id !== "string") {
      return null;
    }

    if (raw.createdAt !== undefined && typeof raw.createdAt !== "string") {
      return null;
    }

    parsed.push({
      ...(typeof raw.id === "string" ? { id: raw.id } : {}),
      role: raw.role,
      content: raw.content,
      ...(isMessageStatus(raw.status) ? { status: raw.status } : {}),
      events: Array.isArray(raw.events) ? raw.events : [],
      ...(typeof raw.createdAt === "string" ? { createdAt: raw.createdAt } : {})
    });
  }

  return parsed;
}

function isMessageRole(value: unknown): value is ChatMessageRole {
  return value === "user" || value === "assistant";
}

function isMessageStatus(value: unknown): value is ChatMessageStatus {
  return (
    value === "complete" ||
    value === "streaming" ||
    value === "stopped" ||
    value === "error"
  );
}
