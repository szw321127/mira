import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";

const root = dirname(fileURLToPath(import.meta.url));

function readWorkbenchFile(name) {
  return readFileSync(join(root, name), "utf8");
}

test("post editor keeps generation out of the final editing surface", () => {
  const source = readWorkbenchFile("post-editor.tsx");

  assert.doesNotMatch(source, /\bonRefresh\b/);
  assert.doesNotMatch(source, /刷新图文/);
});

test("conversation rail reads as history and keeps autosave status visible", () => {
  const source = readWorkbenchFile("conversation-rail.tsx");

  assert.match(source, /历史记录/);
  assert.doesNotMatch(source, /max-w-\[104px\]/);
});

test("mobile layout shows the creator workflow before history", () => {
  const source = readFileSync(join(root, "..", "page.tsx"), "utf8");
  const workflowStart = source.indexOf(
    '<div className="order-1 grid min-w-0 gap-4 lg:order-2',
  );
  const railStart = source.indexOf('<div className="order-2 lg:order-1">');
  const ideaComposerStart = source.indexOf("IdeaComposer", workflowStart);
  const conversationRailStart = source.indexOf("ConversationRail", railStart);

  assert.ok(workflowStart !== -1);
  assert.ok(railStart !== -1);
  assert.ok(ideaComposerStart > workflowStart);
  assert.ok(conversationRailStart > railStart);
  assert.ok(workflowStart < railStart);
});

test("outline disclosure captures open state before scheduling React updates", () => {
  const source = readWorkbenchFile("outline-workspace.tsx");
  const updaterStart = source.indexOf(
    "setOpenBatchById((previousOpenBatchById)",
  );
  const updaterEnd = source.indexOf("));", updaterStart);
  const updaterSource = source.slice(updaterStart, updaterEnd);

  assert.match(source, /const isOpen = event\.currentTarget\.open;/);
  assert.doesNotMatch(updaterSource, /event\.currentTarget\.open/);
});

test("successful primary actions refresh history as best effort", () => {
  const source = readFileSync(join(root, "..", "page.tsx"), "utf8");

  assert.match(source, /async function refreshConversationRecordsSafely/);
  assert.doesNotMatch(source, /await refreshConversationRecords\(accessToken\);/);
});
