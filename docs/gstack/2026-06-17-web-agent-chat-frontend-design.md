# Web Agent Chat Frontend Design

Date: 2026-06-17

Skill basis:

- `frontend-design`: distinctive production-grade frontend direction.
- `impeccable` product register: restrained product UI, standard affordances, visible states, no decorative excess.
- ChatGPT reference: conversation shell, persistent history, centered empty state, fixed composer.

## 1. Design Brief

Build a Next.js agent conversation workspace for RedNote. The page is not a landing page and not a generic prompt box. It is a creator operations desk where the user talks with an agent, watches the agent work, and gradually turns conversation into Xiaohongshu content artifacts.

Primary user action: send an instruction to the RedNote agent and understand what happened while it answered.

## 2. Visual Direction

### Register

Product UI. The interface serves repeated work.

### Scene sentence

A content operator is working in a bright afternoon office, comparing possible Xiaohongshu angles while an agent researches and drafts beside them.

This points to a light, crisp interface with restrained color, strong text legibility, and low visual fatigue.

### Color strategy

Restrained with one committed accent:

- Base: neutral white and cool gray surfaces.
- Ink: high-contrast near-black text.
- Accent: RedNote red for primary action, current selection, and active agent state.
- Secondary accent: quiet green only for successful tool/result states.
- Warning/error: amber/red semantic states only.

Use OKLCH tokens in implementation so contrast and state ramps are predictable.

### Typography

Use one tuned sans family for UI. Product UI should not use expressive display fonts for labels or message text. Existing Geist can stay for MVP; later we can evaluate whether it should move to a system stack for Chinese readability.

## 3. Layout Strategy

### Desktop

Use a three-zone shell:

1. Left conversation rail.
2. Center chat thread and composer.
3. Right context dock for agent activity and future artifacts.

The right dock should be visible on desktop but not mandatory for the MVP. If implementation time is tight, agent activity can live inline in the center thread, but the design should reserve the pattern for a dock because RedNote will need outline and draft artifacts later.

```text
┌────────────────┬────────────────────────────────────┬──────────────────────┐
│ conversation   │ chat thread                         │ context dock          │
│ rail           │                                    │ agent work / drafts   │
│                │ empty state or messages             │                      │
│                │                                    │                      │
│                │ composer fixed near bottom          │                      │
└────────────────┴────────────────────────────────────┴──────────────────────┘
```

### Mobile

Use one column:

- Top bar with menu, conversation title, and new chat.
- Chat thread.
- Composer fixed at bottom.
- Activity/artifacts open as a sheet or inline expandable sections.

## 4. Component Model

### `AgentWorkspaceShell`

Owns the full page layout and responsive zones.

Responsibilities:

- Sidebar visibility.
- Active conversation.
- Main landmark structure.
- Mobile top bar.

### `ConversationRail`

Purpose: recover and switch work.

Contains:

- New chat button.
- Search input.
- Recent conversation list.
- Status footer for local persistence and model config.

States:

- Empty history.
- Active item.
- Search with no results.
- Disabled while a new conversation is being created.

### `ChatThread`

Purpose: show user messages, assistant text, and important agent events.

Contains:

- Empty state.
- User message bubbles.
- Assistant response blocks.
- Agent event rows.
- Error rows.

Behavior:

- New messages append at bottom.
- Streaming answer updates in place.
- Auto-scroll only when the user is already near the bottom.
- If the user scrolls up, show a "jump to latest" control.

### `AgentEventRow`

Purpose: make the agent's work inspectable without overwhelming the transcript.

Event display:

- Tool call: icon, tool name, compact input preview.
- Tool result: tool name, output preview, expandable details.
- Retry: attempt number and delay.
- Detection: warning or critical state.
- Token usage: compact cost/budget note.
- Stop: plain reason.

### `Composer`

Purpose: capture instructions.

Contains:

- Multiline textarea.
- Send button.
- Stop button during streaming.
- Optional quick-start chips in empty state, not inside the composer after work begins.

