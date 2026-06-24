import { jest } from "@jest/globals";
import sharp from "sharp";
import {
  buildImageExpandEditInput,
  normalizeImageExpandOutput
} from "./image-expand-canvas.js";

describe("buildImageExpandEditInput", () => {
  it("builds inline PNG source and mask refs at the expand target size", async () => {
    const sourceBytes = Buffer.from("source-image");
    const renderer = jest.fn(async () => ({
      imageBytes: Buffer.from("expanded-png"),
      maskBytes: Buffer.from("mask-png")
    }));

    const input = await buildImageExpandEditInput({
      source: {
        storageKey: "local/user/workspace/source.png",
        mimeType: "image/png",
        width: 640,
        height: 480,
        sizeBytes: 12
      },
      sourceBytes,
      padding: {
        left: 120,
        right: 80,
        top: 40,
        bottom: 200
      },
      target: {
        width: 840,
        height: 720
      },
      renderer
    });

    expect(renderer).toHaveBeenCalledWith({
      sourceBytes,
      source: {
        width: 640,
        height: 480
      },
      padding: {
        left: 120,
        right: 80,
        top: 40,
        bottom: 200
      },
      target: {
        width: 840,
        height: 720
      }
    });
    expect(input).toEqual({
      image: {
        storageKey: "local/user/workspace/source.png",
        mimeType: "image/png",
        width: 840,
        height: 720,
        sizeBytes: Buffer.byteLength("expanded-png"),
        bytes: Buffer.from("expanded-png")
      },
      mask: {
        storageKey: "local/user/workspace/source.png.expand-mask.png",
        mimeType: "image/png",
        width: 840,
        height: 720,
        sizeBytes: Buffer.byteLength("mask-png"),
        bytes: Buffer.from("mask-png")
      }
    });
  });

  it("makes expansion pixels transparent and source pixels opaque in the edit mask", async () => {
    const sourceBytes = await sharp({
      create: {
        width: 2,
        height: 2,
        channels: 4,
        background: {
          r: 32,
          g: 64,
          b: 96,
          alpha: 1
        }
      }
    })
      .png()
      .toBuffer();

    const input = await buildImageExpandEditInput({
      source: {
        storageKey: "local/user/workspace/source.png",
        mimeType: "image/png",
        width: 2,
        height: 2,
        sizeBytes: sourceBytes.length
      },
      sourceBytes,
      padding: {
        left: 1,
        right: 1,
        top: 1,
        bottom: 1
      },
      target: {
        width: 4,
        height: 4
      }
    });

    const maskPixels = await sharp(input.mask.bytes)
      .ensureAlpha()
      .raw()
      .toBuffer();

    expect(alphaAt(maskPixels, 4, 0, 0)).toBe(0);
    expect(alphaAt(maskPixels, 4, 1, 1)).toBe(255);
  });

  it("normalizes provider-sized expand output back to the requested target", async () => {
    const output = await normalizeImageExpandOutput({
      bytes: await solidPng(6, 8),
      target: {
        width: 4,
        height: 5
      }
    });

    expect(output.width).toBe(4);
    expect(output.height).toBe(5);
    await expect(sharp(output.bytes).metadata()).resolves.toEqual(
      expect.objectContaining({
        width: 4,
        height: 5,
        format: "png"
      })
    );
  });
});

function alphaAt(
  pixels: Buffer,
  width: number,
  x: number,
  y: number
): number {
  return pixels[(y * width + x) * 4 + 3] ?? -1;
}

async function solidPng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: {
        r: 32,
        g: 64,
        b: 96,
        alpha: 1
      }
    }
  })
    .png()
    .toBuffer();
}
