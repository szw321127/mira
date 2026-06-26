import assert from "node:assert/strict";
import test from "node:test";

import {
  encodeStreamEvent,
  parseAgentStreamEvent,
  parseStreamLines,
  previewValue,
} from "./streaming.mjs";

test("parseStreamLines returns complete NDJSON lines and carries the partial rest", () => {
  const parsed = parseStreamLines('{"type":"text-delta","text":"你"}\n{"type"');

  assert.deepEqual(parsed.complete, ['{"type":"text-delta","text":"你"}']);
  assert.equal(parsed.rest, '{"type"');
});

test("parseAgentStreamEvent accepts known event shapes", () => {
  const event = parseAgentStreamEvent(
    '{"type":"tool-call","id":"tool-1","toolName":"read_file","inputPreview":"README.md"}',
  );

  assert.deepEqual(event, {
    type: "tool-call",
    id: "tool-1",
    toolName: "read_file",
    inputPreview: "README.md",
  });
});

test("parseAgentStreamEvent accepts progressive image generation events", () => {
  assert.deepEqual(
    parseAgentStreamEvent(
      '{"type":"image-generation-progress","id":"image-1","stage":"generating","message":"模型正在生成图像"}',
    ),
    {
      type: "image-generation-progress",
      id: "image-1",
      stage: "generating",
      message: "模型正在生成图像",
    },
  );
  assert.deepEqual(
    parseAgentStreamEvent(
      '{"type":"image-generation-partial","id":"image-1","imageBase64":"abc","mimeType":"image/png","index":1}',
    ),
    {
      type: "image-generation-partial",
      id: "image-1",
      imageBase64: "abc",
      mimeType: "image/png",
      index: 1,
    },
  );
  assert.deepEqual(
    parseAgentStreamEvent(
      '{"type":"image-generation-complete","id":"image-1","imageBase64":"final","mimeType":"image/png"}',
    ),
    {
      type: "image-generation-complete",
      id: "image-1",
      imageBase64: "final",
      mimeType: "image/png",
    },
  );
});

test("parseAgentStreamEvent turns unknown shapes into diagnostic errors", () => {
  const event = parseAgentStreamEvent('{"type":"unknown","value":1}');

  assert.deepEqual(event, {
    type: "error",
    message: "Received an unknown agent event.",
  });
});

test("encodeStreamEvent appends a newline for fetch stream chunks", () => {
  assert.equal(
    encodeStreamEvent({ type: "text-delta", text: "hello" }),
    '{"type":"text-delta","text":"hello"}\n',
  );
});

test("previewValue truncates long structured values", () => {
  const preview = previewValue({ value: "abcdefghijklmnopqrstuvwxyz" }, 18);

  assert.equal(preview, '{"value":"abcdefgh...');
});
