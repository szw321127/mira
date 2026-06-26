import type { AgentStreamEvent, ChatEvent, ChatMessage } from "./types";

export type ChatEventMetadata = Pick<ChatEvent, "eventId" | "createdAt">;

export function appendAgentEvent(
  message: ChatMessage,
  event: AgentStreamEvent,
  metadata: ChatEventMetadata,
): ChatMessage {
  const chatEvent: ChatEvent = {
    ...event,
    ...metadata,
  };

  if (event.type === "text-delta") {
    return {
      ...message,
      content: `${message.content}${event.text}`,
      events: [...message.events, chatEvent],
    };
  }

  if (event.type === "stop") {
    return {
      ...message,
      status: event.reason === "done" ? "complete" : "stopped",
      events: [...message.events, chatEvent],
    };
  }

  if (event.type === "error") {
    return {
      ...message,
      status: "error",
      events: [...message.events, chatEvent],
    };
  }

  return {
    ...message,
    events: [...message.events, chatEvent],
  };
}

export function finalizeStreamingAssistantMessage(
  message: ChatMessage,
  metadata: ChatEventMetadata,
): ChatMessage {
  if (message.role !== "assistant" || message.status !== "streaming") {
    return message;
  }

  return appendAgentEvent(message, { type: "stop", reason: "done" }, metadata);
}
