# Web Agent Chat Impeccable Review

Date: 2026-06-17

Target reviewed:

- Requirements: `docs/gstack/2026-06-17-web-agent-chat-requirements.md`
- Design: `docs/gstack/2026-06-17-web-agent-chat-frontend-design.md`
- Implementation: `packages/web-frontend/src/app/page.tsx`
- Components: `packages/web-frontend/src/app/agent-workspace/`
- API route: `packages/web-frontend/src/app/api/agent/chat/route.ts`
- Styles: `packages/web-frontend/src/app/globals.css`

Review basis:

- Product register from `PRODUCT.md`.
- Impeccable product-register guidance for restrained tool UI.
- Deterministic detector:
  `node /Users/szw/.agents/skills/impeccable/scripts/detect.mjs --json packages/web-frontend/src/app/page.tsx packages/web-frontend/src/app/agent-workspace packages/web-frontend/src/app/globals.css`
- Browser smoke review against `http://localhost:3000`.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---:|---:|---|
| 1 | Visibility of System Status | 4 | Agent event rows, retry rows, stop control, and right-side activity dock make state visible. |
| 2 | Match System / Real World | 3 | The empty state and system prompt speak to Xiaohongshu content work. Structured artifact editing remains a later phase. |
| 3 | User Control and Freedom | 4 | Users can create conversations, switch sessions, stop a run, retry after failure, and refresh without losing local work. |
| 4 | Consistency and Standards | 4 | The shell uses standard side rail, central transcript, bottom composer, semantic buttons, and consistent icon vocabulary. |
| 5 | Error Prevention | 3 | Empty submissions are blocked and model setup guidance is explicit. Tool permission prompts are intentionally later phase. |
| 6 | Recognition Rather Than Recall | 4 | Starter prompts, local session rail, visible events, and setup copy reduce recall burden. |
| 7 | Flexibility and Efficiency | 3 | Enter-to-send, Shift+Enter newline, search, stop, and retry cover MVP efficiency. Power shortcuts are later. |
| 8 | Aesthetic and Minimalist Design | 4 | Restrained palette, compact event rows, and status-focused dock avoid generic card-heavy or marketing UI. |
| 9 | Error Recovery | 4 | Missing model configuration preserves the user message and shows retry plus exact `.env.local` guidance. |
| 10 | Help and Documentation | 3 | Package README documents setup and env vars; inline setup copy is present. Rich onboarding can wait. |
| **Total** | | **36/40** | Strong MVP product shell with clear Phase 1 boundaries. |

## Anti-Patterns Verdict

The implemented workspace no longer looks like a starter Next page or a generic landing page. It borrows the reliable parts of ChatGPT's shell pattern (history rail, centered first action, fixed composer) while making RedNote-specific work visible through starter prompts, compact agent activity rows, and the context dock.

AI slop scan:

```json
[]
```

No detector issues were found in the page, workspace components, or global styles. The UI avoids gradient text, decorative glass, nested cards, side-stripe accents, oversized rounded panels, and repeated marketing-card scaffolds.

## Browser Evidence

The browser smoke review verified:

- Initial workspace renders the conversation rail, RedNote empty state, disabled empty send button, and desktop agent dock.
- Sending a starter prompt reaches `/api/agent/chat` and shows a setup-oriented missing-model error.
- Missing-model copy names `packages/web-frontend/.env.local`, `AGENT_MODEL_BASE_URL`, `AGENT_MODEL_API_KEY`, `AGENT_MODEL_NAME`, and warns not to use `NEXT_PUBLIC_`.
- Retry remains visible after failure and the user message is preserved.
- Reload restores the latest local conversation.
- Mobile width hides the desktop rail and dock, shows the menu button, and opens a 280px conversation drawer.
- Browser console showed no error or warning entries during the smoke review.

Visual overlay injection was not used for this review. The available Browser surface documents Playwright `evaluate` as read-only, so the live detector overlay mutation path is not a reliable signal here. The deterministic detector and browser DOM/runtime checks were used instead.

## What's Working

1. The MVP has the right shape for a content operations workspace: side rail for recovery, transcript for conversation, and a dock for agent activity.
2. The local-first boundary is clear in both UI and docs. Users are told conversations are browser-local and credentials stay server-side.
3. Agent work is inspectable without taking over the transcript. Tool, retry, detection, token, stop, and error events have compact rows.

## Priority Issues

### P2: Model setup could become more actionable

Why it matters: The setup error now names the env vars, but a later polish pass could make first-run setup even faster.

Fix: Add a small setup panel or help link in the empty state when env vars are missing, once there is a stable docs route or project settings screen.

Suggested command: `$impeccable onboard packages/web-frontend/src/app/page.tsx`

### P2: Activity dock is status-only in Phase 1

Why it matters: The dock distinguishes RedNote from generic chat, but it will matter more when outline candidates and draft artifacts exist.

Fix: In Phase 3, promote generated outlines, draft previews, references, and publish checks into the dock instead of adding more inline transcript noise.

Suggested command: `$impeccable shape packages/web-frontend/src/app/agent-workspace/components.tsx`

### P3: Power-user efficiency is intentionally basic

Why it matters: Search, Enter-to-send, retry, and stop are enough for MVP, but repeated creator workflows will eventually benefit from shortcuts and structured actions.

Fix: Add command shortcuts only after durable conversations and artifact editing exist, so the shortcut vocabulary maps to real work.

Suggested command: `$impeccable harden packages/web-frontend/src/app/agent-workspace/components.tsx`

## Persona Red Flags

### First-time creator

The first action is clear: the empty state asks what Xiaohongshu content to make and offers concrete starter prompts. Remaining risk is model setup; the new error copy names the exact `.env.local` file and variables.

### Power user

Tool activity is visible, and stop/retry controls are present. Remaining risk is lack of keyboard shortcuts beyond Enter and Shift+Enter, which is acceptable for Phase 1.

### Mobile operator

The mobile shell prioritizes transcript and composer, with the conversation rail behind a menu. The desktop dock is hidden on mobile, which keeps the primary chat loop usable.

## Questions Skipped

Questions skipped because the remaining issues are later-phase polish, not blockers for the requested MVP:

- Setup guidance is now visible and documented.
- Artifact editing belongs to Phase 3 per requirements.
- Power-user shortcuts can wait until workflows are more structured.

## Recommended Actions

1. Ship the Phase 1 MVP as the current baseline.
2. Use Phase 2 for durable conversations and backend integration.
3. Use Phase 3 to make the context dock artifact-driven: outlines, drafts, references, and publish checklist.
4. Re-run `$impeccable critique packages/web-frontend/src/app/page.tsx` after Phase 3 artifact editing lands.

## Run Notes

- Target slug: `packages-web-frontend-src-app-page-tsx`.
- Ignore list: none present.
- Assessment independence: degraded, sub-agent permission was not available in this continuation; review was run sequentially.
- CLI detector: passed with `[]`.
- Browser visibility: background Browser smoke review completed against `http://localhost:3000`.
- Overlay injection: skipped because Browser `evaluate` is documented as read-only in this surface.
- Live-server cleanup: not needed.
- Temp-file cleanup: not needed.
