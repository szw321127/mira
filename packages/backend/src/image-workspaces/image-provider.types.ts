import {
  isImageMimeType,
  type ImageMimeType,
  type StoredImageRef
} from "./image-storage.types.js";

export const IMAGE_GENERATE_SIZES = [
  "1024x1024",
  "1024x1536",
  "1536x1024",
  "auto"
] as const;

export const IMAGE_ASPECT_RATIOS = [
  "1:1",
  "2:1",
  "4:3",
  "16:9",
  "1:2",
  "3:4",
  "9:16"
] as const;

export const IMAGE_GENERATE_QUALITIES = ["low", "medium", "high", "auto"] as const;
export const IMAGE_BACKGROUNDS = ["transparent", "opaque", "auto"] as const;

export type ImageGenerateSize = (typeof IMAGE_GENERATE_SIZES)[number];
export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number];
export type ImageGenerateQuality = (typeof IMAGE_GENERATE_QUALITIES)[number];
export type ImageBackground = (typeof IMAGE_BACKGROUNDS)[number];

export type ImageGenerateInput = {
  prompt: string;
  aspectRatio?: ImageAspectRatio;
  size: ImageGenerateSize;
  quality: ImageGenerateQuality;
  background: ImageBackground;
};

export type ImageEditInput = {
  prompt: string;
  image: StoredImageRef;
  mask?: StoredImageRef;
  size: ImageGenerateInput["size"];
};

export type ImageProviderResult = {
  bytes: Buffer;
  mimeType: ImageMimeType;
  width: number;
  height: number;
  provider: string;
  providerJob: string | null;
  metadata: Record<string, unknown>;
};

export interface ImageProviderAdapter {
  generate(input: ImageGenerateInput): Promise<ImageProviderResult>;
  edit(input: ImageEditInput): Promise<ImageProviderResult>;
}

export const IMAGE_PROVIDER = Symbol("IMAGE_PROVIDER");

export function isImageGenerateSize(value: unknown): value is ImageGenerateSize {
  return IMAGE_GENERATE_SIZES.includes(value as ImageGenerateSize);
}

export function isImageAspectRatio(value: unknown): value is ImageAspectRatio {
  return IMAGE_ASPECT_RATIOS.includes(value as ImageAspectRatio);
}

export function imageGenerateSizeForAspectRatio(
  aspectRatio: ImageAspectRatio
): ImageGenerateSize {
  switch (aspectRatio) {
    case "1:2":
    case "3:4":
    case "9:16":
      return "1024x1536";
    case "2:1":
    case "4:3":
    case "16:9":
      return "1536x1024";
    case "1:1":
    default:
      return "1024x1024";
  }
}

export function isImageGenerateQuality(value: unknown): value is ImageGenerateQuality {
  return IMAGE_GENERATE_QUALITIES.includes(value as ImageGenerateQuality);
}

export function isImageBackground(value: unknown): value is ImageBackground {
  return IMAGE_BACKGROUNDS.includes(value as ImageBackground);
}

export function assertImageProviderResult(value: unknown): ImageProviderResult {
  if (!isRecord(value)) {
    throw new Error("Image provider returned an invalid result");
  }
  if (!Buffer.isBuffer(value.bytes) || value.bytes.length === 0) {
    throw new Error("Image provider returned empty bytes");
  }
  if (!isImageMimeType(value.mimeType)) {
    throw new Error("Image provider returned an unsupported MIME type");
  }
  if (!isPositiveInteger(value.width) || !isPositiveInteger(value.height)) {
    throw new Error("Image provider returned invalid dimensions");
  }
  if (typeof value.provider !== "string" || !value.provider.trim()) {
    throw new Error("Image provider returned an invalid provider name");
  }
  if (value.providerJob !== null && typeof value.providerJob !== "string") {
    throw new Error("Image provider returned an invalid provider job id");
  }
  if (!isRecord(value.metadata)) {
    throw new Error("Image provider returned invalid metadata");
  }

  return {
    bytes: value.bytes,
    mimeType: value.mimeType,
    width: value.width,
    height: value.height,
    provider: value.provider.trim(),
    providerJob: value.providerJob,
    metadata: value.metadata
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}
