import sharp from "sharp";
import type { ImageEditSource } from "./image-provider.types.js";
import type { StoredImageRef } from "./image-storage.types.js";

export type ImageExpandPadding = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type ImageExpandTarget = {
  width: number;
  height: number;
};

type ImageExpandRendererInput = {
  sourceBytes: Buffer;
  source: {
    width: number;
    height: number;
  };
  padding: ImageExpandPadding;
  target: ImageExpandTarget;
};

type ImageExpandRendererOutput = {
  imageBytes: Buffer;
  maskBytes: Buffer;
};

export type ImageExpandRenderer = (
  input: ImageExpandRendererInput
) => Promise<ImageExpandRendererOutput>;

export async function buildImageExpandEditInput(input: {
  source: StoredImageRef;
  sourceBytes: Buffer;
  padding: ImageExpandPadding;
  target: ImageExpandTarget;
  renderer?: ImageExpandRenderer;
}): Promise<{
  image: ImageEditSource;
  mask: ImageEditSource;
}> {
  const renderer = input.renderer ?? renderImageExpandCanvas;
  const rendered = await renderer({
    sourceBytes: input.sourceBytes,
    source: {
      width: input.source.width,
      height: input.source.height
    },
    padding: input.padding,
    target: input.target
  });

  return {
    image: {
      storageKey: input.source.storageKey,
      mimeType: "image/png",
      width: input.target.width,
      height: input.target.height,
      sizeBytes: rendered.imageBytes.length,
      bytes: rendered.imageBytes
    },
    mask: {
      storageKey: `${input.source.storageKey}.expand-mask.png`,
      mimeType: "image/png",
      width: input.target.width,
      height: input.target.height,
      sizeBytes: rendered.maskBytes.length,
      bytes: rendered.maskBytes
    }
  };
}

async function renderImageExpandCanvas(
  input: ImageExpandRendererInput
): Promise<ImageExpandRendererOutput> {
  const sourcePng = await sharp(input.sourceBytes)
    .resize(input.source.width, input.source.height, {
      fit: "fill"
    })
    .png()
    .toBuffer();

  const imageBytes = await sharp({
    create: {
      width: input.target.width,
      height: input.target.height,
      channels: 4,
      background: {
        r: 0,
        g: 0,
        b: 0,
        alpha: 0
      }
    }
  })
    .composite([
      {
        input: sourcePng,
        left: input.padding.left,
        top: input.padding.top
      }
    ])
    .png()
    .toBuffer();

  const protectedSourceRegion = await sharp({
    create: {
      width: input.source.width,
      height: input.source.height,
      channels: 4,
      background: {
        r: 0,
        g: 0,
        b: 0,
        alpha: 0
      }
    }
  })
    .png()
    .toBuffer();

  // OpenAI image-edit masks treat transparent pixels as protected source and
  // opaque/white pixels as editable. The expansion area is therefore white,
  // while the original image rectangle remains transparent.
  const maskBytes = await sharp({
    create: {
      width: input.target.width,
      height: input.target.height,
      channels: 4,
      background: {
        r: 255,
        g: 255,
        b: 255,
        alpha: 1
      }
    }
  })
    .composite([
      {
        input: protectedSourceRegion,
        left: input.padding.left,
        top: input.padding.top
      }
    ])
    .png()
    .toBuffer();

  return {
    imageBytes,
    maskBytes
  };
}
