import assert from "node:assert/strict";
import test from "node:test";

import {
  deleteConversation,
  renameConversation,
} from "./conversation-actions.mjs";

function conversation(id, title) {
  return {
    id,
    title,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    messages: [],
  };
}

test("renameConversation trims and updates an existing conversation title", () => {
  const state = {
    activeConversationId: "a",
    conversations: [conversation("a", "旧名称"), conversation("b", "保留")],
  };

  const next = renameConversation(
    state,
    "a",
    "  新名称  ",
    "2026-02-01T00:00:00.000Z",
  );

  assert.equal(next.conversations[0].title, "新名称");
  assert.equal(next.conversations[0].updatedAt, "2026-02-01T00:00:00.000Z");
  assert.equal(next.conversations[1].title, "保留");
});

test("renameConversation ignores empty names", () => {
  const state = {
    activeConversationId: "a",
    conversations: [conversation("a", "旧名称")],
  };

  const next = renameConversation(
    state,
    "a",
    "   ",
    "2026-02-01T00:00:00.000Z",
  );

  assert.deepEqual(next, state);
});

test("deleteConversation keeps active id when deleting an inactive conversation", () => {
  const state = {
    activeConversationId: "a",
    conversations: [conversation("a", "A"), conversation("b", "B")],
  };

  const next = deleteConversation(state, "b", () => conversation("new", "新对话"));

  assert.equal(next.activeConversationId, "a");
  assert.deepEqual(
    next.conversations.map((item) => item.id),
    ["a"],
  );
});

test("deleteConversation selects the next conversation after deleting the active one", () => {
  const state = {
    activeConversationId: "b",
    conversations: [
      conversation("a", "A"),
      conversation("b", "B"),
      conversation("c", "C"),
    ],
  };

  const next = deleteConversation(state, "b", () => conversation("new", "新对话"));

  assert.equal(next.activeConversationId, "c");
  assert.deepEqual(
    next.conversations.map((item) => item.id),
    ["a", "c"],
  );
});

test("deleteConversation creates a fallback conversation when deleting the last one", () => {
  const state = {
    activeConversationId: "a",
    conversations: [conversation("a", "A")],
  };

  const next = deleteConversation(state, "a", () => conversation("new", "新对话"));

  assert.equal(next.activeConversationId, "new");
  assert.deepEqual(
    next.conversations.map((item) => item.id),
    ["new"],
  );
});
