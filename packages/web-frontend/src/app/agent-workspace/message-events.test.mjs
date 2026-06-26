import assert from "node:assert/strict";
import test from "node:test";

import {
  appendAgentEvent,
  finalizeStreamingAssistantMessage,
} from "./message-events.mjs";

const metadata = {
  eventId: "event-1",
  createdAt: "2026-06-26T00:00:00.000Z",
};

function createAssistantMessage(overrides = {}) {
  return {
    id: "message-1",
    role: "assistant",
    content: "半截内容",
    createdAt: "2026-06-26T00:00:00.000Z",
    status: "streaming",
    events: [],
    ...overrides,
  };
}

test("finalizes a streaming assistant message when the stream closes without stop", () => {
  const message = createAssistantMessage();

  const next = finalizeStreamingAssistantMessage(message, metadata);

  assert.equal(next.status, "complete");
  assert.deepEqual(next.events.at(-1), {
    type: "stop",
    reason: "done",
    eventId: metadata.eventId,
    createdAt: metadata.createdAt,
  });
});

test("does not add a duplicate stop event to a non-streaming assistant message", () => {
  const message = createAssistantMessage({
    status: "complete",
    events: [
      {
        type: "stop",
        reason: "done",
        eventId: "event-existing",
        createdAt: "2026-06-26T00:00:00.000Z",
      },
    ],
  });

  const next = finalizeStreamingAssistantMessage(message, metadata);

  assert.equal(next, message);
});

test("appends text deltas and stop events with stable chat event metadata", () => {
  const withText = appendAgentEvent(
    createAssistantMessage({ content: "" }),
    { type: "text-delta", text: "hello" },
    metadata,
  );

  assert.equal(withText.content, "hello");
  assert.deepEqual(withText.events.at(-1), {
    type: "text-delta",
    text: "hello",
    eventId: metadata.eventId,
    createdAt: metadata.createdAt,
  });

  const stopped = appendAgentEvent(
    withText,
    { type: "stop", reason: "done" },
    { ...metadata, eventId: "event-2" },
  );

  assert.equal(stopped.status, "complete");
});
