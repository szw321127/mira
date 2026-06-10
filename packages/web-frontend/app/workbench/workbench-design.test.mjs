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
    '<div className="order-1 grid min-w-0 gap-3 lg:order-2',
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

test("idea and outline panels stay vertically compact", () => {
  const idea = readWorkbenchFile("idea-composer.tsx");
  const outline = readWorkbenchFile("outline-workspace.tsx");
  const page = readFileSync(join(root, "..", "page.tsx"), "utf8");

  assert.match(
    idea,
    /className="grid gap-3 rounded-lg border border-\[var\(--line\)\] bg-\[var\(--surface\)\] p-3"/,
  );
  assert.match(idea, /min-h-\[96px\]/);
  assert.doesNotMatch(idea, /min-h-\[132px\]/);

  assert.match(
    outline,
    /className="grid gap-3 rounded-lg border border-\[var\(--line\)\] bg-\[var\(--surface\)\] p-3"/,
  );
  assert.match(outline, /min-h-\[128px\]/);
  assert.doesNotMatch(outline, /min-h-\[164px\]/);
  assert.match(outline, /line-clamp-2/);
  assert.match(page, /className="grid gap-3 self-start"/);
});

test("successful primary actions refresh history as best effort", () => {
  const source = readFileSync(join(root, "..", "page.tsx"), "utf8");

  assert.match(source, /async function refreshConversationRecordsSafely/);
  assert.doesNotMatch(
    source,
    /await refreshConversationRecords\(accessToken\);/,
  );
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
  assert.match(
    utils,
    /imageGeneratedAt: optionalString\(snapshot\.imageGeneratedAt\)/,
  );
  assert.match(
    utils,
    /imageGeneratedAt: optionalString\(value\.imageGeneratedAt\)/,
  );
});

