# Image Expand Design

## Goal

Add image expansion to the Mira image workspace. Users can select an existing image, choose an expansion mode, preview the new canvas bounds in Leafer, and create an async image task that produces a new image version.

## User Experience

The entry point lives in the existing image version panel, next to compare, variation, upscale, and background removal. Clicking "扩展图片" opens an expansion section in the same panel and activates an expansion overlay in the Leafer canvas.

The panel supports three modes:

1. **自由扩展**
   - The user drags the expansion box edges or corners on the Leafer canvas.
   - The panel shows computed left, right, top, and bottom padding in pixels.
   - This is the most flexible mode and is the default when entering the tool.

2. **按比例扩展**
   - The user picks one of the common ratios already used by image generation: `1:1`, `2:1`, `4:3`, `16:9`, `1:2`, `3:4`, `9:16`.
   - The selected source image remains centered.
   - Mira expands the shorter side enough to reach the target ratio without cropping the original image.

3. **按方向扩展**
   - The user picks `left`, `right`, `top`, `bottom`, or `around`.
   - A slider controls expansion amount from 10% to 100% of the source dimension.
   - The default is 25%.

The user can optionally describe what should appear in the added area. If the prompt is empty, Mira uses safe default copy such as "自然扩展图片画面，保持原图主体、风格和光照一致".

## Leafer Canvas Behavior

The canvas keeps the currently selected image as the source. Expansion mode adds a non-destructive overlay:

- A dashed expansion rectangle shows the future output bounds.
- The source image remains visually distinct inside the rectangle.
- Free mode exposes draggable edge and corner handles.
- Ratio and direction modes update the rectangle from panel controls.
- Leaving the tool clears the overlay.
- Undo and redo should include expansion overlay changes, following the existing local edit overlay pattern where practical.

The canvas controller exposes the expansion state to React:

- `getLocalExpandState()`
- `setLocalExpandMode(mode)`
- `setLocalExpandAspectRatio(ratio)`
- `setLocalExpandDirection(direction)`
- `setLocalExpandPercent(percent)`
- `setLocalExpandPadding(padding)`
- `clearLocalExpandOverlay()`
- `exportLocalExpandInput(input)`

The export result contains source asset/version IDs, target dimensions, padding, mode metadata, and a generated mask/source reference if needed by the backend.

## Backend Task Model

Add a new `expand` image task type.

Affected shared task unions:

- Prisma `ImageTaskType`
- backend `ImageTaskRequest`
- queue payload type
- task stream event type
- frontend `ImageTask["type"]`
- task labels and active task handling
- admin usage reporting task type display if applicable

The public task input stores:

```json
{
  "type": "expand",
  "prompt": "extend the beach at sunset",
  "assetId": "asset-id",
  "versionId": "version-id",
  "mode": "free",
  "padding": { "left": 128, "right": 256, "top": 0, "bottom": 128 },
  "target": { "width": 1408, "height": 1152 }
}
```

For ratio mode, the input also stores `aspectRatio`. For direction mode, it stores `direction` and `percent`.

## Provider Strategy

Expansion uses the existing edit pipeline rather than a separate provider concept.

The backend creates an expanded source canvas:

- The new canvas has the requested target dimensions.
- The original image is pasted into the correct offset based on padding.
- The added area is transparent.

The backend also creates a mask:

- Added areas are opaque/painted in the mask.
- Original image area is transparent/unpainted.

The worker calls `provider.edit` with:

- prompt including explicit outpaint instruction
- expanded source canvas as `image`
- generated mask as `mask`
- size inferred from target dimensions, using `1024x1024`, `1024x1536`, `1536x1024`, or `auto`

This fits the current OpenAI image edit implementation and keeps provider code generic.

## Storage And Versions

The generated result becomes a new `ImageVersion` on the same `ImageAsset`:

- `parentId` is the source version.
- `editPrompt` is the expansion prompt.
- `metadata` includes `operation: "expand"`, `mode`, `padding`, `target`, and any provider metadata.
- `currentVersionId` is updated to the expanded version.

When the task completes, the frontend reloads the workspace via existing asset update events. The selected Leafer image should update to the new version dimensions, and canvas object dimensions should be updated to match the expanded output.

## API Surface

Frontend same-origin API:

- `POST /api/image-assets/:assetId/expand`

Backend API:

- `POST /image-assets/:assetId/expand`

Request body:

```json
{
  "prompt": "extend the street into the distance",
  "versionId": "version-id",
  "mode": "direction",
  "direction": "right",
  "percent": 0.25,
  "padding": { "left": 0, "right": 256, "top": 0, "bottom": 0 },
  "target": { "width": 1280, "height": 1024 },
  "aspectRatio": "16:9"
}
```

The backend does not trust client-provided dimensions blindly. It validates that:

- the asset belongs to the current user
- the version belongs to the asset
- padding values are finite non-negative integers
- at least one padding side is greater than zero
- target dimensions equal source dimensions plus padding
- target dimensions stay within provider/storage limits

## Testing

Frontend tests:

- the version panel exposes an "扩展图片" action
- expansion modes and controls render only when an asset is selected
- `createImageAssetExpandTask` posts to `/api/image-assets/:assetId/expand`
- `useImageWorkspace` appends expand tasks and starts streaming
- task stream parsing accepts `expand`
- task labels display "扩展图片"
- Leafer adapter exposes and clears expansion overlay state

Backend tests:

- Prisma schema includes `expand`
- request parser accepts `expand` and rejects invalid expansion payloads
- controller forwards asset expand requests with request IP
- service creates expand tasks from the current or requested version
- worker processes expand tasks through provider edit with expanded source and mask
- progress copy uses expand-specific messages
- serialized task input keeps public operation metadata but no storage internals

## Scope Decisions

In scope:

- expansion as an async task
- source image gets a new version after task completion
- free, ratio, and direction expansion modes
- Leafer visual overlay and drag handles for free mode
- reuse current provider/edit pipeline

Out of scope for the first implementation:

- multiple image expansion in one task
- arbitrary rotation-aware expansion math
- text-to-image expansion without a selected source image
- provider-specific controls beyond current quality/model settings

