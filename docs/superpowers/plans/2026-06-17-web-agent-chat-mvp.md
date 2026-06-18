# Web Agent Chat MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the default `web-frontend` page with a Next.js RedNote agent conversation workspace that streams server-side agent events, shows agent activity, and restores local conversations after refresh.

**Architecture:** The browser owns the product shell, conversation rendering, local storage, send/stop/retry controls, and stream parsing. A Next.js route handler under `packages/web-frontend/src/app/api/agent/chat/route.ts` validates the request, builds an `@rednote/agent` runtime server-side, normalizes `AgentLoopEvent` values, and streams newline-delimited JSON events to the client. Phase 1 stays local-first and does not depend on backend auth or durable backend persistence.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, `@rednote/agent`, AI SDK via `@ai-sdk/openai`, browser `fetch` streaming, localStorage.

---

## File Structure

- Modify `packages/web-frontend/package.json`: rename the package to `@rednote/web-frontend`, add `@rednote/agent`, `@ai-sdk/openai`, and `lucide-react`.
- Modify `pnpm-lock.yaml`: updated by `pnpm install`.
- Modify `packages/web-frontend/next.config.ts`: transpile the local `@rednote/agent` workspace package for the server route.
- Create `packages/web-frontend/src/app/agent-workspace/types.ts`: browser-safe message, event, conversation, storage, and API types.
- Create `packages/web-frontend/src/app/agent-workspace/streaming.ts`: pure stream parsing and event application helpers.
- Create `packages/web-frontend/src/app/agent-workspace/storage.ts`: localStorage validation, load, save, and reset helpers.
- Create `packages/web-frontend/src/app/agent-workspace/use-agent-conversation.ts`: client hook for conversations, send, stop, retry, stream reading, and persistence.
- Create `packages/web-frontend/src/app/agent-workspace/components.tsx`: focused UI components for rail, thread, event rows, composer, dock, and shell.
- Create `packages/web-frontend/src/app/api/agent/chat/route.ts`: server route that streams normalized agent events.
- Modify `packages/web-frontend/src/app/page.tsx`: replace starter page with the agent workspace.
- Modify `packages/web-frontend/src/app/layout.tsx`: update metadata and document language.
- Modify `packages/web-frontend/src/app/globals.css`: replace starter tokens with RedNote product tokens and base layout behavior.
- Phase 1 does not add frontend unit tests because `packages/web-frontend` currently has no `test` script. Verification uses pure helper review, lint, build, and browser checks.

Backend files are out of scope for Phase 1. Do not modify the untracked `packages/backend/` directory unless a later user request explicitly changes scope.

---

### Task 1: Fix Package Identity And Dependencies

**Files:**
- Modify: `packages/web-frontend/package.json`
- Modify: `packages/web-frontend/next.config.ts`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Update package name and dependencies**

Change `packages/web-frontend/package.json` to use the workspace name expected by the root scripts and add the runtime dependencies needed by the MVP:

```json
{
  "name": "@rednote/web-frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint"
  },
  "dependencies": {
    "@ai-sdk/openai": "^3.0.67",
    "@rednote/agent": "workspace:*",
    "lucide-react": "^0.468.0",
    "next": "16.2.9",
    "react": "19.2.4",
    "react-dom": "19.2.4"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "babel-plugin-react-compiler": "1.0.0",
    "eslint": "^9",
    "eslint-config-next": "16.2.9",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Configure Next to transpile the local agent package**

Modify `packages/web-frontend/next.config.ts`:

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: ["@rednote/agent"],
};

export default nextConfig;
```

- [ ] **Step 3: Refresh lockfile**

Run:

```bash
pnpm install
```

Expected:

- `pnpm-lock.yaml` updates.
- No install failure.

- [ ] **Step 4: Verify root filter now matches**

Run:

```bash
pnpm --filter @rednote/web-frontend exec pwd
```

Expected output includes:

```text
/Users/szw/项目/rednote/packages/web-frontend
```

- [ ] **Step 5: Commit**

```bash
git add packages/web-frontend/package.json packages/web-frontend/next.config.ts pnpm-lock.yaml
git commit -m "chore(web): align frontend package name"
```

---

### Task 2: Define Shared Types And Pure Stream Helpers

**Files:**
- Create: `packages/web-frontend/src/app/agent-workspace/types.ts`
- Create: `packages/web-frontend/src/app/agent-workspace/streaming.ts`

- [ ] **Step 1: Create browser-safe types**

Create `types.ts`:

