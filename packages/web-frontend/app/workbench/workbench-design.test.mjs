import { existsSync, readFileSync } from "node:fs";
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
  const generateImageStart = source.indexOf("async function generateImage");
  const generateImageEnd = source.indexOf("function downloadImage", generateImageStart);
  const generateImageSource = source.slice(generateImageStart, generateImageEnd);

  assert.match(source, /async function generateImage/);
  assert.match(source, /function mergePostDraftImageFields/);
  assert.ok(mergeStart !== -1);
  assert.ok(mergeEnd > mergeStart);
  assert.ok(generationGuardStart !== -1);
  assert.ok(generationGuardEnd > generationGuardStart);
  assert.ok(generateImageStart !== -1);
  assert.ok(generateImageEnd > generateImageStart);
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
  assert.doesNotMatch(source, /当前发布包已包含封面提示词，独立封面出图稍后接入。/);
  assert.doesNotMatch(
    generateImageSource,
    /if \(isLocalXhsId\(postDraft\.id\)\)[\s\S]{0,120}return;/,
  );
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

test("workbench keeps Xiaohongshu research automatic instead of manual reference imports", () => {
  const source = readFileSync(join(root, "..", "page.tsx"), "utf8");
  const types = readWorkbenchFile("types.ts");
  const utils = readWorkbenchFile("workspace-utils.ts");

  assert.equal(existsSync(join(root, "reference-importer.tsx")), false);

  assert.doesNotMatch(types, /ReferenceImportState/);
  assert.doesNotMatch(types, /referenceImport/);
  assert.doesNotMatch(utils, /mapReferenceImportState/);
  assert.doesNotMatch(utils, /mapXhsStoredReferenceToReferenceImport/);
  assert.doesNotMatch(utils, /referenceImport/);

  assert.doesNotMatch(source, /ReferenceImporter/);
  assert.doesNotMatch(source, /referenceImport/);
  assert.doesNotMatch(source, /api\.xhs\.importPost/);
  assert.doesNotMatch(source, /api\.xhs\.importAccount/);
  assert.match(source, /const currentConversationId = await ensureConversation/);
  assert.match(source, /conversationId: currentConversationId/);
  assert.doesNotMatch(source, /loadConversationReferences/);
  assert.doesNotMatch(source, /api\.xhs\.listReferences/);
  assert.doesNotMatch(source, /api\.xhs\.deleteReference/);
  assert.doesNotMatch(source, /buildReferenceWorkflowInputs/);
  assert.doesNotMatch(source, /\.\.\.buildReferenceWorkflowInputs/);
});

test("workbench generates outlines through Xiaohongshu research", () => {
  const source = readFileSync(join(root, "..", "page.tsx"), "utf8");
  const api = readFileSync(join(root, "..", "..", "lib", "api.ts"), "utf8");
  const types = readWorkbenchFile("types.ts");
  const utils = readWorkbenchFile("workspace-utils.ts");
  const outline = readWorkbenchFile("outline-workspace.tsx");

  assert.match(api, /XhsResearchRun/);
  assert.match(api, /researchOutlines:/);
  assert.match(api, /\/xhs-analysis\/research\/outlines/);
  assert.match(types, /latestResearch: XhsResearchRun \| null/);
  assert.match(utils, /mapSnapshotXhsResearchRun/);
  assert.match(utils, /latestResearch: mapSnapshotXhsResearchRun/);
  assert.match(utils, /latestResearch: snapshot\.latestResearch/);
  assert.match(utils, /value\.providerType === "xhs_connector"/);
  assert.match(source, /latestResearch, setLatestResearch/);
  assert.match(source, /api\.xhs\.researchOutlines/);
  assert.match(source, /mode: "quick"/);
  assert.match(source, /setLatestResearch\(result\.research\)/);
  assert.match(source, /mapBackendOutline\(outline, nextBatch\)/);
  assert.match(outline, /ResearchSummary/);
  assert.match(outline, /爆款研究/);
  assert.doesNotMatch(outline, /参考来源/);
  assert.match(outline, /standoutSamples/);
  assert.doesNotMatch(outline, /content/);
});

