import type { Conversation, WorkspaceState } from "./types";

export const STORAGE_KEY = "rednote.agent-workspace.v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isConversation(value: unknown): value is Conversation {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    Array.isArray(value.messages)
  );
}

export function createEmptyConversation(): Conversation {
  const createdAt = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    title: "新对话",
    createdAt,
    updatedAt: createdAt,
    messages: [],
  };
}

export function createInitialWorkspaceState(): WorkspaceState {
  const conversation = createEmptyConversation();

  return {
    activeConversationId: conversation.id,
    conversations: [conversation],
  };
}

export function loadWorkspaceState(): WorkspaceState | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    if (typeof parsed.activeConversationId !== "string") return null;
    if (!Array.isArray(parsed.conversations)) return null;
    if (!parsed.conversations.every(isConversation)) return null;

    return {
      activeConversationId: parsed.activeConversationId,
      conversations: parsed.conversations,
    };
  } catch {
    return null;
  }
}

export function saveWorkspaceState(state: WorkspaceState) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearWorkspaceState() {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(STORAGE_KEY);
}