```ts
export type AgentStreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; id: string; toolName: string; inputPreview: string }
  | { type: "tool-result"; id: string; toolName: string; outputPreview: string }
  | { type: "retry"; attempt: number; maxRetries: number; delayMs: number; error: string }
  | { type: "detection"; level: "warning" | "critical"; message: string }
  | { type: "token-cost"; detail: string; cost: string }
  | { type: "token-usage"; totalTokens: number; tokenBudget: number; percent: string }
  | { type: "stop"; reason: string; message?: string }
  | { type: "error"; message: string };

export type ChatEvent = AgentStreamEvent & {
  eventId: string;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  status?: "streaming" | "complete" | "error" | "stopped";
  events: ChatEvent[];
};

export type Conversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
};

export type WorkspaceState = {
  activeConversationId: string;
  conversations: Conversation[];
};

export type SendState = "idle" | "streaming" | "error";

export type AgentChatRequest = {
  conversationId: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
};

export type AgentChatError = {
  message: string;
};
```

- [ ] **Step 2: Create stream parser helpers**

Create `streaming.ts`:

```ts
import type { AgentStreamEvent } from "./types";

export function createId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function previewValue(value: unknown, maxLength = 180) {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  if (!raw) return "";
  return raw.length > maxLength ? `${raw.slice(0, maxLength)}...` : raw;
}

export function encodeStreamEvent(event: AgentStreamEvent) {
  return `${JSON.stringify(event)}\n`;
}

export function parseStreamLines(buffer: string) {
  const lines = buffer.split("\n");
  return {
    complete: lines.slice(0, -1).filter(Boolean),
    rest: lines.at(-1) ?? "",
  };
}

export function parseAgentStreamEvent(line: string): AgentStreamEvent {
  const value: unknown = JSON.parse(line);

  if (!isAgentStreamEvent(value)) {
    return { type: "error", message: "Received an unknown agent event." };
  }

  return value;
}

export function isAgentStreamEvent(value: unknown): value is AgentStreamEvent {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  const event = value as Record<string, unknown>;

  switch (event.type) {
    case "text-delta":
      return typeof event.text === "string";
    case "tool-call":
      return (
        typeof event.id === "string" &&
        typeof event.toolName === "string" &&
        typeof event.inputPreview === "string"
      );
    case "tool-result":
      return (
        typeof event.id === "string" &&
        typeof event.toolName === "string" &&
        typeof event.outputPreview === "string"
      );
    case "retry":
      return (
        typeof event.attempt === "number" &&
        typeof event.maxRetries === "number" &&
        typeof event.delayMs === "number" &&
        typeof event.error === "string"
      );
    case "detection":
      return (
        (event.level === "warning" || event.level === "critical") &&
        typeof event.message === "string"
      );
    case "token-cost":
      return typeof event.detail === "string" && typeof event.cost === "string";
    case "token-usage":
      return (
        typeof event.totalTokens === "number" &&
        typeof event.tokenBudget === "number" &&
        typeof event.percent === "string"
      );
    case "stop":
      return typeof event.reason === "string";
    case "error":
      return typeof event.message === "string";
    default:
      return false;
  }
}
```

- [ ] **Step 3: Run lint to catch type errors early**

Run:

```bash
pnpm --filter @rednote/web-frontend lint
```

Expected: lint passes or only reports files not created yet in later tasks. If it fails on these helpers, fix before continuing.

- [ ] **Step 4: Commit**

```bash
git add packages/web-frontend/src/app/agent-workspace/types.ts packages/web-frontend/src/app/agent-workspace/streaming.ts
git commit -m "feat(web): add agent stream types"
```

---

### Task 3: Add Local Conversation Storage

**Files:**
- Create: `packages/web-frontend/src/app/agent-workspace/storage.ts`

- [ ] **Step 1: Implement safe local storage helpers**

Create `storage.ts`:

```ts
import type { Conversation, WorkspaceState } from "./types";

const STORAGE_KEY = "rednote.agent-workspace.v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isConversation(value: unknown): value is Conversation {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    Array.isArray(value.messages)
  );
}

export function createEmptyConversation(): Conversation {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: "新对话",
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

export function createInitialWorkspaceState(): WorkspaceState {
  const conversation = createEmptyConversation();
  return {
    activeConversationId: conversation.id,
    conversations: [conversation],
  };
}

export function loadWorkspaceState(): WorkspaceState | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    if (typeof parsed.activeConversationId !== "string") return null;
    if (!Array.isArray(parsed.conversations)) return null;
    if (!parsed.conversations.every(isConversation)) return null;

    return {
      activeConversationId: parsed.activeConversationId,
      conversations: parsed.conversations,
    };
  } catch {
    return null;
  }
}

export function saveWorkspaceState(state: WorkspaceState) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearWorkspaceState() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
```

- [ ] **Step 2: Verify lint**

Run:

```bash
pnpm --filter @rednote/web-frontend lint
```

Expected: lint passes.

- [ ] **Step 3: Commit**

