import {
  assertImageProviderResult,
  imageGenerateSizeForAspectRatio,
  isImageAspectRatio,
  isImageGenerateSize,
  type ImageEditInput,
  type ImageGenerateInput,
  type ImageProviderAdapter
} from "./image-provider.types.js";

describe("image provider contracts", () => {
  it("accepts only supported generation sizes", () => {
    expect(isImageGenerateSize("1024x1024")).toBe(true);
    expect(isImageGenerateSize("1024x1536")).toBe(true);
    expect(isImageGenerateSize("1536x1024")).toBe(true);
    expect(isImageGenerateSize("auto")).toBe(true);
    expect(isImageGenerateSize("512x512")).toBe(false);
    expect(isImageGenerateSize("landscape")).toBe(false);
  });

  it("accepts common generation aspect ratios and maps them to provider sizes", () => {
    for (const ratio of ["1:1", "2:1", "4:3", "16:9", "1:2", "3:4", "9:16"]) {
      expect(isImageAspectRatio(ratio)).toBe(true);
    }

    expect(isImageAspectRatio("21:9")).toBe(false);
    expect(isImageAspectRatio("landscape")).toBe(false);
    expect(isImageAspectRatio("1024x1024")).toBe(false);
    expect(imageGenerateSizeForAspectRatio("1:1")).toBe("1024x1024");
    expect(imageGenerateSizeForAspectRatio("16:9")).toBe("1536x1024");
    expect(imageGenerateSizeForAspectRatio("9:16")).toBe("1024x1536");
  });

  it("keeps generate and edit adapter inputs compatible with the provider interface", async () => {
    const seen: Array<ImageGenerateInput | ImageEditInput> = [];
    const adapter: ImageProviderAdapter = {
      async generate(input) {
        seen.push(input);
        return {
          bytes: Buffer.from("generated-image"),
          mimeType: "image/png",
          width: 1024,
          height: 1024,
          provider: "test-provider",
          providerJob: "job-generate",
          metadata: { mode: "generate" }
        };
      },
      async edit(input) {
        seen.push(input);
        return {
          bytes: Buffer.from("edited-image"),
          mimeType: "image/webp",
          width: 1024,
          height: 1536,
          provider: "test-provider",
          providerJob: null,
          metadata: { mode: "edit" }
        };
      }
    };

    await expect(
      adapter.generate({
        prompt: "make a launch cover",
        aspectRatio: "16:9",
        size: "1024x1024",
        quality: "high",
        background: "auto"
      })
    ).resolves.toEqual(
      expect.objectContaining({
        mimeType: "image/png",
        provider: "test-provider",
        width: 1024,
        height: 1024
      })
    );

    await expect(
      adapter.edit({
        prompt: "add a softer background",
        image: {
          storageKey: "users/user-1/source.png",
          mimeType: "image/png",
          width: 1024,
          height: 1024,
          sizeBytes: 128
        },
        mask: {
          storageKey: "users/user-1/mask.png",
          mimeType: "image/png",
          width: 1024,
          height: 1024,
          sizeBytes: 64
        },
        size: "1024x1536"
      })
    ).resolves.toEqual(
      expect.objectContaining({
        mimeType: "image/webp",
        providerJob: null,
        height: 1536
      })
    );

    expect(seen).toEqual([
      expect.objectContaining({
        aspectRatio: "16:9",
        prompt: "make a launch cover",
        quality: "high"
      }),
      expect.objectContaining({
        prompt: "add a softer background",
        image: expect.objectContaining({ storageKey: "users/user-1/source.png" })
      })
    ]);
  });

  it("rejects provider results that omit required binary or metadata fields", () => {
    expect(
      assertImageProviderResult({
        bytes: Buffer.from("generated-image"),
        mimeType: "image/jpeg",
        width: 1536,
        height: 1024,
        provider: "openai",
        providerJob: null,
        metadata: { revisedPrompt: "short safe prompt" }
      })
    ).toEqual({
      bytes: Buffer.from("generated-image"),
      mimeType: "image/jpeg",
      width: 1536,
      height: 1024,
      provider: "openai",
      providerJob: null,
      metadata: { revisedPrompt: "short safe prompt" }
    });

    expect(() =>
      assertImageProviderResult({
        bytes: Buffer.alloc(0),
        mimeType: "image/png",
        width: 1024,
        height: 1024,
        provider: "openai",
        providerJob: null,
        metadata: {}
      })
    ).toThrow("Image provider returned empty bytes");

    expect(() =>
      assertImageProviderResult({
        bytes: Buffer.from("x"),
        mimeType: "text/plain",
        width: 1024,
        height: 1024,
        provider: "openai",
        providerJob: null,
        metadata: {}
      })
    ).toThrow("Image provider returned an unsupported MIME type");
  });
});
