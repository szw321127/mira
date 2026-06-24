# Mira Leafer Local Editing Design

## Goal

Move image mask drawing into the Leafer canvas and add a fast local-edit flow:
users can click a point on an image, resize the marked region, describe the
change, and regenerate only that part of the image.

## Scope

- Add canvas-level `mask` and `marker` tools to the image workspace.
- Keep the edit task backend contract based on the existing `maskId` upload.
- Use a single active local-edit region per selected image.
- Remove the separate right-panel mask canvas as the primary editing surface.
- Keep version compare, download, variation, upscale, background removal, and
  revert flows unchanged.

## User Experience

The canvas toolbar gains two focused tools:

- `Mask`: paint a semi-transparent red mask directly over the selected image.
- `Marker`: click the selected image to create a circular local-edit region.
  The circle can be moved and resized before submission.

When an image is selected, the inspector shows the current image versions and a
compact local-edit composer. The composer reflects the active canvas edit state:

- If the user painted a mask, the edit will use the painted area.
- If the user only created a marker, the edit will use the marker circle.
- If neither exists, the edit can still submit a full-image edit with no mask.

Submitting an edit uploads a generated mask PNG when a mask or marker exists,
then calls the existing edit task endpoint with `prompt` and `maskId`.

## Canvas Behavior

Leafer owns all visual editing overlays:

- Image nodes remain selectable, draggable, and resizable in `select` mode.
- `mask` mode disables image transform editing and paints an overlay clipped to
  the selected image bounds.
- `marker` mode disables image transform editing and creates or updates one
  circular marker on the selected image.
- Switching selected images clears transient mask and marker state.
- Successful edit task creation clears transient mask and marker state.

Mask export creates a source-sized PNG matching the current image version:

- Black pixels mean preserved content.
- Transparent pixels mark the region to regenerate.
- Painted mask strokes and marker circles are converted into source-image
  coordinates using the selected Leafer image node geometry.

## Data Flow

1. User selects an image asset on the Leafer canvas.
2. User paints a mask or places/resizes a marker on that selected image.
3. User enters a local edit prompt in the inspector.
4. Frontend asks the canvas controller to export a mask data URL.
5. If a mask data URL exists, frontend uploads it through the existing
   `POST /api/image-assets/:assetId/masks` proxy.
6. Frontend creates the existing edit task through
   `POST /api/image-assets/:assetId/edit`.
7. Backend worker uses the existing provider edit path with the uploaded mask.

No new database table is required for the first version.

## Components

- `leafer-canvas-types.ts`: extend the controller contract with edit overlay
  methods and tool names.
- `leafer-canvas-adapter.ts`: implement mask strokes, marker nodes, export, and
  transient state clearing inside Leafer.
- `image-canvas.tsx`: pass selected image/version context into the controller
  and expose the active tool state to the toolbar.
- `canvas-toolbar.tsx`: add mask and marker controls with icon buttons.
- `asset-version-panel.tsx`: replace the embedded mask canvas with a local-edit
  composer that submits through the canvas export flow.
- `image-workspace-shell.tsx`: coordinate the selected asset, current version,
  canvas controller, and inspector edit submission.
- `use-image-workspace.ts`: keep the current upload/edit task APIs; no backend
  contract change is needed.

## Error Handling

- If no image is selected, mask and marker tools are disabled.
- If the selected image has no current version, edit submission is disabled.
- If mask export fails, show an inspector-level error and do not create a task.
- If mask upload fails, keep the canvas overlay so the user can retry.
- If task creation fails, keep the prompt and overlay state.

## Testing

- Frontend structure tests assert that the toolbar exposes `mask` and `marker`
  tools.
- Workspace tests assert the right panel no longer owns a standalone mask
  drawing canvas.
- API flow tests assert local edits upload a mask before creating an edit task.
- Adapter tests assert the controller contract includes mask export and overlay
  clearing methods.
- Existing backend image edit tests remain valid because the backend still
  receives `maskId`.

## Non-Goals

- Multi-region editing in one request.
- Persistent annotation history.
- Collaborative edit cursors.
- New backend task type for local edits.