```bash
git add packages/web-frontend/src/app/agent-workspace/storage.ts
git commit -m "feat(web): add local agent conversation storage"
```

---

### Task 4: Add The Agent Streaming API Route

**Files:**
- Modify: `packages/agent/src/index.ts`
- Create: `packages/web-frontend/src/app/api/agent/chat/route.ts`

- [ ] **Step 1: Export the read-only agent tools needed by the route**

Modify `packages/agent/src/index.ts`:

```ts
export { agentLoop, type AgentLoopEvent, type IAgentConfig } from './loop';
export {
  globTool,
  grepTool,
  listDirectoryTool,
  readFileTool,
  ToolRegistry,
} from './tools';
export { SessionStore, type SessionEntry } from './session';
```

- [ ] **Step 2: Implement route validation, model setup, and streaming**

Create `route.ts`:

```ts
import { createOpenAI } from "@ai-sdk/openai";
import {
  agentLoop,
  readFileTool,
  listDirectoryTool,
  globTool,
  grepTool,
  ToolRegistry,
  type AgentLoopEvent,
} from "@rednote/agent";
import { encodeStreamEvent, previewValue } from "@/app/agent-workspace/streaming";
import type { AgentChatRequest, AgentStreamEvent } from "@/app/agent-workspace/types";

export const runtime = "nodejs";

function jsonError(message: string, status = 400) {
  return Response.json({ message }, { status });
}

function parseRequest(value: unknown): AgentChatRequest | null {
  if (!value || typeof value !== "object") return null;
  const request = value as Record<string, unknown>;
  if (typeof request.conversationId !== "string") return null;
  if (!Array.isArray(request.messages)) return null;

  const messages = request.messages;
  const validMessages = messages.every((message) => {
    if (!message || typeof message !== "object") return false;
    const record = message as Record<string, unknown>;
    return (
      (record.role === "user" || record.role === "assistant") &&
      typeof record.content === "string"
    );
  });

  if (!validMessages) return null;

  return {
    conversationId: request.conversationId,
    messages: messages as AgentChatRequest["messages"],
  };
}

function getModel() {
  const baseURL = process.env.AGENT_MODEL_BASE_URL;
  const apiKey = process.env.AGENT_MODEL_API_KEY;
  const modelName = process.env.AGENT_MODEL_NAME;

  if (!baseURL || !apiKey || !modelName) {
    throw new Error(
      "Missing AGENT_MODEL_BASE_URL, AGENT_MODEL_API_KEY, or AGENT_MODEL_NAME.",
    );
  }

  return createOpenAI({ baseURL, apiKey }).chat(modelName);
}

function normalizeAgentEvent(event: AgentLoopEvent, index: number): AgentStreamEvent {
  switch (event.type) {
    case "text-delta":
      return { type: "text-delta", text: event.text };
    case "tool-call":
      return {
        type: "tool-call",
        id: `tool-${index}`,
        toolName: event.toolName,
        inputPreview: previewValue(event.input),
      };
    case "tool-result":
      return {
        type: "tool-result",
        id: `tool-${index}`,
        toolName: event.toolName,
        outputPreview: event.preview,
      };
    case "retry":
      return {
        type: "retry",
        attempt: event.attempt,
        maxRetries: event.maxRetries,
        delayMs: event.delayMs,
        error: event.error,
      };
    case "detection":
      return {
        type: "detection",
        level: event.level,
        message: event.message,
      };
    case "token-cost":
      return {
        type: "token-cost",
        detail: event.detail,
        cost: event.cost,
      };
    case "token-usage":
      return {
        type: "token-usage",
        totalTokens: event.totalTokens,
        tokenBudget: event.tokenBudget,
        percent: event.percent,
      };
    case "stop":
      return {
        type: "stop",
        reason: event.reason,
        message: event.message,
      };
  }
}

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = parseRequest(body);

  if (!parsed) {
    return jsonError("Invalid agent chat request.");
  }

  const lastUserMessage = [...parsed.messages].reverse().find((message) => {
    return message.role === "user" && message.content.trim();
  });

  if (!lastUserMessage) {
    return jsonError("Message is required.");
  }

  let model: ReturnType<ReturnType<typeof createOpenAI>["chat"]>;

  try {
    model = getModel();
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : String(error), 503);
  }

  const encoder = new TextEncoder();
  const registry = new ToolRegistry();
  registry.register(readFileTool, listDirectoryTool, globTool, grepTool);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let eventIndex = 0;

      try {
        const loop = agentLoop({
          model,
          registry,
          messages: parsed.messages,
          system:
            "你是 RedNote agent，帮助小红书创作者研究选题、拆解大纲、起草内容。回答要具体、可执行，并在需要时使用可用工具读取项目上下文。",
          maxSteps: Number(process.env.AGENT_MAX_STEPS ?? 8),
        });

        for await (const event of loop) {
          const normalized = normalizeAgentEvent(event, eventIndex++);
          controller.enqueue(encoder.encode(encodeStreamEvent(normalized)));
        }
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            encodeStreamEvent({
              type: "error",
              message: error instanceof Error ? error.message : String(error),
            }),
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "Content-Type": "application/x-ndjson; charset=utf-8",
    },
  });
}
```

