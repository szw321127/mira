import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { Injectable } from "@nestjs/common";
import {
  type ImageStorageService,
  normalizeImageMimeType,
  type SignedImagePreview,
  type StoreImageInput,
  type StoredImageRef
} from "./image-storage.types.js";

export { normalizeImageMimeType } from "./image-storage.types.js";

export type LocalImageStorageOptions = {
  storageRoot?: string;
  publicBaseUrl?: string;
  signingSecret?: string;
};

@Injectable()
export class LocalImageStorageService implements ImageStorageService {
  private readonly publicBaseUrl: string;
  private readonly signingSecret: string;
  private readonly storageRoot: string;

  constructor(options: LocalImageStorageOptions = {}) {
    this.publicBaseUrl = options.publicBaseUrl ?? "http://localhost:3001";
    this.signingSecret =
      options.signingSecret ?? "mira-development-image-storage-signing-secret";
    this.storageRoot = options.storageRoot ?? join(".mira", "image-storage");
  }

  async putImage(input: StoreImageInput): Promise<StoredImageRef> {
    const mimeType = normalizeImageMimeType(input.mimeType);
    const bytes = normalizeBytes(input.bytes);
    const storageKey = [
      "local",
      safeSegment(input.userId),
      safeSegment(input.workspaceId),
      safeSegment(input.taskId),
      `${randomBytes(8).toString("hex")}-${safeFilename(input.filename, mimeType)}`
    ].join("/");
    const filePath = this.resolveStorageKey(storageKey);

    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, bytes);

    return {
      storageKey,
      mimeType,
      width: 0,
      height: 0,
      sizeBytes: bytes.byteLength
    };
  }

  async getImage(ref: StoredImageRef): Promise<Buffer> {
    return readFile(this.resolveStorageKey(ref.storageKey));
  }

  async createSignedPreviewUrl(ref: StoredImageRef): Promise<string> {
    const payload = Buffer.from(
      JSON.stringify({
        exp: Date.now() + 10 * 60 * 1000,
        key: ref.storageKey,
        mimeType: ref.mimeType
      })
    ).toString("base64url");
    const signature = createHmac("sha256", this.signingSecret)
      .update(payload)
      .digest("base64url");
    const url = new URL("/api/image-assets/preview", this.publicBaseUrl);
    url.searchParams.set("token", `${payload}.${signature}`);
    return url.toString();
  }

  async readSignedPreview(token: string): Promise<SignedImagePreview> {
    const { mimeType, storageKey } = this.verifyPreviewToken(token);
    return {
      bytes: await this.getImage({
        storageKey,
        mimeType,
        width: 0,
        height: 0,
        sizeBytes: 0
      }),
      mimeType
    };
  }

  async deleteImage(ref: StoredImageRef): Promise<void> {
    await rm(this.resolveStorageKey(ref.storageKey), { force: true });
  }

  private verifyPreviewToken(token: string) {
    if (typeof token !== "string" || !token.includes(".")) {
      throw new Error("Invalid image preview token");
    }
    const [payload, signature] = token.split(".");
    if (!payload || !signature) {
      throw new Error("Invalid image preview token");
    }

    const expected = createHmac("sha256", this.signingSecret)
      .update(payload)
      .digest("base64url");
    if (!safeEqual(signature, expected)) {
      throw new Error("Invalid image preview token");
    }

    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!isPreviewPayload(value) || value.exp < Date.now()) {
      throw new Error("Invalid image preview token");
    }

    return {
      storageKey: value.key,
      mimeType: normalizeImageMimeType(value.mimeType)
    };
  }

  private resolveStorageKey(storageKey: string): string {
    const parts = storageKey.split("/");
    if (parts[0] !== "local" || parts.some((part) => !part || part.includes(".."))) {
      throw new Error("Invalid local image storage key");
    }
    return join(this.storageRoot, ...parts.slice(1));
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.byteLength === rightBuffer.byteLength &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function isPreviewPayload(value: unknown): value is {
  exp: number;
  key: string;
  mimeType: string;
} {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { exp?: unknown }).exp === "number" &&
    typeof (value as { key?: unknown }).key === "string" &&
    typeof (value as { mimeType?: unknown }).mimeType === "string"
  );
}

function normalizeBytes(value: Buffer): Buffer {
  if (!Buffer.isBuffer(value) || value.byteLength === 0) {
    throw new Error("Image storage requires non-empty bytes");
  }
  return value;
}

function safeSegment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "unknown";
}

function safeFilename(filename: string, mimeType: string): string {
  const extension = extensionForMimeType(mimeType);
  const base = filename.trim().replace(extname(filename), "");
  const safeBase =
    base
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "image";
  return `${safeBase}${extension}`;
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  return ".png";
}
