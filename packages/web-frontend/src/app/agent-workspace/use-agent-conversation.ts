"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createEmptyConversation,
  createInitialWorkspaceState,
  loadWorkspaceState,
  saveWorkspaceState,
  STORAGE_KEY,
} from "./storage";
import { createId, parseAgentStreamEvent, parseStreamLines } from "./streaming";
import type {
  AgentStreamEvent,
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
  return {
    ...state,
    conversations: state.conversations.map((conversation) => {
      return conversation.id === state.activeConversationId
        ? update(conversation)
        : conversation;
    }),
  };
}

export function useAgentConversation() {
  const [workspace, setWorkspace] = useState<WorkspaceState>(() => {
    return SSR_WORKSPACE_STATE;
  });
  const [sendState, setSendState] = useState<SendState>("idle");
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const storageLoadedRef = useRef(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const loaded = loadWorkspaceState();

      if (loaded) {
        setWorkspace(loaded);
      } else {
        if (window.localStorage.getItem(STORAGE_KEY)) {
          setStorageWarning("本地对话数据损坏，已开启一个新对话。");
        }
        setWorkspace(createInitialWorkspaceState());
      }

      storageLoadedRef.current = true;
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!storageLoadedRef.current) return;
    saveWorkspaceState(workspace);
  }, [workspace]);

  const activeConversation = useMemo(() => {
    return (
      workspace.conversations.find((conversation) => {
        return conversation.id === workspace.activeConversationId;
      }) ?? workspace.conversations[0]
    );
  }, [workspace]);

  const startNewConversation = useCallback(() => {
    const conversation = createEmptyConversation();
    setWorkspace((current) => ({
      activeConversationId: conversation.id,
      conversations: [conversation, ...current.conversations],
    }));
    setSendState("idle");
  }, []);

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
    async (input: string) => {
      const content = input.trim();
      if (!content || sendState === "streaming") return;

      const userMessage: ChatMessage = {
        id: createId("msg"),
        role: "user",
        content,
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

      setWorkspace((current) => {
        return updateActiveConversation(current, (conversation) => {
          const isUntitled =
            conversation.title === "新对话" && conversation.messages.length === 0;

          return {
            ...conversation,
            title: isUntitled ? titleFromMessage(content) : conversation.title,
            updatedAt: now(),
            messages: [...conversation.messages, userMessage, assistantMessage],
          };
        });
      });

      const controller = new AbortController();
      abortRef.current = controller;
      setSendState("streaming");

      try {
        const response = await fetch("/api/agent/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: activeConversation.id,
            messages: [...activeConversation.messages, userMessage].map(
              (message) => ({
                role: message.role,
                content: message.content,
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
            setWorkspace((current) => {
              return updateActiveConversation(current, (conversation) => ({
                ...conversation,
                updatedAt: now(),
                messages: conversation.messages.map((message) => {
                  return message.id === assistantMessage.id
                    ? appendEvent(message, event)
                    : message;
                }),
              }));
            });
          }
        }

        if (buffer.trim()) {
          const event = parseAgentStreamEvent(buffer);
          setWorkspace((current) => {
            return updateActiveConversation(current, (conversation) => ({
              ...conversation,
              updatedAt: now(),
              messages: conversation.messages.map((message) => {
                return message.id === assistantMessage.id
                  ? appendEvent(message, event)
                  : message;
              }),
            }));
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

        setWorkspace((current) => {
          return updateActiveConversation(current, (conversation) => ({
            ...conversation,
            updatedAt: now(),
            messages: conversation.messages.map((message) => {
              return message.id === assistantMessage.id
                ? appendEvent(message, event)
                : message;
            }),
          }));
        });
        setSendState("error");
        return;
      } finally {
        abortRef.current = null;
        setSendState("idle");
      }
    },
    [activeConversation.id, activeConversation.messages, sendState],
  );

  const retryLastUserMessage = useCallback(() => {
    const lastUserMessage = [...activeConversation.messages]
      .reverse()
      .find((message) => {
        return message.role === "user";
      });

    if (lastUserMessage) void sendMessage(lastUserMessage.content);
  }, [activeConversation.messages, sendMessage]);

  return {
    activeConversation,
    conversations: workspace.conversations,
    selectConversation,
    sendMessage,
    sendState,
    startNewConversation,
    stop,
    retryLastUserMessage,
    storageWarning,
  };
}
