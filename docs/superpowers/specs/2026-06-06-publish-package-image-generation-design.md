# RedNote Publish Package And Mock Image Generation Design

## Status

Approved direction:

- Build a complete publish package instead of a text-only draft.
- Use a mock image generation provider first.
- Keep the API shape ready for OpenAI or DashScope image generation later.

## Context

The current workbench flow is close to the desired creator workflow:

1. The user enters one idea.
2. The app generates outline batches.
3. The user edits and selects an outline.
4. The app generates editable post content.
5. Conversation state can be saved and restored.

The remaining gap is that the final output is not yet publishable. The backend currently returns an `imagePrompt`, but no actual image asset or image generation state. The generated post body can also contain template-like instructions instead of final copy. The right panel therefore looks like a draft editor, not a complete Xiaohongshu publish package.

## Goals

- Make the generated result feel ready to publish: title, cover copy, body, tags, image prompt, and one generated cover image.
- Add a mock image generation endpoint that exercises the same frontend and backend flow as a real provider.
- Persist image state with the post draft so saved drafts, autosave, and conversation restore include the image.
- Keep the UI focused on the intended workflow: input idea, choose outline, generate publish package, copy/download, save.
- Reduce duplicate actions and avoid visual overload.

## Non-Goals

- Real OpenAI or DashScope image generation is not part of this spec.
- Multi-image carousel generation is not part of this spec.
- Public image hosting, CDN upload, or permanent object storage is not part of this spec.
- Changing the authentication model is not part of this spec.

## Product Shape

The final generated object should be presented as a "publish package" in the UI. It contains:

- Title for the Xiaohongshu note.
- Cover line for the image.
- Main body copy with complete paragraphs.
- Tags.
- Image prompt for future model use.
- Generated cover image.
- Image generation status and retry state.

The copy action remains text-first. The image is shown and can be downloaded separately.

Image generation is user-triggered in v1. The interface may make the action easy to find, but it should not automatically start generation immediately after text draft creation.

## Backend Data Model

Extend `PostDraft` with current-cover-image fields:

- `imageUrl String?`
- `imageStatus String @default("idle")`
- `imageProvider String?`
- `imageError String?`
- `imageGeneratedAt DateTime?`

Allowed `imageStatus` values:

- `idle`: no generated image yet.
- `generating`: generation request accepted.
- `ready`: image is available.
- `failed`: image generation failed, text draft is still usable.

Use string fields rather than Prisma enums for this iteration. The backend service owns validation, and SQLite migrations stay simple.

The first version stores only the current cover image on the draft. Regenerating an image replaces the current image fields. Saved drafts and conversation snapshots keep a copy of the current image fields at the time they are saved.

## Backend Services

Add an image generation boundary:

- `ImageGenerationService`: owns post-draft image generation.
- `MockImageProvider`: returns a deterministic generated cover image.

The mock provider returns a small `data:image/svg+xml;base64,...` URL. This keeps the first iteration free of file storage, signed URLs, static hosting, and auth issues for `<img>` tags. The SVG should look like a simple Xiaohongshu-style cover: vertical format, warm paper background, red accent label, cover line, and a compact visual motif derived from the topic.

The provider interface should be narrow:

- Input: topic, title, coverLine, imagePrompt, tags, postDraftId.
- Output: imageUrl, provider, generatedAt.

Later OpenAI or DashScope providers can implement the same interface and return hosted URLs or uploaded asset URLs.

## API Design

All responses keep the existing envelope:

```json
{
  "code": 0,
  "data": {},
  "msg": "ok"
}
```

Update existing post-draft responses to include:

- `imageUrl`
- `imageStatus`
- `imageProvider`
- `imageError`
- `imageGeneratedAt`

Add:

- `POST /post-drafts/:id/image`
  - Requires auth.
  - Verifies the draft belongs to the current user.
  - Optional body: `{ "imagePrompt": "..." }`.
  - Saves an edited prompt before generation when provided.
  - Sets `imageStatus` to `generating`.
  - Calls the mock provider.
  - Returns the updated post draft with `imageStatus: "ready"` and `imageUrl`.

