import { jest } from "@jest/globals";
import { buildImageExpandEditInput } from "./image-expand-canvas.js";

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
});
