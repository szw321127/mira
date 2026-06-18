import { normalizeAgentEvent, previewValue } from "./agent-event-normalizer.js";

describe("normalizeAgentEvent", () => {
  it("normalizes tool calls without exposing raw object payloads", () => {
    expect(
      normalizeAgentEvent(
        {
          type: "tool-call",
          toolName: "web_search",
          input: { query: "mira", extra: "x".repeat(220) }
        },
        3
      )
    ).toEqual({
      type: "tool-call",
      id: "tool-3",
      toolName: "web_search",
      inputPreview: previewValue({ query: "mira", extra: "x".repeat(220) })
    });
  });

  it("keeps text deltas compact", () => {
    expect(normalizeAgentEvent({ type: "text-delta", text: "hello" }, 0)).toEqual({
      type: "text-delta",
      text: "hello"
    });
  });
});
