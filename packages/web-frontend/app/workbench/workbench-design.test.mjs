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

test("publish package image fields are mapped and restored", () => {
  const types = readWorkbenchFile("types.ts");
  const utils = readWorkbenchFile("workspace-utils.ts");
  const api = readFileSync(join(root, "..", "..", "lib", "api.ts"), "utf8");

  for (const field of [
    "imageUrl",
    "imageStatus",
    "imageProvider",
    "imageError",
    "imageGeneratedAt",
  ]) {
    assert.match(api, new RegExp(`${field}[?:]`));
    assert.match(types, new RegExp(`${field}[?:]`));
    assert.match(utils, new RegExp(`${field}:`));
  }

  assert.match(api, /generateImage:/);
  assert.match(api, /\/post-drafts\/\$\{postDraftId\}\/image/);
  assert.match(api, /get: \(token: string, postDraftId: string\)/);
});

test("publish package draft signature excludes generation timestamp metadata", () => {
  const utils = readWorkbenchFile("workspace-utils.ts");
  const signatureStart = utils.indexOf("export function getDraftSignature");
  const signatureEnd = utils.indexOf(
    "\nexport function dedupeSavedDrafts",
    signatureStart,
  );

  assert.ok(signatureStart !== -1);
  assert.ok(signatureEnd > signatureStart);

  const signatureSource = utils.slice(signatureStart, signatureEnd);

  assert.doesNotMatch(signatureSource, /imageGeneratedAt/);
  assert.match(utils, /imageGeneratedAt: draft\.imageGeneratedAt/);
  assert.match(utils, /imageGeneratedAt: optionalString\(snapshot\.imageGeneratedAt\)/);
  assert.match(utils, /imageGeneratedAt: optionalString\(value\.imageGeneratedAt\)/);
});

test("post editor presents a focused publish package with image actions", () => {
  const editor = readWorkbenchFile("post-editor.tsx");
  const preview = readWorkbenchFile("post-cover-preview.tsx");

  assert.match(editor, /发布包/);
  assert.match(editor, /PostCoverPreview/);
  assert.match(editor, /onGenerateImage/);
  assert.match(editor, /onDownloadImage/);
  assert.doesNotMatch(editor, /aria-label="局部复制"/);
  assert.match(preview, /imageStatus === "ready"/);
  assert.match(preview, /imageStatus === "failed"/);
  assert.match(preview, /imageStatus === "generating"/);
});

test("post editor uses publish package as the visible concept label", () => {
  const editor = readWorkbenchFile("post-editor.tsx");

  assert.match(editor, /id="post-title"[\s\S]*发布包/);
  assert.doesNotMatch(editor, />\s*图文\s*</);
});

test("failed cover preview keeps the fallback cover layout visible", () => {
  const preview = readWorkbenchFile("post-cover-preview.tsx");
  const failedStart = preview.indexOf('{imageStatus === "failed" ? (');
  const idleStart = preview.indexOf("{shouldShowIdlePreview", failedStart);

  assert.ok(failedStart !== -1);
  assert.ok(idleStart > failedStart);

  const failedState = preview.slice(failedStart, idleStart);

  assert.match(failedState, /postDraft\.imageError \?\? "封面生成失败"/);
  assert.match(failedState, /postDraft\.coverLine \|\| postDraft\.title/);
});

test("page merges generated image fields without overwriting local copy", () => {
  const source = readFileSync(join(root, "..", "page.tsx"), "utf8");
  const mergeStart = source.indexOf("function mergePostDraftImageFields");
  const mergeEnd = source.indexOf("\nexport default function Home", mergeStart);
  const mergeSource = source.slice(mergeStart, mergeEnd);
  const generationGuardStart = source.indexOf("if (generatingImageDraftId)");
  const generationGuardEnd = source.indexOf("if (!postDraft)", generationGuardStart);
  const generationGuardSource = source.slice(
    generationGuardStart,
    generationGuardEnd,
  );

  assert.match(source, /async function generateImage/);
  assert.match(source, /function mergePostDraftImageFields/);
  assert.ok(mergeStart !== -1);
  assert.ok(mergeEnd > mergeStart);
  assert.ok(generationGuardStart !== -1);
  assert.ok(generationGuardEnd > generationGuardStart);
  for (const field of [
    "caption",
    "title",
    "sections",
    "tags",
    "coverLine",
    "imagePrompt",
  ]) {
    assert.doesNotMatch(mergeSource, new RegExp(`\\b${field}\\b`));
  }
  assert.match(source, /generatingImageDraftId/);
  assert.match(
    generationGuardSource,
    /setStatusMessage\("已有封面图正在生成，请稍等。"\);[\s\S]*return;/,
  );
  assert.match(source, /isGenerating: isGenerating \|\| Boolean\(generatingImageDraftId\)/);
  assert.match(source, /草稿同步失败，封面图生成未开始。/);
  assert.match(source, /api\.postDrafts\.generateImage\(\s*accessToken,\s*draftId,\s*\{\s*\}/);
  assert.match(source, /await flushPostDraftPatch\(\)/);
  assert.match(source, /onGenerateImage=\{generateImage\}/);
  assert.match(source, /onDownloadImage=\{downloadImage\}/);
  assert.match(source, /isGeneratingImage=\{postDraft\?\.id === generatingImageDraftId\}/);
});
