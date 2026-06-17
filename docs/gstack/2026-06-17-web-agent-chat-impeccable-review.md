# Web Agent Chat Impeccable Review

Date: 2026-06-17

Target reviewed:

- Requirements: `docs/gstack/2026-06-17-web-agent-chat-requirements.md`
- Design: `docs/gstack/2026-06-17-web-agent-chat-frontend-design.md`
- Current implementation evidence: `packages/web-frontend/src/app/page.tsx`

Scope note: this is a design-stage review. There is not yet an implemented agent workspace to inspect in browser. The current page is the default Next.js template, so live visual critique of the intended interface would be misleading. Detector check was run against the current `page.tsx` and returned no issues, but that only means the starter page did not trigger the detector. It does not prove the future design.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---:|---:|---|
| 1 | Visibility of System Status | 3 | Agent events, retries, stop reasons, and model config states are specified. Needs implementation proof. |
| 2 | Match System / Real World | 3 | Xiaohongshu creator language is present. Needs artifact examples in the UI. |
| 3 | User Control and Freedom | 3 | New chat, stop, retry, local restore, and later editable artifacts are planned. |
| 4 | Consistency and Standards | 3 | Standard chat shell and product controls are used. Must keep icon/button vocabulary consistent. |
| 5 | Error Prevention | 3 | Empty-send blocking and missing config states are planned. Tool permission prevention is later phase. |
| 6 | Recognition Rather Than Recall | 3 | Sidebar, activity rows, and empty-state prompt chips reduce recall. |
| 7 | Flexibility and Efficiency | 2 | MVP has basic keyboard behavior. Power-user shortcuts and command palette are later. |
| 8 | Aesthetic and Minimalist Design | 3 | Restrained product UI is appropriate. Right dock may overload MVP if not disciplined. |
| 9 | Error Recovery | 3 | Retry and preserved user messages are specified. Needs concrete retry UI. |
| 10 | Help and Documentation | 2 | Missing-model setup is named, but local env guidance must be visible. |
| **Total** | | **28/40** | Solid design plan, not yet proven in code. |

## Anti-Patterns Verdict

The design avoids the biggest AI slop risks: no landing-page hero, no generic card grid, no purple-blue gradient shell, no decorative glass surfaces, and no hidden black-box agent. It also avoids the easiest ChatGPT clone failure by giving RedNote a context dock and future artifact surface.

Primary risk: the MVP could still become "ChatGPT with a red button" if the agent activity rows and RedNote-specific empty state are treated as optional polish. They are not polish. They are the differentiator.

Detector result:

```json
[]
```

This detector result is low-value because the current file is still the starter page. Re-run `impeccable critique` after the workspace is implemented and running in the browser.

## What's Working

1. The phase split is right. Phase 1 proves the agent loop without waiting for backend auth and durable persistence.
2. The UI structure borrows the reliable parts of ChatGPT while reserving RedNote-specific space for agent work and artifacts.
3. The stream event schema maps cleanly to the existing `AgentLoopEvent` surface, so the UI can show real agent behavior instead of inventing fake progress states.

## Priority Issues

### P1: Current implementation contradicts the product goal

Why it matters: `packages/web-frontend/src/app/page.tsx` still shows the default Next template. A user cannot infer RedNote, agent chat, or creator workflow from the current app.

Fix: Phase 1 must replace the starter template with the workspace shell before any deeper workflow work.

Suggested command: `$impeccable craft packages/web-frontend/src/app/page.tsx`

### P1: Agent activity can become noisy

Why it matters: Showing every low-level event inline can make the conversation harder to read than a plain chat app.

Fix: Render text in the transcript, render tool/status events as compact grouped rows, and move detailed activity into the dock or expandable details.

Suggested command: `$impeccable layout packages/web-frontend/src/app/page.tsx`

### P1: Missing-model setup needs a first-class state

Why it matters: The first local run may fail because `AGENT_MODEL_*` variables are missing. If that appears as a generic error, users will think the product is broken.

Fix: Add a dedicated setup state with the exact required variables and a short explanation that keys stay server-side.

Suggested command: `$impeccable clarify packages/web-frontend/src/app/page.tsx`

### P2: The right dock could overload the MVP

Why it matters: Three-pane layouts are powerful on desktop but can turn the MVP into a dashboard before the primary chat loop is proven.

Fix: In Phase 1, keep the right dock narrow and status-focused. Save outline and draft artifact editing for Phase 3 unless implementation stays clean.

Suggested command: `$impeccable distill packages/web-frontend/src/app/page.tsx`

### P2: Local persistence needs visible trust cues

Why it matters: If conversations are only local, users need to know what is saved and what is not. Silent browser-only storage can create false expectations.

Fix: Add a small sidebar footer or status line: local only, saved this browser, setup required for cross-device sync in later phase.

Suggested command: `$impeccable clarify packages/web-frontend/src/app/page.tsx`

## Persona Red Flags

### First-time creator

Risk: If the empty state says only "Ask anything," the user may not understand what RedNote agent is best at.

Required fix: Keep RedNote-specific suggested prompts in the empty state and tie them to Xiaohongshu workflows.

### Power user

Risk: If tool calls are hidden, the user cannot debug why an answer is slow, expensive, or wrong.

Required fix: Show compact agent event rows and stop/token state from the first MVP.

### Mobile operator

Risk: A three-zone desktop layout can collapse poorly and bury the composer.

Required fix: Mobile must prioritize transcript and composer. Sidebar and activity dock become temporary panels or inline expanders.

## Questions Skipped

Questions skipped because the user already gave the strategic direction:

- Build `web-frontend` as a Next.js app that talks to agent.
- Use gstack to produce requirements.
- Use ChatGPT as a reference.
- Design with `frontend-design`.
- Review with `impeccable`.

The remaining decisions are implementation-level and should be handled in the Phase 1 plan.

## Recommended Actions

1. Create a Phase 1 implementation plan for the MVP agent workspace.
2. Implement the shell and streaming route in `packages/web-frontend`.
3. Run `pnpm --filter @rednote/web-frontend lint`.
4. Run `pnpm --filter @rednote/web-frontend build`.
5. Start the local Next server and run a browser-based impeccable critique against the real page.
