export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number];

export type StoredImageRef = {
  storageKey: string;
  mimeType: ImageMimeType;
  width: number;
  height: number;
  sizeBytes: number;
};

export type SignedImagePreview = {
  bytes: Buffer;
  mimeType: ImageMimeType;
};

export type StoreImageInput = {
  userId: string;
  workspaceId: string;
  taskId: string;
  filename: string;
  bytes: Buffer;
  mimeType: ImageMimeType;
};

export interface ImageStorageService {
  putImage(input: StoreImageInput): Promise<StoredImageRef>;
  getImage(ref: StoredImageRef): Promise<Buffer>;
  createSignedPreviewUrl(ref: StoredImageRef): Promise<string>;
  readSignedPreview?(token: string): Promise<SignedImagePreview>;
  deleteImage(ref: StoredImageRef): Promise<void>;
}

export const IMAGE_STORAGE = Symbol("IMAGE_STORAGE");

export function isImageMimeType(value: unknown): value is ImageMimeType {
  return IMAGE_MIME_TYPES.includes(value as ImageMimeType);
}

export function normalizeImageMimeType(value: unknown): ImageMimeType {
  if (isImageMimeType(value)) return value;
  throw new Error("Unsupported image MIME type");
}
