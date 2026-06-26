import type { AgentStreamEvent, ChatEvent, ChatMessage } from "./types";

export type ChatEventMetadata = Pick<ChatEvent, "eventId" | "createdAt">;

export function appendAgentEvent(
  message: ChatMessage,
  event: AgentStreamEvent,
  metadata: ChatEventMetadata,
): ChatMessage {
  const chatEvent = createPersistedChatEvent(event, metadata);

  if (event.type === "text-delta") {
    return {
      ...message,
      content: `${message.content}${event.text}`,
      events: [...message.events, chatEvent],
    };
  }

  if (event.type === "image-generation-start") {
    return {
      ...message,
      generatedImages: upsertGeneratedImage(message.generatedImages ?? [], {
        id: event.id,
        prompt: event.prompt,
        status: "running",
        imageBase64: null,
        mimeType: "image/png",
        partialIndex: 0,
        updatedAt: metadata.createdAt,
      }),
      events: [...message.events, chatEvent],
    };
  }

  if (event.type === "image-generation-partial") {
    return {
      ...message,
      generatedImages: upsertGeneratedImage(message.generatedImages ?? [], {
        id: event.id,
        prompt:
          message.generatedImages?.find((image) => image.id === event.id)
            ?.prompt ?? "生成图片",
        status: "running",
        imageBase64: event.imageBase64,
        mimeType: event.mimeType,
        partialIndex: event.index,
        updatedAt: metadata.createdAt,
      }),
      events: [...message.events, chatEvent],
    };
  }

  if (event.type === "image-generation-complete") {
    return {
      ...message,
      generatedImages: upsertGeneratedImage(message.generatedImages ?? [], {
        id: event.id,
        prompt:
          message.generatedImages?.find((image) => image.id === event.id)
            ?.prompt ?? "生成图片",
        status: "complete",
        imageBase64: event.imageBase64,
        mimeType: event.mimeType,
        partialIndex:
          message.generatedImages?.find((image) => image.id === event.id)
            ?.partialIndex ?? 0,
        updatedAt: metadata.createdAt,
      }),
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

function createPersistedChatEvent(
  event: AgentStreamEvent,
  metadata: ChatEventMetadata,
): ChatEvent {
  if (event.type === "image-generation-partial") {
    return {
      type: "image-generation-partial",
      id: event.id,
      imageBase64: "",
      mimeType: event.mimeType,
      index: event.index,
      ...metadata,
    };
  }

  if (event.type === "image-generation-complete") {
    return {
      type: "image-generation-complete",
      id: event.id,
      imageBase64: "",
      mimeType: event.mimeType,
      ...metadata,
    };
  }

  return {
    ...event,
    ...metadata,
  };
}

function upsertGeneratedImage(
  images: ChatMessage["generatedImages"],
  next: NonNullable<ChatMessage["generatedImages"]>[number],
) {
  const currentImages = images ?? [];
  const found = currentImages.some((image) => image.id === next.id);
  if (!found) return [...currentImages, next];

  return currentImages.map((image) => {
    return image.id === next.id ? { ...image, ...next } : image;
  });
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
