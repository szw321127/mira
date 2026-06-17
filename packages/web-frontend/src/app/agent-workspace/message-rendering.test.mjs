import assert from "node:assert/strict";
import test from "node:test";
import { shouldRenderMarkdown } from "./message-rendering.mjs";

test("assistant messages render markdown while user messages stay plain text", () => {
  assert.equal(shouldRenderMarkdown("assistant"), true);
  assert.equal(shouldRenderMarkdown("user"), false);
});