- [ ] **Step 3: Run lint**

Run:

```bash
pnpm --filter @rednote/web-frontend lint
```

Expected: lint passes. If the agent export change exposes a package build issue, fix the export surface in `packages/agent/src/index.ts` before changing the route design.

- [ ] **Step 4: Commit**

```bash
git add packages/agent/src/index.ts packages/web-frontend/src/app/api/agent/chat/route.ts
git commit -m "feat(web): stream agent events from next route"
```

---

### Task 5: Add The Client Conversation Hook

**Files:**
- Create: `packages/web-frontend/src/app/agent-workspace/use-agent-conversation.ts`

- [ ] **Step 1: Implement send, stop, retry, stream parsing, and persistence**

Create `use-agent-conversation.ts`:

```ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createEmptyConversation,
  createInitialWorkspaceState,
  loadWorkspaceState,
  saveWorkspaceState,
} from "./storage";
import {
  createId,
  parseAgentStreamEvent,
  parseStreamLines,
} from "./streaming";
import type {
  AgentStreamEvent,
  ChatEvent,
  ChatMessage,
  Conversation,
  SendState,
  WorkspaceState,
} from "./types";

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
    return createInitialWorkspaceState();
  });
  const [sendState, setSendState] = useState<SendState>("idle");
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const loaded = loadWorkspaceState();
    if (loaded) {
      setWorkspace(loaded);
      return;
    }
    if (window.localStorage.getItem("rednote.agent-workspace.v1")) {
      setStorageWarning("本地对话数据损坏，已开启一个新对话。");
    }
  }, []);

  useEffect(() => {
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
            messages: [...activeConversation.messages, userMessage].map((message) => ({
              role: message.role,
              content: message.content,
            })),
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
    const lastUserMessage = [...activeConversation.messages].reverse().find((message) => {
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
```

- [ ] **Step 2: Run lint**

Run:

```bash
pnpm --filter @rednote/web-frontend lint
```

Expected: lint passes. Fix stale closure or hook dependency errors before continuing.

- [ ] **Step 3: Commit**

```bash
git add packages/web-frontend/src/app/agent-workspace/use-agent-conversation.ts
git commit -m "feat(web): manage local agent conversations"
```

---

### Task 6: Build The Workspace UI Components

**Files:**
- Create: `packages/web-frontend/src/app/agent-workspace/components.tsx`
- Modify: `packages/web-frontend/src/app/page.tsx`

- [ ] **Step 1: Create UI components**

Create `components.tsx` with these exported components:

