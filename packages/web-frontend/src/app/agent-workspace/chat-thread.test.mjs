import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const chatThreadSource = readFileSync(
  fileURLToPath(new URL("./chat-thread.tsx", import.meta.url)),
  "utf8",
);
const contextDockSource = readFileSync(
  fileURLToPath(new URL("./context-dock.tsx", import.meta.url)),
  "utf8",
);

test("chat thread does not render agent tool events inline", () => {
  assert.doesNotMatch(chatThreadSource, /\bAgentEventRow\b/);
  assert.doesNotMatch(chatThreadSource, /message\.events\.map/);
});

test("context dock remains responsible for agent event rows", () => {
  assert.match(contextDockSource, /\bAgentEventRow\b/);
  assert.match(contextDockSource, /event\.type !== "text-delta"/);
});