Behavior:

- Enter sends.
- Shift+Enter inserts newline.
- Empty input is disabled.
- During streaming, send changes to stop.
- Failed sends allow retry.

### `ContextDock`

Purpose: make RedNote different from a generic chat product.

MVP contents:

- Current agent status.
- Latest tool activity.
- Local session summary.

Later contents:

- Generated outlines.
- Draft preview.
- Reference sources.
- Publish checklist.

## 5. Empty State

The empty state should be centered in the main workspace like ChatGPT's first-run prompt, but RedNote-specific:

- Title: `今天要做哪条小红书内容？`
- Short support line: `告诉 agent 你的选题、账号定位或参考方向。它会边思考边展示工作过程。`
- Suggested prompts:
  - `帮我把一个护肤选题拆成 3 个不同大纲`
  - `研究这个账号的爆款结构，再给我新选题`
  - `把这段想法改成适合小红书的发布包`

Do not use marketing copy. The empty state should teach the first action.

## 6. Interaction Flow

### Start

1. User lands on the workspace.
2. If local conversations exist, restore the latest one.
3. If none exist, show empty state and composer.

### Send

1. User enters an instruction.
2. User presses Enter or send.
3. UI appends the user message.
4. UI creates a pending assistant response and begins reading the stream.
5. Text deltas append to the assistant response.
6. Tool and status events appear as compact activity rows.
7. Stop event closes the response.

### Error

1. Error row appears below the relevant message.
2. User message remains.
3. Retry action sends the same message again.
4. Setup errors link to local environment instructions.

## 7. Key States

- First-run empty state.
- Existing local conversation.
- Streaming response.
- Tool call in progress.
- Tool result ready.
- Retry/backoff.
- Agent stopped by user.
- Agent stopped by budget or loop detection.
- Missing model config.
- Network error.
- Corrupt local storage.
- Mobile sidebar open.
- Reduced motion.

## 8. Accessibility And Responsiveness

Implementation requirements:

- Use semantic `aside`, `main`, `section`, and `form` landmarks.
- Label icon-only buttons.
- Keep tap targets at least 44px on mobile.
- Keep body text contrast at WCAG AA.
- Preserve focus rings.
- Use `aria-live="polite"` for streaming status, not for every token.
- Respect `prefers-reduced-motion`.
- Ensure Chinese text wraps in message bubbles, event rows, and buttons.

## 9. MVP Copy

Suggested labels:

- New chat: `新对话`
- Search: `搜索对话`
- Composer input hint: `问 RedNote agent...`
- Send: `发送`
- Stop: `停止`
- Retry: `重试`
- Activity dock title: `Agent 工作`
- Empty history: `还没有对话`
- Missing config: `需要配置模型后才能运行 agent`

## 10. Implementation Notes

- Keep `page.tsx` as the coordinator only if possible. Move components under `packages/web-frontend/src/app/agent-workspace/`.
- Do not put UI cards inside other cards.
- Use stable dimensions for sidebar, composer, icon buttons, and event rows to avoid layout shifts.
- Avoid decorative gradients, glass cards, huge rounded panels, and generic SaaS hero patterns.
- If icons are introduced, add `lucide-react` and use it consistently.
- Keep global CSS for tokens and body behavior; put layout mostly in components with Tailwind utilities.

## 11. Design References To Use During Implementation

- `impeccable/reference/product.md` for product UI restraint.
- `impeccable/reference/layout.md` for shell layout and hierarchy.
- `impeccable/reference/interaction-design.md` for composer and streaming controls.
- `impeccable/reference/adapt.md` for mobile collapse behavior.
- `impeccable/reference/clarify.md` for errors and setup copy.

## 12. Frontend-Design Position

The memorable part of this UI should not be visual spectacle. The product should be remembered for making agent work visible and editable:

- User sees the answer.
- User sees the work behind the answer.
- User can turn work into RedNote artifacts.

That is the product identity. The visual system should stay sharp, calm, and operational.