```tsx
"use client";

import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleStop,
  FileSearch,
  Menu,
  Plus,
  RefreshCcw,
  Search,
  Send,
  Wrench,
  X,
} from "lucide-react";
import { FormEvent, KeyboardEvent, useMemo, useState } from "react";
import type { ChatEvent, ChatMessage, Conversation, SendState } from "./types";

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function eventLabel(event: ChatEvent) {
  switch (event.type) {
    case "tool-call":
      return `调用 ${event.toolName}`;
    case "tool-result":
      return `${event.toolName} 返回结果`;
    case "retry":
      return `第 ${event.attempt}/${event.maxRetries} 次重试`;
    case "detection":
      return event.level === "critical" ? "检测到阻塞风险" : "检测到重复风险";
    case "token-cost":
      return `Token 成本 ${event.cost}`;
    case "token-usage":
      return `Token 使用 ${event.percent}`;
    case "stop":
      return `已停止：${event.reason}`;
    case "error":
      return "运行失败";
    case "text-delta":
      return "";
  }
}

function EventIcon({ event }: { event: ChatEvent }) {
  if (event.type === "tool-call") return <Wrench aria-hidden="true" size={15} />;
  if (event.type === "tool-result") return <CheckCircle2 aria-hidden="true" size={15} />;
  if (event.type === "error" || event.type === "detection") {
    return <AlertTriangle aria-hidden="true" size={15} />;
  }
  return <FileSearch aria-hidden="true" size={15} />;
}

export function ConversationRail({
  activeConversationId,
  conversations,
  onNew,
  onSelect,
}: {
  activeConversationId: string;
  conversations: Conversation[];
  onNew: () => void;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = conversations.filter((conversation) => {
    return conversation.title.toLowerCase().includes(query.trim().toLowerCase());
  });

  return (
    <aside className="flex h-full w-[280px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface-muted)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] p-3">
        <button className="icon-button primary" type="button" onClick={onNew} aria-label="新对话">
          <Plus size={18} aria-hidden="true" />
        </button>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={16} aria-hidden="true" />
          <input
            className="field h-10 w-full pl-9"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索对话"
            aria-label="搜索对话"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="px-3 py-10 text-sm text-[var(--muted)]">还没有匹配的对话</div>
        ) : (
          <div className="space-y-1">
            {filtered.map((conversation) => (
              <button
                key={conversation.id}
                type="button"
                className="conversation-item"
                data-active={conversation.id === activeConversationId}
                onClick={() => onSelect(conversation.id)}
              >
                <span className="truncate text-sm font-medium">{conversation.title}</span>
                <span className="text-xs text-[var(--muted)]">{formatTime(conversation.updatedAt)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-[var(--border)] p-3 text-xs leading-5 text-[var(--muted)]">
        本期对话只保存在当前浏览器。后续阶段会接入账号和后端同步。
      </div>
    </aside>
  );
}

function EmptyState({ onPrompt }: { onPrompt: (prompt: string) => void }) {
  const prompts = [
    "帮我把一个护肤选题拆成 3 个不同大纲",
    "研究这个账号的爆款结构，再给我新选题",
    "把这段想法改成适合小红书的发布包",
  ];

  return (
    <section className="mx-auto flex max-w-2xl flex-1 flex-col justify-center px-5 py-16">
      <div className="mb-6 flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
        <Bot size={22} aria-hidden="true" />
      </div>
      <h1 className="text-3xl font-semibold tracking-normal text-[var(--ink)]">今天要做哪条小红书内容？</h1>
      <p className="mt-3 max-w-xl text-base leading-7 text-[var(--muted-strong)]">
        告诉 agent 你的选题、账号定位或参考方向。它会边思考边展示工作过程。
      </p>
      <div className="mt-7 grid gap-2">
        {prompts.map((prompt) => (
          <button key={prompt} className="prompt-chip" type="button" onClick={() => onPrompt(prompt)}>
            {prompt}
          </button>
        ))}
      </div>
    </section>
  );
}

function AgentEventRow({ event }: { event: ChatEvent }) {
  if (event.type === "text-delta") return null;

  const detail =
    event.type === "tool-call"
      ? event.inputPreview
      : event.type === "tool-result"
        ? event.outputPreview
        : event.type === "retry"
          ? `${event.error}，${event.delayMs}ms 后重试`
          : event.type === "detection"
            ? event.message
            : event.type === "token-cost"
              ? event.detail
              : event.type === "token-usage"
                ? `${event.totalTokens}/${event.tokenBudget}`
                : event.type === "error"
                  ? event.message
                  : event.message ?? "";

  return (
    <div className="agent-event" data-kind={event.type}>
      <span className="agent-event-icon">
        <EventIcon event={event} />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-medium">{eventLabel(event)}</span>
        {detail ? <span className="line-clamp-2 text-xs text-[var(--muted)]">{detail}</span> : null}
      </span>
    </div>
  );
}

function MessageBlock({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  return (
    <article className={isUser ? "message user" : "message assistant"}>
      <div className="message-meta">
        <span>{isUser ? "你" : "RedNote agent"}</span>
        <span>{formatTime(message.createdAt)}</span>
      </div>
      {message.content ? <p className="whitespace-pre-wrap text-sm leading-7">{message.content}</p> : null}
      {!message.content && message.status === "streaming" ? (
        <p className="text-sm text-[var(--muted)]">正在思考...</p>
      ) : null}
      {message.events.length > 0 ? (
        <div className="mt-3 space-y-2">
          {message.events.map((event) => (
            <AgentEventRow key={event.eventId} event={event} />
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function ChatThread({
  conversation,
  onPrompt,
}: {
  conversation: Conversation;
  onPrompt: (prompt: string) => void;
}) {
  if (conversation.messages.length === 0) {
    return <EmptyState onPrompt={onPrompt} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-5 py-6">
      {conversation.messages.map((message) => (
        <MessageBlock key={message.id} message={message} />
      ))}
    </div>
  );
}

export function ContextDock({ conversation }: { conversation: Conversation }) {
  const latestAssistant = [...conversation.messages].reverse().find((message) => {
    return message.role === "assistant";
  });
  const events = latestAssistant?.events.filter((event) => event.type !== "text-delta").slice(-5) ?? [];

  return (
    <aside className="hidden h-full w-[300px] shrink-0 border-l border-[var(--border)] bg-[var(--surface)] xl:flex xl:flex-col">
      <div className="border-b border-[var(--border)] p-4">
        <h2 className="text-sm font-semibold">Agent 工作</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">最近的工具、重试和停止状态。</p>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {events.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--border)] p-4 text-sm leading-6 text-[var(--muted)]">
            运行后会在这里显示 agent 的关键动作。
          </div>
        ) : (
          events.map((event) => <AgentEventRow key={event.eventId} event={event} />)
        )}
      </div>
    </aside>
  );
}

export function Composer({
  onSend,
  onStop,
  sendState,
}: {
  onSend: (value: string) => void;
  onStop: () => void;
  sendState: SendState;
}) {
  const [value, setValue] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const message = value.trim();
    if (!message) return;
    onSend(message);
    setValue("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  const isStreaming = sendState === "streaming";

  return (
    <form className="composer" onSubmit={submit}>
      <textarea
        className="composer-input"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        placeholder="问 RedNote agent..."
        rows={1}
        aria-label="向 RedNote agent 输入消息"
      />
      {isStreaming ? (
        <button className="icon-button" type="button" onClick={onStop} aria-label="停止">
          <CircleStop size={18} aria-hidden="true" />
        </button>
      ) : (
        <button className="icon-button primary" type="submit" disabled={!value.trim()} aria-label="发送">
          <Send size={18} aria-hidden="true" />
        </button>
      )}
    </form>
  );
}

export function AgentWorkspaceShell({
  activeConversation,
  conversations,
  onNew,
  onPrompt,
  onRetry,
  onSelect,
  onSend,
  onStop,
  sendState,
  storageWarning,
}: {
  activeConversation: Conversation;
  conversations: Conversation[];
  onNew: () => void;
  onPrompt: (prompt: string) => void;
  onRetry: () => void;
  onSelect: (id: string) => void;
  onSend: (value: string) => void;
  onStop: () => void;
  sendState: SendState;
  storageWarning: string | null;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const lastAssistantFailed = useMemo(() => {
    return [...activeConversation.messages].reverse().some((message) => {
      return message.role === "assistant" && message.status === "error";
    });
  }, [activeConversation.messages]);

  return (
    <div className="flex h-dvh overflow-hidden bg-[var(--background)] text-[var(--ink)]">
      <div className="hidden md:block">
        <ConversationRail
          activeConversationId={activeConversation.id}
          conversations={conversations}
          onNew={onNew}
          onSelect={onSelect}
        />
      </div>

      {sidebarOpen ? (
        <div className="fixed inset-0 z-40 flex bg-black/30 md:hidden">
          <ConversationRail
            activeConversationId={activeConversation.id}
            conversations={conversations}
            onNew={() => {
              onNew();
              setSidebarOpen(false);
            }}
            onSelect={(id) => {
              onSelect(id);
              setSidebarOpen(false);
            }}
          />
          <button className="m-3 h-11 w-11 rounded-full bg-white" type="button" onClick={() => setSidebarOpen(false)} aria-label="关闭侧边栏">
            <X className="mx-auto" size={19} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-[var(--border)] px-3 md:hidden">
          <button className="icon-button" type="button" onClick={() => setSidebarOpen(true)} aria-label="打开侧边栏">
            <Menu size={18} aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1 truncate text-sm font-semibold">{activeConversation.title}</div>
          <button className="icon-button primary" type="button" onClick={onNew} aria-label="新对话">
            <Plus size={18} aria-hidden="true" />
          </button>
        </header>

        {storageWarning ? <div className="notice">{storageWarning}</div> : null}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <ChatThread conversation={activeConversation} onPrompt={onPrompt} />
        </div>

        {lastAssistantFailed ? (
          <div className="mx-auto w-full max-w-3xl px-5 pb-2">
            <button className="retry-button" type="button" onClick={onRetry}>
              <RefreshCcw size={15} aria-hidden="true" />
              重试上一条
            </button>
          </div>
        ) : null}

        <div className="border-t border-[var(--border)] bg-[var(--background)] px-3 py-3">
          <Composer onSend={onSend} onStop={onStop} sendState={sendState} />
        </div>
      </main>

      <ContextDock conversation={activeConversation} />
    </div>
  );
}
```

