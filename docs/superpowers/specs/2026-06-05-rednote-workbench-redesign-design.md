# RedNote Workbench Redesign Design

Date: 2026-06-05

## Goal

Refocus the frontend on the core RedNote workflow:

1. User enters one idea.
2. The app generates related outlines.
3. User edits and selects one outline.
4. The app generates final graphic-text content.
5. User edits and copies content for publishing.

Conversation history, autosave, manual save, and saved drafts remain available, but they must not compete with the primary creation flow.

## Recommended Approach

Use a main workbench with a fixed narrow conversation rail.

The left rail is a secondary control surface for conversation switching and recovery. The main area is a single-task creation surface for the current piece of content.

This keeps the product between a single-task creation tool and a multi-session workspace:

- History is always reachable.
- Current creation remains visually dominant.
- Save and restore are support behaviors, not the main task.

## Information Architecture

### Conversation Rail

The rail is narrow and low-distraction. It contains:

- New conversation icon.
- Manual save icon.
- Autosave status.
- Recent conversation list.
- Delete/restore actions.

It does not contain idea input, outline generation, or final content editing.

### Main Workbench

The main workbench contains three ordered sections.

#### 1. Idea Composer

Purpose: capture the user idea and start outline generation.

Expected behavior:

- User enters one idea.
- Generate outline action validates non-empty input.
- Generation failure keeps the typed idea intact.

#### 2. Outline Workspace

Purpose: compare, edit, and select the content direction.

Expected behavior:

- Latest generated batch is expanded by default.
- Older batches are preserved but collapsed.
- Each batch contains three outlines.
- Each outline can be selected.
- Selected outline can be edited.
- If a final draft already exists, editing the outline marks that draft as stale instead of overwriting it.
- Confirming an outline generates a final draft.

#### 3. Post Editor

Purpose: produce final publishable content.

Expected behavior:

- Generated content is editable, not just preview-only.
- User can edit title, body, tags, and cover prompt.
- User can copy the full publishable note.
- User can also copy title, body, tags, and cover prompt separately.
- The cover prompt is not included in the full publishable note because it is production guidance, not post text.

## Component Boundaries

The current page should be split into focused units while staying close to existing behavior.

### `ConversationRail`

Owns conversation navigation and persistence actions.

Inputs:

- Conversation summaries.
- Active conversation id.
- Autosave state.

Actions:

- Create conversation.
- Restore conversation.
- Delete conversation.
- Trigger manual save.

It should not know outline or post editing internals.

### `IdeaComposer`

Owns the idea text area and outline generation action.

Inputs:

- Current idea.
- Validation error.
- Generation state.

Actions:

- Update idea.
- Generate outline batch.

### `OutlineWorkspace`

Owns outline display and editing.

Inputs:

- Outline batches.
- Latest batch id.
- Selected outline id.
- Draft stale state.

Actions:

- Select outline.
- Edit outline.
- Expand or collapse older batches.
- Generate post from selected outline.

### `PostEditor`

Owns final content editing and copy actions.

Inputs:

- Current post draft.
- Saving state.

Actions:

- Edit final title, body, tags, and cover prompt.
- Copy full note.
- Copy individual fields.
- Save final draft.

### `useWorkspaceAutosave`

Encapsulates autosave behavior so the UI is not polluted with save timing details.

Responsibilities:

- Debounce workspace state changes.
- Persist conversation metadata and snapshot.
- Report saving, saved, and failed states.
- Avoid creating duplicate saves for unchanged state.

## Data Flow

The frontend should treat the current conversation as the single source of workspace state.

Workspace state includes:

- Idea text.
- Outline batches.
- Selected outline id.
- Current post draft.
- Saved final drafts.
- Autosave status.

### Entering the Workbench

After login:

1. Load the most recent conversation.
2. If it has a valid snapshot, restore the snapshot.
3. Otherwise restore from conversation aggregate data.
4. If no conversation exists, create an empty initial workspace with no generated outlines. The idea field may show placeholder text, but it should not silently use a default sample idea as user content.

### Creating a New Conversation

When the user clicks new conversation:

1. Silently save the current conversation if it has unsaved changes.
2. Create a new conversation.
3. Reset the main workbench to idea input.
4. Keep the rail visible.

### Generating Outlines

When the user generates outlines:

1. Validate idea text.
2. Create a new outline batch.
3. Mark previous final draft as stale if one exists.
4. Expand the latest batch.
5. Collapse older batches.
6. Select the first outline in the latest batch by default.

### Editing Outlines

Outline edits update the selected outline and trigger autosave.

If a post draft exists, outline edits mark the draft as stale. They do not regenerate or overwrite the final draft automatically.

### Generating Final Content

When the user confirms an outline:

1. Save selected outline id.
2. Generate post draft.
3. Enter editable post state.
4. Clear stale state.

### Saving

Autosave and manual save should write the same kind of workspace snapshot.

Manual save is an immediate save affordance, not a separate storage concept.

### Saving Drafts

Saved drafts are final post versions.

Rules:

- Compute a content signature from title, body, tags, cover prompt, and related final fields.
- If an identical saved draft exists, show an already-saved message.
- Prevent double-click duplicate writes while saving is in progress.

## Styling Direction

Use Tailwind utility classes for the redesign work.

Guidelines:

- Prefer Tailwind atomic classes in React markup for layout, spacing, typography, and component states.
- Keep global CSS for project-level tokens, resets, and truly shared primitives only.
- Do not add large new global component CSS blocks unless a pattern is reused across multiple components.
- Preserve the current restrained product palette and OKLCH tokens.
- Keep the interface quiet and task-focused, closer to a content editor than a SaaS landing page.

## Error Handling

### Generation Failure

- Preserve typed idea and existing outlines.
- Restore button state.
- Show a short status message.

### Autosave Failure

- Keep editing available.
- Show failed save state in the rail.
- Keep manual save available.

### Restore Failure

- Do not switch away from the current workspace.
- Show a short failure message.

### Copy Failure

- Keep editable text visible.
- Show a short message telling the user to select and copy manually.

## Testing and Review

Automated checks:

- `pnpm --filter @rednote/web-frontend lint`
- `pnpm --filter @rednote/web-frontend build`

Manual checks:

- Login and restore the latest conversation.
- Create a new conversation.
- Generate outlines from an idea.
- Confirm the latest batch is expanded and older batches are collapsed.
- Edit an outline.
- Generate final content.
- Edit final title, body, tags, and cover prompt.
- Copy full note.
- Copy title, body, tags, and cover prompt separately.
- Save a draft.
- Attempt to save the same draft again and confirm dedupe behavior.
- Refresh and confirm autosaved state restores.
- Delete and restore conversation records from the rail.

Design review:

- After implementation, run `$impeccable` review on the frontend workbench.
- The review should check that the main flow is not competing with history, save, or draft management controls.

## Out of Scope

- Backend generation quality improvements.
- Image generation or image upload.
- Social platform publishing integration.
- Multi-user collaboration.
- Analytics.
