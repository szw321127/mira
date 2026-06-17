import type { Conversation, WorkspaceState } from "./types";

export function renameConversation(
  state: WorkspaceState,
  conversationId: string,
  title: string,
  updatedAt = new Date().toISOString(),
): WorkspaceState {
  const nextTitle = title.trim();
  if (!nextTitle) return state;

  let changed = false;
  const conversations = state.conversations.map((conversation) => {
    if (conversation.id !== conversationId) return conversation;
    if (conversation.title === nextTitle) return conversation;

    changed = true;
    return {
      ...conversation,
      title: nextTitle,
      updatedAt,
    };
  });

  return changed ? { ...state, conversations } : state;
}

export function deleteConversation(
  state: WorkspaceState,
  conversationId: string,
  createFallback: () => Conversation,
): WorkspaceState {
  const deleteIndex = state.conversations.findIndex((conversation) => {
    return conversation.id === conversationId;
  });
  if (deleteIndex === -1) return state;

  const conversations = state.conversations.filter((conversation) => {
    return conversation.id !== conversationId;
  });

  if (conversations.length === 0) {
    const fallback = createFallback();
    return {
      activeConversationId: fallback.id,
      conversations: [fallback],
    };
  }

  if (state.activeConversationId !== conversationId) {
    return {
      ...state,
      conversations,
    };
  }

  const nextActive =
    conversations[Math.min(deleteIndex, conversations.length - 1)] ??
    conversations[0];

  return {
    activeConversationId: nextActive.id,
    conversations,
  };
}