- [ ] **Step 2: Replace starter page**

Replace `packages/web-frontend/src/app/page.tsx`:

```tsx
"use client";

import { AgentWorkspaceShell } from "./agent-workspace/components";
import { useAgentConversation } from "./agent-workspace/use-agent-conversation";

export default function Home() {
  const workspace = useAgentConversation();

  return (
    <AgentWorkspaceShell
      activeConversation={workspace.activeConversation}
      conversations={workspace.conversations}
      onNew={workspace.startNewConversation}
      onPrompt={workspace.sendMessage}
      onRetry={workspace.retryLastUserMessage}
      onSelect={workspace.selectConversation}
      onSend={workspace.sendMessage}
      onStop={workspace.stop}
      sendState={workspace.sendState}
      storageWarning={workspace.storageWarning}
    />
  );
}
```

- [ ] **Step 3: Run lint**

Run:

```bash
pnpm --filter @rednote/web-frontend lint
```

Expected: lint passes. Fix component typing or hook import issues before continuing.

- [ ] **Step 4: Commit**

```bash
git add packages/web-frontend/src/app/page.tsx packages/web-frontend/src/app/agent-workspace/components.tsx
git commit -m "feat(web): add agent workspace shell"
```

---

### Task 7: Apply Product Styling And Metadata

