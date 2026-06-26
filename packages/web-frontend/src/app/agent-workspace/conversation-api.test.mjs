import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const workspaceDir = dirname(fileURLToPath(import.meta.url));

function readWorkspaceFile(fileName) {
  const filePath = join(workspaceDir, fileName);
  assert.equal(existsSync(filePath), true, `${fileName} should exist`);
  return readFileSync(filePath, "utf8");
}

test("conversation api uses same-origin persistence endpoints", () => {
  const apiSource = readWorkspaceFile("conversation-api.ts");

  assert.match(apiSource, /fetch\("\/api\/conversations"/);
  assert.match(apiSource, /createRemoteConversation/);
  assert.match(apiSource, /renameRemoteConversation/);
  assert.match(apiSource, /deleteRemoteConversation/);
  assert.match(apiSource, /saveRemoteMessages/);
  assert.match(apiSource, /importRemoteConversations/);
  assert.match(apiSource, /encodeURIComponent\(id\)/);
});

test("workspace hook loads and syncs conversations remotely for the current user", () => {
  const hookSource = readWorkspaceFile("use-agent-conversation.ts");
  const pageSource = readFileSync(join(workspaceDir, "../page.tsx"), "utf8");

  assert.match(hookSource, /useAgentConversation\(user: AuthUser \| null\)/);
  assert.match(hookSource, /loadRemoteConversations/);
  assert.match(hookSource, /importRemoteConversations/);
  assert.match(hookSource, /createRemoteConversation/);
  assert.match(hookSource, /renameRemoteConversation/);
  assert.match(hookSource, /deleteRemoteConversation/);
  assert.match(hookSource, /saveRemoteMessages/);
  assert.match(hookSource, /const currentUser = user/);
  assert.match(hookSource, /hasMigratedLegacyConversations\(currentUser\.id\)/);
  assert.match(hookSource, /markLegacyConversationsMigrated\(currentUser\.id\)/);
  assert.doesNotMatch(hookSource, /saveWorkspaceState\(workspace\)/);
  assert.match(pageSource, /useAgentConversation\(user\)/);
});

test("workspace hook waits for optimistic conversations to receive a remote id before chat", () => {
  const hookSource = readWorkspaceFile("use-agent-conversation.ts");

  assert.match(hookSource, /pendingConversationCreatesRef/);
  assert.match(hookSource, /ensureRemoteConversationId/);
  assert.match(hookSource, /pendingConversationCreatesRef\.current\.set/);
  assert.match(
    hookSource,
    /await ensureRemoteConversationId\(\s*requestConversationId,\s*nextTitle,\s*\)/,
  );
});

test("workspace hook resolves optimistic conversation ids before remote rename", () => {
  const hookSource = readWorkspaceFile("use-agent-conversation.ts");

  assert.match(
    hookSource,
    /ensureRemoteConversationId\(id, nextTitle\)[\s\S]*renameRemoteConversation\(remoteConversationId, nextTitle\)/,
  );
});

test("workspace hook resolves optimistic conversation ids before remote delete", () => {
  const hookSource = readWorkspaceFile("use-agent-conversation.ts");

  assert.match(
    hookSource,
    /ensureRemoteConversationId\(id, "新对话"\)[\s\S]*deleteRemoteConversation\(remoteConversationId\)/,
  );
});

test("workspace hook creates remote conversations only for optimistic local ids", () => {
  const hookSource = readWorkspaceFile("use-agent-conversation.ts");

  assert.match(
    hookSource,
    /if \(!optimisticConversationIdsRef\.current\.has\(id\)\) \{\s*return Promise\.resolve\(id\);\s*\}/,
  );
});

test("agent workspace supports image attachments from upload drop and paste", () => {
  const typesSource = readWorkspaceFile("types.ts");
  const composerSource = readWorkspaceFile("composer.tsx");
  const hookSource = readWorkspaceFile("use-agent-conversation.ts");

  assert.match(typesSource, /export type ChatImageAttachment/);
  assert.match(typesSource, /attachments\?: ChatImageAttachment\[\]/);
  assert.match(typesSource, /AgentChatRequest[\s\S]*attachments\?: ChatImageAttachment\[\]/);
  assert.match(composerSource, /ImageUploadInput/);
  assert.match(composerSource, /ImagePlus/);
  assert.match(composerSource, /onSend\(message,\s*attachments\)/);
  assert.match(composerSource, /clearAttachments/);
  assert.match(composerSource, /removeAttachment/);
  assert.match(hookSource, /sendMessage[\s\S]*attachments: ChatImageAttachment\[\] = \[\]/);
  assert.match(hookSource, /attachments,\s*createdAt/);
  assert.match(hookSource, /attachments: message\.attachments \?\? \[\]/);
});

test("agent workspace persists generated images from progressive image events", () => {
  const typesSource = readWorkspaceFile("types.ts");
  const messageEventsSource = readWorkspaceFile("message-events.ts");

  assert.match(typesSource, /export type ChatGeneratedImage/);
  assert.match(typesSource, /generatedImages\?: ChatGeneratedImage\[\]/);
  assert.match(messageEventsSource, /image-generation-partial/);
  assert.match(messageEventsSource, /image-generation-complete/);
  assert.match(messageEventsSource, /generatedImages/);
  assert.match(messageEventsSource, /createPersistedChatEvent/);
});

test("workspace hook serializes remote message saves to avoid stale stream snapshots", () => {
  const hookSource = readWorkspaceFile("use-agent-conversation.ts");

  assert.match(hookSource, /MessageSaveQueue/);
  assert.match(hookSource, /new MessageSaveQueue/);
  assert.match(hookSource, /messageSaveQueue\.queue\(id, conversation\.messages\)/);
  assert.doesNotMatch(
    hookSource,
    /void saveRemoteMessages\(id, conversation\.messages\)\.catch/,
  );
});
