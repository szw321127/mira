import {
  createHmac,
  createHash,
  randomBytes as nodeRandomBytes,
  timingSafeEqual
} from "node:crypto";
import { extname } from "node:path";
import sharp from "sharp";
import {
  normalizeImageMimeType,
  type ImageMimeType,
  type ImageStorageService,
  type SignedImagePreview,
  type StoreImageInput,
  type StoredImageRef
} from "./image-storage.types.js";

export type ImageStorageFetch = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

export type S3CompatibleImageStorageOptions = {
  accessKey: string;
  bucket: string;
  endpoint: string;
  fetch?: ImageStorageFetch;
  now?: () => Date;
  publicBaseUrl: string;
  randomBytes?: (size: number) => Buffer;
  region: string;
  secretKey: string;
  signingSecret: string;
};

const EMPTY_PAYLOAD_HASH = createHash("sha256").update("").digest("hex");
const PREVIEW_TTL_MS = 10 * 60 * 1000;

export class S3CompatibleImageStorageService implements ImageStorageService {
  private readonly accessKey: string;
  private readonly bucket: string;
  private readonly endpoint: URL;
  private readonly fetchImage: ImageStorageFetch;
  private readonly now: () => Date;
  private readonly publicBaseUrl: string;
  private readonly randomBytes: (size: number) => Buffer;
  private readonly region: string;
  private readonly secretKey: string;
  private readonly signingSecret: string;

  constructor(options: S3CompatibleImageStorageOptions) {
    assertNonEmpty(options.accessKey, "IMAGE_STORAGE_ACCESS_KEY");
    assertNonEmpty(options.bucket, "IMAGE_STORAGE_BUCKET");
    assertNonEmpty(options.endpoint, "IMAGE_STORAGE_ENDPOINT");
    assertNonEmpty(options.region, "IMAGE_STORAGE_REGION");
    assertNonEmpty(options.secretKey, "IMAGE_STORAGE_SECRET_KEY");
    assertNonEmpty(options.signingSecret, "image preview signing secret");

    this.accessKey = options.accessKey.trim();
    this.bucket = options.bucket.trim();
    this.endpoint = new URL(options.endpoint);
    this.fetchImage = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.publicBaseUrl = trimTrailingSlash(options.publicBaseUrl);
    this.randomBytes = options.randomBytes ?? nodeRandomBytes;
    this.region = options.region.trim();
    this.secretKey = options.secretKey.trim();
    this.signingSecret = options.signingSecret;
  }

  async putImage(input: StoreImageInput): Promise<StoredImageRef> {
    const mimeType = normalizeImageMimeType(input.mimeType);
    const bytes = normalizeBytes(input.bytes);
    const dimensions = await readImageDimensions(bytes);
    const storageKey = [
      "s3",
      safeSegment(input.userId),
      safeSegment(input.workspaceId),
      safeSegment(input.taskId),
      `${this.randomBytes(8).toString("hex")}-${safeFilename(
        input.filename,
        mimeType
      )}`
    ].join("/");

    await this.request("PUT", storageKey, {
      body: bytes,
      contentType: mimeType,
      payloadHash: hashBytes(bytes)
    });

    return {
      storageKey,
      mimeType,
      width: dimensions.width,
      height: dimensions.height,
      sizeBytes: bytes.byteLength
    };
  }

  async getImage(ref: StoredImageRef): Promise<Buffer> {
    const response = await this.request("GET", ref.storageKey, {
      payloadHash: EMPTY_PAYLOAD_HASH
    });
    return Buffer.from(await response.arrayBuffer());
  }