**Files:**
- Modify: `packages/web-frontend/src/app/globals.css`
- Modify: `packages/web-frontend/src/app/layout.tsx`

- [ ] **Step 1: Replace global CSS tokens and primitives**

Replace `globals.css` with:

```css
@import "tailwindcss";

:root {
  --background: oklch(0.99 0.004 20);
  --surface: oklch(1 0 0);
  --surface-muted: oklch(0.965 0.006 240);
  --ink: oklch(0.18 0.01 260);
  --muted-strong: oklch(0.39 0.018 258);
  --muted: oklch(0.54 0.018 258);
  --border: oklch(0.9 0.01 250);
  --accent: oklch(0.58 0.22 25);
  --accent-strong: oklch(0.49 0.21 25);
  --accent-soft: oklch(0.94 0.035 25);
  --success-soft: oklch(0.94 0.045 150);
  --success: oklch(0.45 0.12 150);
  --warning-soft: oklch(0.95 0.055 82);
  --warning: oklch(0.5 0.13 75);
  --danger-soft: oklch(0.95 0.045 25);
  --danger: oklch(0.54 0.18 25);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--ink);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

* {
  box-sizing: border-box;
}

html,
body {
  min-height: 100%;
}

body {
  background: var(--background);
  color: var(--ink);
  font-family: var(--font-geist-sans), "PingFang SC", "Microsoft YaHei", sans-serif;
}

button,
textarea,
input {
  font: inherit;
}

button:focus-visible,
textarea:focus-visible,
input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.icon-button {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--ink);
  display: inline-flex;
  height: 40px;
  justify-content: center;
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease;
  width: 40px;
}

.icon-button:hover {
  background: var(--surface-muted);
}

.icon-button.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: white;
}

.icon-button.primary:hover {
  background: var(--accent-strong);
  border-color: var(--accent-strong);
}

.icon-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.field {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--ink);
  padding: 0 12px;
}

.conversation-item {
  align-items: flex-start;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 58px;
  padding: 10px 12px;
  text-align: left;
  width: 100%;
}

.conversation-item:hover,
.conversation-item[data-active="true"] {
  background: var(--surface);
}

.prompt-chip {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  color: var(--ink);
  padding: 12px 14px;
  text-align: left;
  transition: border-color 160ms ease, background 160ms ease;
}

.prompt-chip:hover {
  background: var(--accent-soft);
  border-color: var(--accent);
}

.message {
  border-radius: 14px;
  padding: 14px 16px;
}

.message.user {
  background: var(--accent-soft);
  margin-left: auto;
  max-width: min(640px, 90%);
}

.message.assistant {
  background: var(--surface);
  border: 1px solid var(--border);
}

.message-meta {
  color: var(--muted);
  display: flex;
  font-size: 12px;
  justify-content: space-between;
  margin-bottom: 8px;
}

.agent-event {
  align-items: flex-start;
  background: var(--surface-muted);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--muted-strong);
  display: flex;
  gap: 9px;
  padding: 9px 10px;
}

.agent-event[data-kind="tool-result"] {
  background: var(--success-soft);
  color: var(--success);
}

.agent-event[data-kind="error"],
.agent-event[data-kind="detection"] {
  background: var(--danger-soft);
  color: var(--danger);
}

.agent-event-icon {
  display: inline-flex;
  padding-top: 1px;
}

.composer {
  align-items: flex-end;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  display: flex;
  gap: 10px;
  margin: 0 auto;
  max-width: 768px;
  padding: 10px;
}

.composer-input {
  background: transparent;
  border: 0;
  color: var(--ink);
  max-height: 160px;
  min-height: 40px;
  outline: 0;
  padding: 8px 4px;
  resize: none;
  width: 100%;
}

.notice {
  background: var(--warning-soft);
  border-bottom: 1px solid var(--border);
  color: var(--warning);
  font-size: 13px;
  padding: 8px 16px;
}

.retry-button {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--ink);
  display: inline-flex;
  gap: 8px;
  min-height: 38px;
  padding: 0 12px;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
```

- [ ] **Step 2: Update metadata and language**

Modify `layout.tsx`:

```tsx
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RedNote Agent",
  description: "Talk with the RedNote agent to shape Xiaohongshu content.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Run lint**

Run:

```bash
pnpm --filter @rednote/web-frontend lint
```

Expected: lint passes.

- [ ] **Step 4: Commit**

```bash
git add packages/web-frontend/src/app/globals.css packages/web-frontend/src/app/layout.tsx
git commit -m "style(web): apply rednote agent workspace design"
```

---

### Task 8: Verify Build And Manual MVP Behaviors

**Files:**
- Modify only if verification reveals a bug in files from prior tasks.

- [ ] **Step 1: Run lint**

Run:

```bash
pnpm --filter @rednote/web-frontend lint
```

Expected: pass.

- [ ] **Step 2: Run production build**

Run:

```bash
pnpm --filter @rednote/web-frontend build
```

Expected: pass.

- [ ] **Step 3: Start dev server**

Run:

```bash
pnpm --filter @rednote/web-frontend dev
```

Expected:

- Next.js starts on `http://localhost:3000` or another printed port.
- Keep the server running for browser verification.

- [ ] **Step 4: Browser verify empty state and responsive layout**

Open the local URL in Browser and verify:

- Page shows `今天要做哪条小红书内容？`.
- Sidebar shows `新对话` and `搜索对话`.
- Composer is visible at the bottom.
- At mobile width, sidebar collapses behind the menu.

- [ ] **Step 5: Browser verify missing config state**

Without `AGENT_MODEL_*` env vars, send `你好`.

Expected:

- User message remains visible.
- Assistant row shows an error containing the missing env vars.
- Retry button is visible.

- [ ] **Step 6: Browser verify local restore**

Refresh the page.

Expected:

- The conversation and message are still visible.
- Sidebar still lists the conversation derived from the first message.

- [ ] **Step 7: Browser verify real streaming if model config is available**

If local env has:

```env
AGENT_MODEL_BASE_URL=...
AGENT_MODEL_API_KEY=...
AGENT_MODEL_NAME=...
```

send:

```text
帮我把一个护肤选题拆成 3 个不同大纲
```

Expected:

- Assistant text streams.
- Agent activity rows appear if tools/retries/token events occur.
- Stop reason appears at the end.

If model config is not available, record that real streaming was not tested and keep the missing-config proof.

- [ ] **Step 8: Stop dev server**

Stop the running dev server before finishing unless the user asks to keep it alive.

- [ ] **Step 9: Commit fixes if needed**

If verification required changes:

Stage the implementation files changed during verification, then commit:

```bash
git add packages/web-frontend/src/app packages/web-frontend/package.json pnpm-lock.yaml
git commit -m "fix(web): complete agent workspace verification"
```

---

### Task 9: Run Impeccable Critique On The Implemented Page

**Files:**
- Create or update: `.impeccable/critique/*` if the critique persistence helper writes a snapshot.
- Modify implementation files only if critical visual defects are fixed immediately.

- [ ] **Step 1: Run detector on the implemented surface**

Run:

```bash
node /Users/szw/.agents/skills/impeccable/scripts/detect.mjs --json packages/web-frontend/src/app/page.tsx packages/web-frontend/src/app/agent-workspace
```

Expected:

- Either `[]` or actionable findings.
- Fix P0/P1 detector findings before continuing.

- [ ] **Step 2: Inspect the page in browser**

With dev server running, inspect:

- Desktop width around 1440px.
- Tablet width around 768px.
- Mobile width around 390px.

Expected:

- No text overflow.
- No incoherent overlap.
- Composer remains usable.
- Sidebar and dock do not trap content.
- State colors remain readable.

- [ ] **Step 3: Fix P0/P1 design defects**

If the critique finds high-priority issues, fix them immediately in the relevant UI/CSS files.

- [ ] **Step 4: Re-run lint and build**

Run:

```bash
pnpm --filter @rednote/web-frontend lint
pnpm --filter @rednote/web-frontend build
```

Expected: both pass.

- [ ] **Step 5: Commit final MVP**

```bash
git add packages/web-frontend .impeccable/critique pnpm-lock.yaml
git commit -m "feat(web): ship agent chat MVP"
```

---

## Self-Review

- Spec coverage: implements Phase 1 from `docs/gstack/2026-06-17-web-agent-chat-requirements.md`.
- Requirements covered: app shell, conversation creation, message sending, agent streaming, local persistence, error handling, accessibility, lint, build, and browser review.
- Explicitly out of scope: backend auth, backend persistence, admin model config integration, direct publishing, and full artifact editing.
- Package-name mismatch is handled first so root scripts and verification commands work.
- No task writes to the untracked `packages/backend/` directory.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-17-web-agent-chat-mvp.md`. Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - execute tasks in this session using executing-plans, batch execution with checkpoints.
