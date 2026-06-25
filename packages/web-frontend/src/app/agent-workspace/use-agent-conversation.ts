"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuthUser } from "../auth/auth-types";
import {
  deleteConversation,
  renameConversation,
} from "./conversation-actions";
import {
  createRemoteConversation,
  deleteRemoteConversation,
  importRemoteConversations,
  loadRemoteConversations,
  renameRemoteConversation,
  saveRemoteMessages,
} from "./conversation-api";
import {
  createEmptyConversation,
  createInitialWorkspaceState,
  hasMigratedLegacyConversations,
  loadWorkspaceState,
  markLegacyConversationsMigrated,
  STORAGE_KEY,
} from "./storage";
import { createId, parseAgentStreamEvent, parseStreamLines } from "./streaming";
import type {
  AgentStreamEvent,
  ChatImageAttachment,
  ChatEvent,
  ChatMessage,
  Conversation,
  SendState,
  WorkspaceState,
} from "./types";

const SSR_WORKSPACE_STATE: WorkspaceState = {
  activeConversationId: "initial-conversation",
  conversations: [
    {
      id: "initial-conversation",
      title: "新对话",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      messages: [],
    },
  ],
};

function now() {
  return new Date().toISOString();
}

function titleFromMessage(message: string) {
  const trimmed = message.trim().replace(/\s+/g, " ");
  return trimmed.length > 22 ? `${trimmed.slice(0, 22)}...` : trimmed || "新对话";
}

function workspaceFromConversations(conversations: Conversation[]): WorkspaceState {
  const fallback = conversations.length > 0 ? conversations : createInitialWorkspaceState().conversations;

  return {
    activeConversationId: fallback[0].id,
    conversations: fallback,
  };
}

function appendEvent(message: ChatMessage, event: AgentStreamEvent): ChatMessage {
  const chatEvent: ChatEvent = {
    ...event,
    eventId: createId("event"),
    createdAt: now(),
  };

  if (event.type === "text-delta") {
    return {
      ...message,
      content: `${message.content}${event.text}`,
      events: [...message.events, chatEvent],
    };
  }

  if (event.type === "stop") {
    return {
      ...message,
      status: event.reason === "done" ? "complete" : "stopped",
      events: [...message.events, chatEvent],
    };
  }

  if (event.type === "error") {
    return {
      ...message,
      status: "error",
      events: [...message.events, chatEvent],
    };
  }

  return {
    ...message,
    events: [...message.events, chatEvent],
  };
}

function updateActiveConversation(
  state: WorkspaceState,
  update: (conversation: Conversation) => Conversation,
) {
  return updateConversation(state, state.activeConversationId, update);
}

function updateConversation(
  state: WorkspaceState,
  conversationId: string,
  update: (conversation: Conversation) => Conversation,
) {
  return {
    ...state,
    conversations: state.conversations.map((conversation) => {
      return conversation.id === conversationId
        ? update(conversation)
        : conversation;
    }),
  };
}

function replaceConversation(
  state: WorkspaceState,
  localId: string,
  remoteConversation: Conversation,
) {
  return {
    activeConversationId:
      state.activeConversationId === localId
        ? remoteConversation.id
        : state.activeConversationId,
    conversations: state.conversations.map((conversation) => {
      if (conversation.id !== localId) return conversation;

      return {
        ...remoteConversation,
        title: conversation.title,
        updatedAt: conversation.updatedAt,
        messages: conversation.messages,
      };
    }),
  };
}

