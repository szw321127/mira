import assert from "node:assert/strict";
import test from "node:test";

import {
  createEmptyConversation,
  createInitialWorkspaceState,
  loadWorkspaceState,
  saveWorkspaceState,
  clearWorkspaceState,
  STORAGE_KEY,
} from "./storage.mjs";

function installLocalStorage() {
  const store = new Map();
  global.window = {
    localStorage: {
      getItem(key) {
        return store.has(key) ? store.get(key) : null;
      },
      setItem(key, value) {
        store.set(key, String(value));
      },
      removeItem(key) {
        store.delete(key);
      },
    },
  };
  return store;
}

test("createInitialWorkspaceState creates one active empty conversation", () => {
  const state = createInitialWorkspaceState();

  assert.equal(state.conversations.length, 1);
  assert.equal(state.activeConversationId, state.conversations[0].id);
  assert.equal(state.conversations[0].title, "新对话");
});

test("saveWorkspaceState and loadWorkspaceState round-trip valid state", () => {
  installLocalStorage();
  const state = createInitialWorkspaceState();

  saveWorkspaceState(state);

  assert.deepEqual(loadWorkspaceState(), state);
});

test("loadWorkspaceState ignores corrupt local data", () => {
  const store = installLocalStorage();
  store.set(STORAGE_KEY, JSON.stringify({ activeConversationId: 1 }));

  assert.equal(loadWorkspaceState(), null);
});

test("clearWorkspaceState removes persisted conversations", () => {
  installLocalStorage();
  const state = createInitialWorkspaceState();
  saveWorkspaceState(state);

  clearWorkspaceState();

  assert.equal(loadWorkspaceState(), null);
});

test("createEmptyConversation timestamps and ids are strings", () => {
  const conversation = createEmptyConversation();

  assert.equal(typeof conversation.id, "string");
  assert.equal(typeof conversation.createdAt, "string");
  assert.equal(typeof conversation.updatedAt, "string");
});
