import type { ChatMessage, Conversation } from "./types";

type BackendMessage = {
  message?: string;
  error?: string;
};

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json().catch(() => ({}))) as T;
}

async function assertOk(response: Response, fallback: string) {
  if (response.ok) return;

  const body = await readJson<BackendMessage>(response);
  throw new Error(body.message || body.error || fallback);
}

export async function loadRemoteConversations() {
  const response = await fetch("/api/conversations");
  await assertOk(response, "对话记录加载失败");
  return readJson<{ conversations: Conversation[] }>(response);
}

export async function createRemoteConversation(title = "新对话") {
  const response = await fetch("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  await assertOk(response, "新对话创建失败");
  return readJson<{ conversation: Conversation }>(response);
}

export async function renameRemoteConversation(id: string, title: string) {
  const response = await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  await assertOk(response, "对话名称保存失败");
}

export async function deleteRemoteConversation(id: string) {
  const response = await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  await assertOk(response, "对话删除失败");
}

export async function saveRemoteMessages(id: string, messages: ChatMessage[]) {
  const response = await fetch(
    `/api/conversations/${encodeURIComponent(id)}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    },
  );
  await assertOk(response, "对话消息保存失败");
}

export async function importRemoteConversations(conversations: Conversation[]) {
  const response = await fetch("/api/conversations/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversations }),
  });
  await assertOk(response, "本地对话导入失败");
  return readJson<{ conversations: Conversation[] }>(response);
}