  async createSignedPreviewUrl(ref: StoredImageRef): Promise<string> {
    const payload = Buffer.from(
      JSON.stringify({
        exp: this.now().getTime() + PREVIEW_TTL_MS,
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
    await this.request("DELETE", ref.storageKey, {
      payloadHash: EMPTY_PAYLOAD_HASH
    });
  }

  private async request(
    method: "DELETE" | "GET" | "PUT",
    storageKey: string,
    options: {
      body?: Buffer;
      contentType?: ImageMimeType;
      payloadHash: string;
    }
  ): Promise<Response> {
    const url = this.objectUrl(storageKey);
    const headers = this.createSignedHeaders(
      method,
      url,
      options.payloadHash,
      options.contentType
    );
    headers.delete("host");
    const response = await this.fetchImage(url.toString(), {
      body: options.body,
      headers,
      method
    });
    if (!response.ok) {
      throw new Error("Image storage request failed");
    }
    return response;
  }

  private createSignedHeaders(
    method: string,
    url: URL,
    payloadHash: string,
    contentType?: ImageMimeType
  ) {
    const timestamp = formatAmzDate(this.now());
    const dateStamp = timestamp.slice(0, 8);
    const headers = new Headers();
    if (contentType) headers.set("content-type", contentType);
    headers.set("host", url.host);
    headers.set("x-amz-content-sha256", payloadHash);
    headers.set("x-amz-date", timestamp);

    const signedHeaders = createSignedHeadersList(headers);
    const canonicalRequest = [
      method,
      url.pathname,
      canonicalQuery(url),
      canonicalHeaders(headers),
      signedHeaders,
      payloadHash
    ].join("\n");
    const scope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      timestamp,
      scope,
      hashString(canonicalRequest)
    ].join("\n");
    const signature = createHmac(
      "sha256",
      signingKey(this.secretKey, dateStamp, this.region)
    )
      .update(stringToSign)
      .digest("hex");

    headers.set(
      "authorization",
      [
        `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${scope}`,
        `SignedHeaders=${signedHeaders}`,
        `Signature=${signature}`
      ].join(", ")
    );

    return headers;
  }

  private objectUrl(storageKey: string): URL {
    if (!storageKey.startsWith("s3/")) {
      throw new Error("Invalid S3 image storage key");
    }
    const url = new URL(this.endpoint.toString());
    const keyParts = storageKey.split("/").filter(Boolean);
    if (shouldUseVirtualHostedStyle(url)) {
      url.hostname = `${this.bucket}.${url.hostname}`;
      url.pathname = `/${[
        ...url.pathname.split("/").filter(Boolean),
        ...keyParts
      ].map(encodeURIComponent).join("/")}`;
      url.search = "";
      return url;
    }

    const prefixParts = url.pathname.split("/").filter(Boolean);
    const pathParts = [...prefixParts, this.bucket, ...keyParts];
    url.pathname = `/${pathParts.map(encodeURIComponent).join("/")}`;
    url.search = "";
    return url;
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
    if (!isPreviewPayload(value) || value.exp < this.now().getTime()) {
      throw new Error("Invalid image preview token");
    }

    return {
      storageKey: value.key,
      mimeType: normalizeImageMimeType(value.mimeType)
    };
  }
}

function assertNonEmpty(value: string, label: string) {
  if (!value.trim()) {
    throw new Error(`${label} is required for image storage`);
  }
}

function canonicalHeaders(headers: Headers): string {
  return [...headers.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}:${value.trim().replace(/\s+/g, " ")}`)
    .join("\n")
    .concat("\n");
}

function canonicalQuery(url: URL): string {
  return [...url.searchParams.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

function createSignedHeadersList(headers: Headers): string {
  return [...headers.keys()].sort().join(";");
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  return ".png";
}

function formatAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function hashBytes(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashString(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
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

async function readImageDimensions(bytes: Buffer) {
  try {
    const metadata = await sharp(bytes).metadata();
    return {
      width: Math.max(0, Math.round(metadata.width ?? 0)),
      height: Math.max(0, Math.round(metadata.height ?? 0))
    };
  } catch {
    return { width: 0, height: 0 };
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

function safeSegment(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "unknown";
}

function shouldUseVirtualHostedStyle(url: URL): boolean {
  return url.hostname !== "localhost" && !isIpAddress(url.hostname);
}

function isIpAddress(hostname: string): boolean {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(":");
}

function signingKey(secretKey: string, dateStamp: string, region: string): Buffer {
  const dateKey = hmac(`AWS4${secretKey}`, dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
