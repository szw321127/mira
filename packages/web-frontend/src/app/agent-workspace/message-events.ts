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
        progressStage: "queued",
        progressMessage: "准备生成图像",
        updatedAt: metadata.createdAt,
      }),
      events: [...message.events, chatEvent],
    };
  }

  if (event.type === "image-generation-progress") {
    const current = findGeneratedImage(message, event.id);
    return {
      ...message,
      generatedImages: upsertGeneratedImage(message.generatedImages ?? [], {
        id: event.id,
        prompt: current?.prompt ?? "生成图片",
        status: "running",
        imageBase64: current?.imageBase64 ?? null,
        mimeType: current?.mimeType ?? "image/png",
        partialIndex: current?.partialIndex ?? 0,
        progressStage: event.stage,
        progressMessage: event.message,
        updatedAt: metadata.createdAt,
      }),
      events: [...message.events, chatEvent],
    };
  }

  if (event.type === "image-generation-partial") {
    const current = findGeneratedImage(message, event.id);
    return {
      ...message,
      generatedImages: upsertGeneratedImage(message.generatedImages ?? [], {
        id: event.id,
        prompt: current?.prompt ?? "生成图片",
        status: "running",
        imageBase64: event.imageBase64,
        mimeType: event.mimeType,
        partialIndex: event.index,
        progressStage: "generating",
        progressMessage: `正在生成预览 ${event.index}`,
        updatedAt: metadata.createdAt,
      }),
      events: [...message.events, chatEvent],
    };
  }

  if (event.type === "image-generation-complete") {
    const current = findGeneratedImage(message, event.id);
    return {
      ...message,
      generatedImages: upsertGeneratedImage(message.generatedImages ?? [], {
        id: event.id,
        prompt: current?.prompt ?? "生成图片",
        status: "complete",
        imageBase64: event.imageBase64,
        mimeType: event.mimeType,
        partialIndex: current?.partialIndex ?? 0,
        progressStage: "finalizing",
        progressMessage: "图像已生成",
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

function findGeneratedImage(message: ChatMessage, id: string) {
  return message.generatedImages?.find((image) => image.id === id);
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
