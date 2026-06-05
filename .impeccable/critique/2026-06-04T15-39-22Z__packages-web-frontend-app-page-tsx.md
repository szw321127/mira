---
target: packages/web-frontend/app/page.tsx
total_score: 23
p0_count: 0
p1_count: 2
timestamp: 2026-06-04T15-39-22Z
slug: packages-web-frontend-app-page-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Step rail helps, but generation has no loading, pending, or dirty-state feedback. |
| 2 | Match System / Real World | 3 | The outline-to-post model matches the creator workflow; English kickers and heavy editorial staging dilute task clarity. |
| 3 | User Control and Freedom | 3 | Editing and batch regeneration exist, but there is no undo or warning before losing edited outlines. |
| 4 | Consistency and Standards | 2 | Buttons, badges, kickers, cards, and shadows compete instead of forming one product vocabulary. |
| 5 | Error Prevention | 1 | Empty prompt, edited-outline loss, and regenerate/destructive actions are not guarded. |
| 6 | Recognition Rather Than Recall | 3 | The 3-step flow and editable fields are visible; all three outlines expanded at once increases scanning effort. |
| 7 | Flexibility and Efficiency | 2 | No copy, export, save, keyboard, or fast reuse path for frequent creators. |
| 8 | Aesthetic and Minimalist Design | 2 | Strong concept, but decoration consumes too much of a product task surface. |
| 9 | Error Recovery | 1 | No recovery for cleared drafts, bad prompts, accidental batch changes, or failed generation. |
| 10 | Help and Documentation | 2 | Labels are clear, but empty and generated states do not teach the next best action. |
| **Total** | | **23/40** | **Promising prototype, overloaded product UI** |

## Anti-Patterns Verdict

**Does this look AI-generated?** Not in the default SaaS-template way. The editorial desk concept is memorable and specific to content creation. But it still has several Codex/AI tells: decorative grid backgrounds, wide soft shadows on bordered panels, repeated tiny uppercase section labels, and one deterministic side-tab border violation.

**LLM assessment**: The interface has a strong mood, but it is currently more poster than tool. For a product workflow, the huge display headline and decorative panels delay the user's primary job: compare 3 outlines, edit one, generate a post. The selected outline, draft state, and destructive actions need clearer product behavior.

**Deterministic scan**: 1 finding.

- `side-tab` warning in `packages/web-frontend/app/globals.css:511`: `border-left: 3px solid var(--red)`. This is the thick one-sided accent border banned by Impeccable.

**Visual overlays**: No reliable user-visible overlay is available. Browser mutation preflight failed because the current Browser Playwright evaluate surface is read-only and could not set `document.title` or append a script.

## Overall Impression

The idea is good: it feels like a content planning desk instead of another chat box. The strongest opportunity is to turn the visual drama into task clarity. Keep the red editorial identity, but make the workflow more compact, safer, and easier to scan.

## What's Working

1. The core workflow is visible: input, 3 outlines, preview. Users can understand the product purpose without reading docs.
2. Editable outlines are the right interaction model. The UI treats AI output as material to shape, not a final answer.
3. The preview panel gives the selected outline a concrete future. That reduces uncertainty before confirmation.

## Priority Issues

### [P1] The product surface is too theatrical for the task

**Why it matters**: At 1280x720, the title and header consume so much vertical space that the tool itself is partly pushed below the fold. This makes the first user action feel secondary.

**Fix**: Collapse the top into a compact app bar, reduce the display title, and let the three working panels own the first viewport. Keep the red identity in the shell and active states, not in oversized staging.

**Suggested command**: `$impeccable quieter`

### [P1] Destructive workflow actions are unprotected

**Why it matters**: `换一批` clears the selected/edited outline and generated draft without warning or undo. Changing the seed also clears the draft. A creator can lose work while exploring.

**Fix**: Track dirty edited outlines, add a lightweight undo for batch changes, and preserve generated output until the user explicitly replaces it. Add loading and failed-generation states once backend integration begins.

**Suggested command**: `$impeccable harden`

### [P2] All three outlines are fully expanded, creating high cognitive load

**Why it matters**: The user needs to compare direction first, but each card exposes title, hook, and structure textareas immediately. That turns choice into editing before the user has committed.

**Fix**: Make the three options summary-first. Expand only the selected outline into an editor. Show the other two as compact comparison rows with tone, hook, and 3 bullet summaries.

**Suggested command**: `$impeccable layout`

### [P2] Impeccable anti-patterns remain in the visual system

**Why it matters**: The detector caught a side-tab border, and the manual review also found repeated decorative grid backgrounds and bordered elements with very large soft shadows. These are common AI interface tells.

**Fix**: Replace the one-sided border with a full-row separator or subtle background tint. Remove `repeating-linear-gradient` decoration. Choose either border or tight shadow per component, not both.

**Suggested command**: `$impeccable polish`

### [P2] The generated result has no production action path

**Why it matters**: After generation, the user can read the draft but cannot copy sections, export, regenerate just the cover prompt, or continue editing from the result. The workflow stops at preview instead of reaching usefulness.

**Fix**: Add post-generation actions: copy caption, copy image prompt, regenerate cover, regenerate text only, and save draft. Keep these scoped to the output panel.

**Suggested command**: `$impeccable onboard`

## Persona Red Flags

**First-time creator**: They can see the 3-step flow, but the first screen asks them to parse a huge title, 3 panels, repeated labels, 7 textareas, and 7 buttons. They may not know whether to edit all outlines or select one first.

**Content operator**: They will want speed. Current gaps: no keyboard path, no copy/export, no save draft, no batch history, no way to compare three outline strategies without reading full textareas.

**Mobile creator**: Mobile has no horizontal overflow, which is good. But the page is about 3717px tall at 390x844. The primary flow becomes a long scroll, and editing three expanded outlines on mobile will feel heavy.

## Minor Observations

- The Chinese task labels are clear, but `Brief to post`, `Input`, `Output`, and `3 options` feel like implementation labels rather than product copy.
- Focus rings are visible, but the cyan ring clashes with the red/yellow system and looks like a browser default overlay.
- The active step rail marks both step 1 and step 2 as active before the user has made a deliberate choice. It reads more like progress completed than current position.
- The cover art communicates output well, but it has no real image asset or generated thumbnail state yet.
- The right panel heading and button compete; the primary action would be clearer at the bottom of the selected outline or as a sticky action between outline and preview.

## Questions to Consider

1. What should dominate the first viewport: brand mood, outline choice, or generated preview?
2. Should users edit all three outlines, or only the one they select?
3. Is `换一批` exploratory and reversible, or should it behave like a destructive reset?
4. What is the first production-ready output: caption text, image prompt, full post packet, or saved draft?
