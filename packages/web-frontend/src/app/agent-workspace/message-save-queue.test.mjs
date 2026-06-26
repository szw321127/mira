import assert from "node:assert/strict";
import test from "node:test";

import { MessageSaveQueue } from "./message-save-queue.mjs";

test("message save queue serializes saves and keeps the latest pending snapshot", async () => {
  let releaseFirstSave;
  const saved = [];
  const saveRemoteMessages = async (id, messages) => {
    saved.push({ id, messages });
    if (saved.length === 1) {
      await new Promise((resolve) => {
        releaseFirstSave = resolve;
      });
    }
  };
  const queue = new MessageSaveQueue(saveRemoteMessages);

  queue.queue("conversation-1", [{ id: "assistant", content: "half" }]);
  queue.queue("conversation-1", [{ id: "assistant", content: "almost" }]);
  queue.queue("conversation-1", [{ id: "assistant", content: "complete" }]);

  assert.equal(saved.length, 1);
  assert.equal(saved[0].messages[0].content, "half");

  releaseFirstSave();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(
    saved.map((entry) => entry.messages[0].content),
    ["half", "complete"],
  );
});
