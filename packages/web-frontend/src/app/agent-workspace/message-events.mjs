export function appendAgentEvent(message, event, metadata) {
  const chatEvent = {
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

export function finalizeStreamingAssistantMessage(message, metadata) {
  if (message.role !== "assistant" || message.status !== "streaming") {
    return message;
  }

  return appendAgentEvent(message, { type: "stop", reason: "done" }, metadata);
}
