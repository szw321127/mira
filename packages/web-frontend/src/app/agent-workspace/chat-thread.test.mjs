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

test("chat thread shows assistant error details in the failed message", () => {
  assert.doesNotMatch(chatThreadSource, /请查看下方错误/);
  assert.match(chatThreadSource, /latestErrorDetail/);
  assert.match(chatThreadSource, /text-\[var\(--danger\)\]/);
});

test("chat thread renders user image attachments as thumbnails", () => {
  assert.match(chatThreadSource, /message\.attachments\?\.length/);
  assert.match(chatThreadSource, /message\.attachments\.map/);
  assert.match(chatThreadSource, /<img/);
  assert.match(chatThreadSource, /src=\{attachment\.dataUrl\}/);
  assert.match(chatThreadSource, /alt=\{attachment\.name/);
});

test("chat thread renders progressive generated image cards", () => {
  assert.match(chatThreadSource, /GeneratedImageCard/);
  assert.match(chatThreadSource, /message\.generatedImages\?\.length/);
  assert.match(chatThreadSource, /image\.imageBase64/);
  assert.match(chatThreadSource, /正在生成图片/);
  assert.match(chatThreadSource, /image\.progressMessage/);
  assert.match(chatThreadSource, /progressStage/);
});

test("generated image prompt text wraps below the image instead of being clipped", () => {
  assert.doesNotMatch(chatThreadSource, /line-clamp-2/);
  assert.match(chatThreadSource, /break-words/);
  assert.match(chatThreadSource, /whitespace-pre-wrap/);
  assert.match(chatThreadSource, /border-t border-\[var\(--border\)\]/);
});

test("context dock remains responsible for agent event rows", () => {
  assert.match(contextDockSource, /\bAgentEventRow\b/);
  assert.match(contextDockSource, /event\.type !== "text-delta"/);
});