export function useAgentConversation(user: AuthUser | null) {
  const [workspace, setWorkspace] = useState<WorkspaceState>(() => {
    return SSR_WORKSPACE_STATE;
  });
  const [sendState, setSendState] = useState<SendState>("idle");
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const workspaceRef = useRef(workspace);
  const optimisticConversationIdsRef = useRef(new Set<string>());
  const idAliasesRef = useRef(new Map<string, string>());
  const pendingMessageSaveIdsRef = useRef(new Set<string>());
  const pendingConversationCreatesRef = useRef(new Map<string, Promise<string>>());

  const resolveConversationId = useCallback((id: string) => {
    return idAliasesRef.current.get(id) ?? id;
  }, []);

  const reportSyncError = useCallback((error: unknown, fallback: string) => {
    setStorageWarning(error instanceof Error ? error.message : fallback);
  }, []);

  const queueMessageSave = useCallback((id: string) => {
    if (!user) return;

    pendingMessageSaveIdsRef.current.add(id);
  }, [user]);

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  useEffect(() => {
    if (!user) return;

    let active = true;
    const currentUser = user;

    async function loadConversations() {
      setStorageWarning(null);

      try {
        let conversations = (await loadRemoteConversations()).conversations;

        if (
          conversations.length === 0 &&
          !hasMigratedLegacyConversations(currentUser.id)
        ) {
          const legacy = loadWorkspaceState();

          if (legacy && legacy.conversations.length > 0) {
            conversations = (await importRemoteConversations(legacy.conversations))
              .conversations;
            markLegacyConversationsMigrated(currentUser.id);
          } else {
            if (window.localStorage.getItem(STORAGE_KEY)) {
              setStorageWarning("本地对话数据损坏，已开启一个新对话。");
            }
            markLegacyConversationsMigrated(currentUser.id);
          }
        }

        if (conversations.length === 0) {
          conversations = [(await createRemoteConversation()).conversation];
        }

        if (!active) return;
        setWorkspace(workspaceFromConversations(conversations));
      } catch (error) {
        if (!active) return;
        reportSyncError(error, "对话记录加载失败");
        setWorkspace(createInitialWorkspaceState());
      }
    }

    void loadConversations();

    return () => {
      active = false;
    };
  }, [reportSyncError, user]);

  useEffect(() => {
    if (!user) return;
    if (pendingMessageSaveIdsRef.current.size === 0) return;

    const ids = Array.from(pendingMessageSaveIdsRef.current);
    pendingMessageSaveIdsRef.current.clear();

    for (const originalId of ids) {
      const id = resolveConversationId(originalId);
      if (id === originalId && optimisticConversationIdsRef.current.has(originalId)) {
        continue;
      }

      const conversation = workspace.conversations.find((item) => item.id === id);
      if (!conversation) continue;

      void saveRemoteMessages(id, conversation.messages).catch((error: unknown) => {
        reportSyncError(error, "对话消息保存失败");
      });
    }
  }, [reportSyncError, resolveConversationId, user, workspace]);

  const activeConversation = useMemo(() => {
    return (
      workspace.conversations.find((conversation) => {
        return conversation.id === workspace.activeConversationId;
      }) ?? workspace.conversations[0]
    );
  }, [workspace]);

  const ensureRemoteConversationId = useCallback(
    (id: string, title: string) => {
      if (!user) return Promise.resolve(id);

      const resolvedId = resolveConversationId(id);
      if (resolvedId !== id) return Promise.resolve(resolvedId);
      if (!optimisticConversationIdsRef.current.has(id)) {
        return Promise.resolve(id);
      }

      const pending = pendingConversationCreatesRef.current.get(id);
      if (pending) return pending;

      const createPromise = createRemoteConversation(title)
        .then(({ conversation: remoteConversation }) => {
          const titleToSync =
            workspaceRef.current.conversations.find((item) => item.id === id)
              ?.title ?? remoteConversation.title;

          idAliasesRef.current.set(id, remoteConversation.id);
          optimisticConversationIdsRef.current.delete(id);
          queueMessageSave(remoteConversation.id);
          setWorkspace((current) => {
            return replaceConversation(current, id, remoteConversation);
          });

          if (titleToSync !== remoteConversation.title) {
            void renameRemoteConversation(remoteConversation.id, titleToSync).catch(
              (error: unknown) => reportSyncError(error, "对话名称保存失败"),
            );
          }

          return remoteConversation.id;
        })
        .catch((error: unknown) => {
          reportSyncError(error, "新对话创建失败");
          throw error;
        })
        .finally(() => {
          pendingConversationCreatesRef.current.delete(id);
        });

      pendingConversationCreatesRef.current.set(id, createPromise);
      return createPromise;
    },
    [queueMessageSave, reportSyncError, resolveConversationId, user],
  );

  const startNewConversation = useCallback(() => {
    const conversation = createEmptyConversation();
    optimisticConversationIdsRef.current.add(conversation.id);

    setWorkspace((current) => ({
      activeConversationId: conversation.id,
      conversations: [conversation, ...current.conversations],
    }));
    setSendState("idle");

    if (!user) return;

    void ensureRemoteConversationId(conversation.id, conversation.title).catch(
      () => undefined,
    );
  }, [ensureRemoteConversationId, user]);

  const rename = useCallback(
    (id: string, title: string) => {
      const nextTitle = title.trim();
      if (!nextTitle) return;

      setWorkspace((current) => renameConversation(current, id, nextTitle));

      if (!user) return;
      void ensureRemoteConversationId(id, nextTitle)
        .then((remoteConversationId) => {
          return renameRemoteConversation(remoteConversationId, nextTitle);
        })
        .catch((error: unknown) => reportSyncError(error, "对话名称保存失败"));
    },
    [ensureRemoteConversationId, reportSyncError, user],
  );

  const remove = useCallback(
    (id: string) => {
      const deletingOnlyConversation =
        workspace.conversations.length === 1 && workspace.conversations[0].id === id;
      const fallback = deletingOnlyConversation ? createEmptyConversation() : null;

      if (id === workspace.activeConversationId) {
        abortRef.current?.abort();
        abortRef.current = null;
        setSendState("idle");
      }

      setWorkspace((current) => {
        return deleteConversation(
          current,
          id,
          () => fallback ?? createEmptyConversation(),
        );
      });

      if (!user) return;

      void ensureRemoteConversationId(id, "新对话")
        .then((remoteConversationId) => deleteRemoteConversation(remoteConversationId))
        .catch((error: unknown) => {
          reportSyncError(error, "对话删除失败");
        });

      if (fallback) {
        optimisticConversationIdsRef.current.add(fallback.id);
        void ensureRemoteConversationId(fallback.id, fallback.title).catch(
          () => undefined,
        );
      }
    },
    [
      ensureRemoteConversationId,
      reportSyncError,
      user,
      workspace.activeConversationId,
      workspace.conversations,
    ],
  );

  const selectConversation = useCallback((id: string) => {
    setWorkspace((current) => ({
      ...current,
      activeConversationId: id,
    }));
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSendState("idle");
  }, []);

  const sendMessage = useCallback(
    async (input: string, attachments: ChatImageAttachment[] = []) => {
      const content = input.trim();
      if (
        (!content && attachments.length === 0) ||
        sendState === "streaming" ||
        !activeConversation
      ) {
        return;
      }

      const userMessage: ChatMessage = {
        id: createId("msg"),
        role: "user",
        content,
        attachments,
        createdAt: now(),
        events: [],
      };
      const assistantMessage: ChatMessage = {
        id: createId("msg"),
        role: "assistant",
        content: "",
        createdAt: now(),
        status: "streaming",
        events: [],
      };
      const requestConversationId = activeConversation.id;
      const shouldRenameRemote =
        activeConversation.title === "新对话" &&
        activeConversation.messages.length === 0;
      const nextTitle = titleFromMessage(content);

      queueMessageSave(requestConversationId);
      setWorkspace((current) => {
        return updateActiveConversation(current, (conversation) => {
          return {
            ...conversation,
            title: shouldRenameRemote ? nextTitle : conversation.title,
            updatedAt: now(),
            messages: [...conversation.messages, userMessage, assistantMessage],
          };
        });
      });

      const controller = new AbortController();
      abortRef.current = controller;
      setSendState("streaming");

      try {
        const remoteConversationId = await ensureRemoteConversationId(
          requestConversationId,
          nextTitle,
        );

        if (user && shouldRenameRemote) {
          void renameRemoteConversation(remoteConversationId, nextTitle).catch(
            (error: unknown) => reportSyncError(error, "对话名称保存失败"),
          );
        }

        const response = await fetch("/api/agent/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: remoteConversationId,
            messages: [...activeConversation.messages, userMessage].map(
              (message) => ({
                role: message.role,
                content: message.content,
                attachments: message.attachments ?? [],
              }),
            ),
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          const body = (await response.json().catch(() => null)) as
            | { message?: string }
            | null;
          throw new Error(body?.message ?? "Agent request failed.");
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const parsed = parseStreamLines(buffer);
          buffer = parsed.rest;

          for (const line of parsed.complete) {
            const event = parseAgentStreamEvent(line);
            queueMessageSave(requestConversationId);
            setWorkspace((current) => {
              return updateConversation(
                current,
                resolveConversationId(requestConversationId),
                (conversation) => ({
                  ...conversation,
                  updatedAt: now(),
                  messages: conversation.messages.map((message) => {
                    return message.id === assistantMessage.id
                      ? appendEvent(message, event)
                      : message;
                  }),
                }),
              );
            });
          }
        }

        if (buffer.trim()) {
          const event = parseAgentStreamEvent(buffer);
          queueMessageSave(requestConversationId);
          setWorkspace((current) => {
            return updateConversation(
              current,
              resolveConversationId(requestConversationId),
              (conversation) => ({
                ...conversation,
                updatedAt: now(),
                messages: conversation.messages.map((message) => {
                  return message.id === assistantMessage.id
                    ? appendEvent(message, event)
                    : message;
                }),
              }),
            );
          });
        }
      } catch (error) {
        const event: AgentStreamEvent = {
          type: "error",
          message:
            error instanceof DOMException && error.name === "AbortError"
              ? "用户已停止本次运行。"
              : error instanceof Error
                ? error.message
                : String(error),
        };

        queueMessageSave(requestConversationId);
        setWorkspace((current) => {
          return updateConversation(
            current,
            resolveConversationId(requestConversationId),
            (conversation) => ({
              ...conversation,
              updatedAt: now(),
              messages: conversation.messages.map((message) => {
                return message.id === assistantMessage.id
                  ? appendEvent(message, event)
                  : message;
              }),
            }),
          );
        });
        setSendState("error");
        return;
      } finally {
        abortRef.current = null;
        setSendState("idle");
      }
    },
    [
      activeConversation,
      ensureRemoteConversationId,
      queueMessageSave,
      reportSyncError,
      resolveConversationId,
      sendState,
      user,
    ],
  );

  const retryLastUserMessage = useCallback(() => {
    if (!activeConversation) return;

    const lastUserMessage = [...activeConversation.messages]
      .reverse()
      .find((message) => {
        return message.role === "user";
      });

    if (lastUserMessage) {
      void sendMessage(lastUserMessage.content, lastUserMessage.attachments ?? []);
    }
  }, [activeConversation, sendMessage]);

  return {
    activeConversation,
    conversations: workspace.conversations,
    deleteConversation: remove,
    renameConversation: rename,
    selectConversation,
    sendMessage,
    sendState,
    startNewConversation,
    stop,
    retryLastUserMessage,
    storageWarning,
  };
}
