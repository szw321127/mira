# Web Agent Chat Requirements

Date: 2026-06-17

## 1. Context

`packages/web-frontend` is currently a fresh Next.js app shell. The product target is to turn it into a Next.js product surface where users can talk with the RedNote agent, see what the agent is doing, and gradually turn the conversation into Xiaohongshu-ready outlines, drafts, and publishable material.

Current evidence:

- `packages/web-frontend/src/app/page.tsx` is still the default Next template.
- `packages/agent/src/index.ts` exports `agentLoop`, `ToolRegistry`, and `SessionStore`.
- `packages/agent/src/loop/index.ts` already streams `AgentLoopEvent` values including text deltas, tool calls, tool results, retry events, token usage, detection warnings, and stop reasons.
- `PRODUCT.md` says RedNote should feel like an editing workstation, not a generic AI chat box.

ChatGPT is useful as a product reference for the shell pattern: persistent conversation history, central empty state, bottom composer, and a lightweight interaction model. RedNote should not copy the product voice. It should expose agent work and Xiaohongshu editing decisions more clearly than a plain chat transcript.

## 2. Users

### Primary user

Small-team Xiaohongshu creators and operators who start with a loose idea and need a focused agent to help research, outline, draft, revise, and prepare publishable content.

### Secondary user

Power users who already understand prompt-driven workflows and want to inspect agent actions, tool calls, and cost signals instead of waiting behind a black box.

## 3. Product Goal

The web frontend should become an agent conversation workspace:

1. The user opens a Next.js app and starts a conversation with the RedNote agent.
2. The user can send instructions, see streaming agent output, and understand intermediate agent activity.
3. The user can keep or resume recent local conversations.
4. The agent conversation can later become the entry point for RedNote's outline, draft, reference, and publishing workflows.

## 4. Non-Goals For MVP

The first phase should not include:

- Production authentication.
- Cross-device conversation sync.
- Admin model configuration UI.
- Direct Xiaohongshu publishing.
- Full backend conversation persistence.
- Complex MCP marketplace management.
- Team collaboration, sharing, billing, or workspace roles.

These are later phases. The MVP should prove the chat-to-agent loop and product shell first.

## 5. Phased Delivery

### Phase 0: Requirements and Design

Deliverables:

- This requirements document.
- A frontend design document for the Next.js agent workspace.
- An impeccable review of the design before implementation.

Done when:

- MVP scope is explicit.
- Later phases are named.
- Page layout, states, API boundaries, and review risks are documented.

### Phase 1: MVP Agent Conversation Workspace

Goal: users can talk with the local RedNote agent from `web-frontend`.

Required capabilities:

- Replace the default Next template with a production-shaped chat workspace.
- Add a local conversation sidebar with new chat, search/filter, and recent sessions.
- Add a central chat stream with user messages, assistant responses, and agent event rows.
- Add a bottom composer with multiline input, send, stop, and disabled/loading states.
- Add a Next.js route handler that wraps `@rednote/agent` on the server side and streams events to the browser.
- Store MVP conversations in browser storage so refresh does not erase the visible session.
- Surface tool calls, tool results, retries, token usage, and stop reasons as inspectable timeline events.
- Provide empty, loading, error, offline, and no-model-config states.

Acceptance criteria:

- Opening `packages/web-frontend` shows the RedNote agent workspace, not the Next starter page.
- Sending a non-empty message appends a user message and begins a streamed agent response.
- Streaming text appears incrementally.
- Tool calls and tool results are visible as compact activity rows, not hidden.
- Empty submissions are blocked.
- Network or model errors leave the user message intact and show a retry action.
- Refreshing the page restores the latest local conversation.
- The MVP can run with documented local environment variables.
- `pnpm --filter @rednote/web-frontend lint` passes.
- `pnpm --filter @rednote/web-frontend build` passes.

### Phase 2: Durable Conversations and Backend Integration

Goal: preserve agent sessions across devices and connect them to the existing RedNote backend.

Required capabilities:

- Persist conversations, messages, and agent events in backend storage.
- Attach conversations to authenticated users.
- Reuse existing auth/session behavior when backend is present.
- Store agent session ids and compacted context metadata.
- Expose conversation list, rename, delete, and restore through backend APIs.
- Keep local-only fallback for development when backend is unavailable.

Acceptance criteria:

- A logged-in user can reopen conversations after a different browser session.
- Deleting a conversation removes messages and event logs for that user only.
- Backend errors fall back to a clear recovery path, not silent data loss.

### Phase 3: RedNote Creation Workflows Inside Chat

Goal: make the chat produce RedNote artifacts, not just prose.

Required capabilities:

- Let the agent create outline candidates as structured artifacts.
- Let users pin, edit, and compare outlines outside the transcript.
- Let the agent generate publish packages from selected outlines.
- Show a draft/outline side panel that updates from agent output.
- Support reference import and research results as first-class conversation context.

Acceptance criteria:

- Agent-created outlines can be selected and edited.
- A publish package can be generated from the selected outline.
- Users can copy title,正文, tags, and complete publish text.
- The chat transcript explains why artifacts changed.

### Phase 4: Advanced Agent Operations

Goal: make the workspace trustworthy for long-running, tool-heavy work.

