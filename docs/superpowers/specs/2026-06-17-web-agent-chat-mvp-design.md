# Web Agent Chat MVP Design

Date: 2026-06-17

## Goal

Turn `packages/web-frontend` into a Next.js workspace where users can converse with the RedNote agent. The MVP should prove the chat-to-agent loop, streaming UI, local session recovery, and agent activity visibility before adding full backend persistence or Xiaohongshu artifact editing.

## Current Context

`web-frontend` is currently a default Next app. `@rednote/agent` already exposes `agentLoop`, `ToolRegistry`, and event types that can support a streaming UI. Product guidance in `PRODUCT.md` says RedNote must feel like a content editing workstation, not a generic AI chat page.

## Recommended Approach

Build a local-first Next.js agent workspace.

The browser renders the chat shell and stores MVP conversations locally. A Next.js route handler runs server-side agent code and streams normalized agent events back to the browser. This keeps model credentials and tool execution out of the browser while avoiding a dependency on full backend auth and persistence for the first milestone.

## Information Architecture

### Conversation Rail

Purpose: recover work and switch local conversations.

Contains:

- New chat.
- Search conversations.
- Recent conversations.
- Local persistence status.
- Model setup status.

### Chat Workspace

Purpose: the primary conversation surface.

Contains:

- Empty state with RedNote-specific starter prompts.
- User messages.
- Assistant streaming responses.
- Compact agent activity rows.
- Error and retry rows.
- Composer fixed near the bottom.

### Context Dock

Purpose: show agent work and reserve space for future RedNote artifacts.

MVP contents:

- Current run status.
- Latest tool activity.
- Token/cost note when available.

Later contents:

- Outline candidates.
- Draft preview.
- Reference sources.
- Publish checklist.

## Component Boundaries

### `AgentWorkspaceShell`

Owns responsive shell layout, sidebar state, active conversation, and page-level landmarks.

### `ConversationRail`

Owns local conversation navigation. It should not know how agent streaming works.

### `ChatThread`

Owns message and event rendering. It should accept normalized display data instead of raw network chunks.

### `AgentEventRow`

Owns compact rendering for tool, retry, detection, token, and stop events.

### `Composer`

Owns text entry, keyboard behavior, send, stop, and disabled states.

### `useAgentConversation`

Client hook that owns local conversation state, fetch streaming, abort, retry, local persistence, and stream parsing.

### `app/api/agent/chat/route.ts`

Server route that validates input, constructs agent runtime config, runs `agentLoop`, normalizes events, and streams them to the browser.

## Data Flow

### Sending a Message

1. User submits a non-empty composer value.
2. Client appends the user message locally.
3. Client creates a pending assistant message.
4. Client calls `/api/agent/chat`.
5. Route handler runs the agent loop.
6. Streamed events update the pending assistant message and activity list.
7. Stop or error closes the run.
8. Client persists the updated conversation locally.

### Restoring Work

1. Client reads local conversation storage on mount.
2. Valid data restores recent conversations and active conversation id.
3. Invalid data is ignored and a reset notice is shown.

### Error Recovery

1. User message remains visible.
2. Error event appears in the thread.
3. Retry action resends the same message.
4. Missing model configuration shows a setup state rather than a generic failure.

## MVP Requirements

- Desktop: conversation rail, chat workspace, optional status dock.
- Mobile: top bar, chat workspace, bottom composer, rail/dock as panels.
- Streaming: render text deltas and compact agent events.
- Controls: send, stop, retry, new chat.
- Persistence: local browser storage.
- Setup: visible missing-model guidance.
- Verification: lint and build pass.

## Out Of Scope

- Backend conversation persistence.
- User auth.
- Cross-device sync.
- Admin model config integration.
- Full Xiaohongshu artifact editing.
- Direct publishing.
- Team collaboration.

## Styling Direction

Use a restrained product UI:

- Light neutral base.
- High-contrast text.
- RedNote red as primary accent.
- Semantic colors only for state.
- No landing hero.
- No decorative gradient text.
- No generic card grid.
- No hidden black-box progress.

## Testing Strategy

MVP implementation should include at least:

- Unit tests or focused pure tests for stream parsing and local storage validation if a test setup exists.
- Manual browser verification for send, stream, stop, retry, refresh restore, and mobile layout.
- `pnpm --filter @rednote/web-frontend lint`.
- `pnpm --filter @rednote/web-frontend build`.

## Implementation Sequence

1. Add shared message/event types and local storage helpers.
2. Add the API route that streams normalized agent events.
3. Add the client hook for send, stream parsing, abort, retry, and persistence.
4. Replace the starter page with the workspace shell.
5. Add responsive states and setup/error copy.
6. Run lint, build, and browser review.

## Self-Review

- No unresolved placeholders remain.
- MVP is small enough to implement independently.
- Later backend persistence is not mixed into Phase 1.
- The design avoids a plain ChatGPT clone by making agent activity and RedNote starter prompts first-class.
