export const STORAGE_KEY = "rednote.agent-workspace.v1";

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isConversation(value) {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    Array.isArray(value.messages)
  );
}

export function createEmptyConversation() {
  const createdAt = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    title: "新对话",
    createdAt,
    updatedAt: createdAt,
    messages: [],
  };
}

export function createInitialWorkspaceState() {
  const conversation = createEmptyConversation();

  return {
    activeConversationId: conversation.id,
    conversations: [conversation],
  };
}

export function loadWorkspaceState() {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
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

export function saveWorkspaceState(state) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearWorkspaceState() {
  if (typeof window === "undefined") return;

  window.localStorage.removeItem(STORAGE_KEY);
}