test("post editor presents a focused publish package with image actions", () => {
  const editor = readWorkbenchFile("post-editor.tsx");
  const preview = readWorkbenchFile("post-cover-preview.tsx");

  assert.match(editor, /发布包/);
  assert.match(editor, /最终笔记/);
  assert.match(editor, /正文段落/);
  assert.match(editor, /封面生成参数/);
  assert.doesNotMatch(editor, /正文结构/);
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
  const generationGuardEnd = source.indexOf(
    "if (!postDraft)",
    generationGuardStart,
  );
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
  assert.match(source, /Boolean\(generatingImageDraftId\)/);
  assert.match(source, /isRepairingPublishPackage/);
  assert.match(source, /草稿同步失败，封面图生成未开始。/);
  assert.match(
    source,
    /api\.postDrafts\.generateImage\(\s*accessToken,\s*draftId,\s*\{\s*\}/,
  );
  assert.match(source, /await flushPostDraftPatch\(\)/);
  assert.match(source, /onGenerateImage=\{generateImage\}/);
  assert.match(source, /onDownloadImage=\{downloadImage\}/);
  assert.match(
    source,
    /isGeneratingImage=\{postDraft\?\.id === generatingImageDraftId\}/,
  );
});

test("login page supports Google email sign-in", () => {
  const source = readFileSync(join(root, "..", "page.tsx"), "utf8");
  const api = readFileSync(join(root, "..", "..", "lib", "api.ts"), "utf8");
  const loginActionsStart = source.indexOf('className="login-actions"');
  const googleFallbackStart = source.indexOf("Google 登录未配置");

  assert.match(api, /google: \(body: \{ credential: string \}\)/);
  assert.match(api, /\/auth\/google/);
  assert.match(source, /NEXT_PUBLIC_GOOGLE_CLIENT_ID/);
  assert.match(source, /accounts\.google\.com\/gsi\/client/);
  assert.match(source, /handleGoogleCredential/);
  assert.match(source, /使用 Google 邮箱登录/);
  assert.match(source, /Google 登录未配置/);
  assert.ok(loginActionsStart !== -1);
  assert.ok(googleFallbackStart > loginActionsStart);
});

test("workbench imports Xiaohongshu reference sources into generation", () => {
  const source = readFileSync(join(root, "..", "page.tsx"), "utf8");
  const api = readFileSync(join(root, "..", "..", "lib", "api.ts"), "utf8");
  const types = readWorkbenchFile("types.ts");
  const utils = readWorkbenchFile("workspace-utils.ts");
  const importer = readWorkbenchFile("reference-importer.tsx");

  assert.match(api, /importPost:/);
  assert.match(api, /\/xhs-analysis\/posts\/import/);
  assert.match(api, /importAccount:/);
  assert.match(api, /\/xhs-analysis\/accounts\/import/);
  assert.match(api, /buildGenerationBrief:/);
  assert.match(api, /\/xhs-analysis\/generation-brief/);
  assert.match(api, /listReferences:/);
  assert.match(api, /\/conversations\/\$\{conversationId\}\/xhs-references/);
  assert.match(api, /deleteReference:/);
  assert.match(api, /\/xhs-references\/\$\{referenceId\}/);

  assert.match(types, /ReferenceImportState/);
  assert.match(types, /backendReferenceId\?: string/);
  assert.match(types, /referenceImport: ReferenceImportState/);
  assert.match(utils, /mapReferenceImportState/);
  assert.match(utils, /mapXhsStoredReferenceToReferenceImport/);
  assert.match(utils, /referenceImport: mapReferenceImportState/);
  assert.match(utils, /referenceImport: snapshot\.referenceImport/);

  assert.match(importer, /参考来源/);
  assert.match(importer, /帖子 URL/);
  assert.match(importer, /账号 URL/);
  assert.match(importer, /爆点信号/);
  assert.match(importer, /账号定位/);

  assert.match(source, /ReferenceImporter/);
  assert.match(source, /referenceImport/);
  assert.match(source, /api\.xhs\.importPost/);
  assert.match(source, /api\.xhs\.importAccount/);
  assert.match(source, /const currentConversationId = await ensureConversation/);
  assert.match(source, /conversationId: currentConversationId/);
  assert.match(source, /loadConversationReferences/);
  assert.match(source, /api\.xhs\.listReferences/);
  assert.match(source, /api\.xhs\.deleteReference/);
  assert.match(source, /api\.xhs\.buildGenerationBrief/);
  assert.match(source, /buildReferenceBrief/);
  assert.match(source, /const referenceBrief = await buildReferenceBrief/);
  assert.match(source, /brief: referenceBrief/);
  assert.match(source, /buildReferenceWorkflowInputs/);
  assert.match(source, /\.\.\.buildReferenceWorkflowInputs/);
});

test("workbench can repair an unready Xiaohongshu publish package", () => {
  const source = readFileSync(join(root, "..", "page.tsx"), "utf8");
  const api = readFileSync(join(root, "..", "..", "lib", "api.ts"), "utf8");
  const editor = readWorkbenchFile("post-editor.tsx");
  const types = readWorkbenchFile("types.ts");
  const utils = readWorkbenchFile("workspace-utils.ts");

  assert.match(api, /XhsPublishRepairResult/);
  assert.match(api, /repairPublishPackage:/);
  assert.match(api, /\/xhs-analysis\/workflows\/repair-publish-package/);

  assert.match(types, /latestWorkflow: XhsCommercialWorkflow \| null/);
  assert.match(utils, /latestWorkflow: mapSnapshotXhsCommercialWorkflow/);
  assert.match(utils, /latestWorkflow: snapshot\.latestWorkflow/);

  assert.match(editor, /canRepairPublishPackage/);
  assert.match(editor, /isRepairingPublishPackage/);
  assert.match(editor, /onRepairPublishPackage/);
  assert.match(editor, /修复发布包/);

  assert.match(source, /latestWorkflow, setLatestWorkflow/);
  assert.match(source, /isRepairingPublishPackage, setIsRepairingPublishPackage/);
  assert.match(source, /function mapXhsPublishPackageToPostDraft/);
  assert.match(source, /setLatestWorkflow\(workflow\)/);
  assert.match(source, /async function repairPublishPackage/);
  assert.match(source, /api\.xhs\.repairPublishPackage/);
  assert.match(
    source,
    /setPostDraft\(mapXhsPublishPackageToPostDraft\(result\.publishPackage\)\)/,
  );
  assert.match(source, /canRepairPublishPackage=\{Boolean\(/);
  assert.match(source, /onRepairPublishPackage=\{repairPublishPackage\}/);
});