test("workbench collects user Xiaohongshu authorization before research", () => {
  const source = readFileSync(join(root, "..", "page.tsx"), "utf8");
  const api = readFileSync(join(root, "..", "..", "lib", "api.ts"), "utf8");
  const panel = readWorkbenchFile("xhs-authorization-panel.tsx");

  assert.match(api, /XhsAuthorization/);
  assert.match(api, /xhsAuthorizations:/);
  assert.match(api, /\/xhs-authorizations\/current/);
  assert.match(api, /\/xhs-authorizations/);
  assert.match(source, /xhsAuthorization, setXhsAuthorization/);
  assert.match(source, /refreshXhsAuthorization/);
  assert.match(source, /XhsAuthorizationPanel/);
  assert.match(source, /请先授权小红书账号/);
  assert.match(panel, /小红书授权/);
  assert.match(panel, /Cookie/);
  assert.match(panel, /onSave/);
  assert.doesNotMatch(panel, /参考来源/);
});

test("workbench can repair an unready Xiaohongshu publish package", () => {
  const source = readFileSync(join(root, "..", "page.tsx"), "utf8");
  const api = readFileSync(join(root, "..", "..", "lib", "api.ts"), "utf8");
  const editor = readWorkbenchFile("post-editor.tsx");
  const types = readWorkbenchFile("types.ts");
  const utils = readWorkbenchFile("workspace-utils.ts");

  assert.match(api, /XhsPublishRepairResult/);
  assert.match(api, /XhsPersistedCommercialWorkflowResult/);
  assert.match(api, /buildPersistedCommercialDraft:/);
  assert.match(api, /\/xhs-analysis\/workflows\/persisted-commercial-draft/);
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
  assert.match(source, /api\.xhs\.buildPersistedCommercialDraft/);
  assert.match(source, /selectedOutlineId: toBackendSelectedOutlineId\(selectedOutline\.id\)/);
  assert.match(source, /outlineId: toBackendOptionalOutlineId\(selectedOutline\.id\)/);
  assert.match(source, /setLatestWorkflow\(result\.workflow\)/);
  assert.match(source, /setPostDraft\(mapBackendPostDraft\(result\.draft\)\)/);
  assert.match(source, /async function repairPublishPackage/);
  assert.match(source, /api\.xhs\.repairPublishPackage/);
  assert.match(source, /api\.postDrafts\.update\(\s*accessToken,\s*postDraft\.id/);
  assert.match(source, /setPostDraft\(mapBackendPostDraft\(updatedDraft\)\)/);
  assert.match(source, /canRepairPublishPackage=\{Boolean\(/);
  assert.match(source, /onRepairPublishPackage=\{repairPublishPackage\}/);
});

test("workbench never sends local Xiaohongshu outline ids as backend selections", () => {
  const source = readFileSync(join(root, "..", "page.tsx"), "utf8");
  const utils = readWorkbenchFile("workspace-utils.ts");
  const autosave = readWorkbenchFile("use-workspace-autosave.ts");

  assert.match(utils, /export const LOCAL_XHS_ID_PREFIX = "xhs:"/);
  assert.match(utils, /function isLocalXhsId/);
  assert.match(utils, /export function toBackendSelectedOutlineId/);
  assert.match(utils, /export function toBackendOptionalOutlineId/);
  assert.match(source, /selectedOutlineId: toBackendSelectedOutlineId\(selectedId\)/);
  assert.match(source, /selectedOutlineId: toBackendSelectedOutlineId\(outline\.id\)/);
  assert.match(autosave, /selectedOutlineId: toBackendSelectedOutlineId\(selectedId\)/);
  assert.doesNotMatch(
    source,
    /selectedOutlineId:\s*(selectedId|selectedOutline\.id|outline\.id)/,
  );
  assert.doesNotMatch(
    autosave,
    /selectedOutlineId:\s*selectedId/,
  );
});