- `GET /post-drafts/:id`
  - Requires auth.
  - Verifies ownership.
  - Returns the current post draft.
  - Gives the frontend a polling-compatible endpoint for future async real providers.

Existing `PATCH /post-drafts/:id` remains the editor autosave endpoint. User edits can update title, cover line, caption, sections, tags, and image prompt. Image result fields are changed only by the image generation service.

## Content Generation

Update post draft generation so sections are final copy, not writing instructions.

Each generated post should include:

- A title that can be copied directly.
- A cover line under roughly 18 Chinese characters.
- A caption/opening sentence that fits the chosen outline tone.
- Three to five complete body paragraphs or list-style sections.
- A closing sentence that encourages save, try, or comment.
- Tags without duplicated `#` characters in stored data.
- An image prompt that describes cover layout, objects, colors, and typography placement.

The deterministic generator can still use templates internally, but returned text must read as publishable prose.

## Frontend State

Extend frontend `PostDraft` types and mappers with the image fields.

Update all state persistence helpers:

- Backend response mapper.
- Saved draft mapper.
- Snapshot mapper.
- Autosave key creation.
- Draft signature used for duplicate saved-draft checks.

This ensures autosave, saved drafts, and conversation restore preserve the image preview and generation state.

## Frontend UI

The right panel becomes a publish package editor:

- Top area: cover preview.
  - `ready`: show generated image.
  - `generating`: show a compact loading state in the preview area.
  - `failed`: show a retryable error state.
  - `idle`: show a lightweight layout preview based on the cover line and prompt.

- Middle area: editable publish copy.
  - Title.
  - Cover line.
  - Body sections.
  - Tags.
  - Image prompt.

- Bottom actions:
  - Copy full text.
  - Save draft.
  - Generate image or regenerate image.
  - Download image when ready.

Avoid duplicated buttons. Icon-only actions should be used only for secondary controls with clear tooltips. Tooltips must render above surrounding icon buttons and should not be hidden by lower elements.

## Data Flow

1. User generates a post draft from the selected outline.
2. Backend returns publish copy with image fields in `idle`.
3. Frontend displays the publish package and an idle cover preview.
4. User clicks generate image.
5. Backend updates the same post draft with image fields.
6. Frontend replaces the preview with the generated image.
7. Autosave and explicit save include the image fields.
8. Opening a saved draft or restored conversation shows the same publish package state.

The first implementation uses an explicit "generate image" action instead of auto-triggering image generation. This keeps the flow understandable and avoids surprising background state changes. The button can be visually quiet and placed beside the image preview.

## Error Handling

- If text draft generation fails, keep the current outline and show the existing unified frontend error handling.
- If image generation fails, keep the publish copy, set `imageStatus: "failed"`, store `imageError`, and show retry.
- If image generation succeeds after the user edited text locally, merge only image fields into the current draft so local text edits are not overwritten.
- If autosave fails, keep local image and text state and use the existing autosave error affordance.
- If the mock image data URL is missing or invalid, show the failed image state and allow retry.

## Testing

Backend:

- Build should pass for the backend.
- Add focused tests for post-draft serialization with image fields.
- Add service-level tests for successful mock image generation and ownership checks.
- Confirm API responses remain wrapped in `{ code, data, msg }`.

Frontend:

- Update mapper tests for image fields.
- Update saved draft dedupe tests so image changes affect signatures.
- Test restore helpers with image fields.
- Test the publish package actions for idle, ready, and failed states.
- Run frontend lint, tests, and build.

Manual verification:

- Start `pnpm dev`.
- Generate a post draft from an idea.
- Generate a mock image.
- Verify the preview appears.
- Copy full text.
- Save draft.
- Reload or switch conversations and confirm text plus image state restores.

## Implementation Notes

- Keep existing API client interceptor behavior.
- Keep response envelope compatibility.
- Use Tailwind utility classes in frontend changes.
- Keep the UI closer to a calm Xiaohongshu creator workspace than a dashboard.
- Do not add new provider credentials or environment variables in this iteration.
- Do not introduce image upload/storage dependencies in this iteration.