Required capabilities:

- Tool permission prompts and allow/deny history.
- Rich tool result previews.
- Cost and token budget controls.
- Agent memory controls.
- Exportable run logs.
- Human approval gates for risky actions.

Acceptance criteria:

- Users understand what the agent can do before a tool runs.
- Long runs have progress, budget, and stop controls.
- Run logs can be reviewed after completion.

## 6. MVP Functional Requirements

### REQ-MVP-001 App shell

The app must render an authenticated-product-style workspace without requiring authentication.

Acceptance:

- Desktop layout has a conversation sidebar and a main chat workspace.
- Mobile layout collapses the sidebar behind a menu button.
- The first viewport shows the product itself, not a landing page.

### REQ-MVP-002 Conversation creation

The user must be able to start a new local conversation.

Acceptance:

- New conversation clears the composer and creates an empty chat stream.
- Existing conversations remain available in the sidebar.
- Conversation titles derive from the first user message until renamed in a later phase.

### REQ-MVP-003 Message sending

The user must be able to send a message to the agent.

Acceptance:

- Empty or whitespace-only messages cannot be sent.
- Shift+Enter inserts a newline.
- Enter sends when the composer is focused.
- The sent message remains visible if streaming fails.

### REQ-MVP-004 Agent streaming

The browser must consume a stream of agent events from a Next.js route handler.

Acceptance:

- `text-delta` events append assistant text.
- `tool-call` events create activity rows with tool name and compact input preview.
- `tool-result` events update the matching activity row or add a result row.
- `retry`, `detection`, `token-cost`, `token-usage`, and `stop` events are visible.
- Unknown event types are rendered as diagnostic rows instead of breaking the stream.

### REQ-MVP-005 Local persistence

MVP conversations must survive refresh.

Acceptance:

- Conversations are stored in localStorage or IndexedDB.
- The latest conversation is restored on load.
- Corrupt local data is ignored with a visible reset path.

### REQ-MVP-006 Error handling

The app must explain failures without losing user work.

Acceptance:

- Missing model configuration shows a setup-oriented empty state.
- Network failures show retry and keep the user message.
- Agent runtime errors show a concise error row.
- Stop reasons are explicit: done, max step, token budget, loop detection, or user stopped.

### REQ-MVP-007 Accessibility

The MVP must meet basic product accessibility expectations.

Acceptance:

- Main landmarks are semantic.
- Composer and buttons are keyboard reachable.
- Focus states are visible.
- Body text contrast targets WCAG AA.
- Motion respects `prefers-reduced-motion`.

## 7. Technical Direction

### Recommended MVP architecture

Use `web-frontend` as the MVP host:

- Client UI: React components under `packages/web-frontend/src/app`.
- Server boundary: Next.js route handler under `packages/web-frontend/src/app/api/agent/chat/route.ts`.
- Agent runtime: import `agentLoop`, `ToolRegistry`, and core tools from `@rednote/agent` on the server side only.
- Streaming protocol: Server-Sent Events or newline-delimited JSON over `fetch` streaming.

This keeps API keys and tool execution out of the browser while avoiding a full backend dependency for the first proof.

### Event schema

The MVP stream should normalize `AgentLoopEvent` into browser-safe events:

```ts
type AgentStreamEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; id: string; toolName: string; inputPreview: string }
  | { type: "tool-result"; id: string; toolName: string; outputPreview: string }
  | { type: "retry"; attempt: number; maxRetries: number; delayMs: number; error: string }
  | { type: "detection"; level: "warning" | "critical"; message: string }
  | { type: "token-cost"; detail: string; cost: string }
  | { type: "token-usage"; totalTokens: number; tokenBudget: number; percent: string }
  | { type: "stop"; reason: string; message?: string }
  | { type: "error"; message: string };
```

### Configuration

MVP should document these variables:

- `AGENT_MODEL_BASE_URL`
- `AGENT_MODEL_API_KEY`
- `AGENT_MODEL_NAME`
- `AGENT_MAX_STEPS`

Later phases can replace these with backend/admin model config.

## 8. Design Requirements

- The UI should feel like a focused content operations workstation.
- Do not use a marketing hero.
- Do not make a generic ChatGPT clone.
- Borrow the useful shell pattern from ChatGPT: left history, central thread, bottom composer.
- Add RedNote-specific surfaces: agent activity, content artifacts, and later outline/draft docks.
- Keep the palette restrained with a sharp RedNote accent.
- Show agent work instead of hiding it.

## 9. Risks

- If MVP copies ChatGPT too literally, RedNote loses its creator-workbench identity.
- If all agent events are dumped into the transcript, the interface becomes noisy.
- If tool execution is hidden, users cannot trust the agent.
- If Phase 1 depends on full backend auth and persistence, the first usable milestone becomes too large.
- If local persistence is vague, refreshes will feel broken even when the agent works.

## 10. Completion Evidence For Phase 1

Required proof:

- Source files implement the workspace shell and API route.
- Manual test: send one message and receive streaming output.
- Manual test: refresh restores the conversation.
- Manual test: simulated route error shows retry and preserves input.
- `pnpm --filter @rednote/web-frontend lint` passes.
- `pnpm --filter @rednote/web-frontend build` passes.
