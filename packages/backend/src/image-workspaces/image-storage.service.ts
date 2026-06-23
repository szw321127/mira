import { Injectable } from "@nestjs/common";
import {
  RuntimeSecretsService,
  type RuntimeImageConfig
} from "../admin/runtime-secrets.service.js";
import { LocalImageStorageService } from "./local-image-storage.service.js";
import {
  S3CompatibleImageStorageService,
  type ImageStorageFetch
} from "./s3-compatible-image-storage.service.js";

export { IMAGE_STORAGE } from "./image-storage.types.js";
export type {
  ImageMimeType,
  ImageStorageService,
  SignedImagePreview,
  StoreImageInput,
  StoredImageRef
} from "./image-storage.types.js";

import type {
  ImageStorageService,
  SignedImagePreview,
  StoreImageInput,
  StoredImageRef
} from "./image-storage.types.js";

export type { ImageStorageFetch };

export type ConfiguredImageStorageOptions = {
  fetch?: ImageStorageFetch;
  now?: () => Date;
  publicBaseUrl?: string;
  randomBytes?: (size: number) => Buffer;
  signingSecret?: string;
};

@Injectable()
export class ConfiguredImageStorageService implements ImageStorageService {
  constructor(
    private readonly runtimeSecrets: Pick<RuntimeSecretsService, "getImageConfig">,
    private readonly localStorage: LocalImageStorageService | ImageStorageService,
    private readonly options: ConfiguredImageStorageOptions = {}
  ) {}

  async putImage(input: StoreImageInput): Promise<StoredImageRef> {
    return (await this.resolveStorage()).putImage(input);
  }

  async getImage(ref: StoredImageRef): Promise<Buffer> {
    return (await this.resolveStorage()).getImage(ref);
  }

  async createSignedPreviewUrl(ref: StoredImageRef): Promise<string> {
    return (await this.resolveStorage()).createSignedPreviewUrl(ref);
  }

  async readSignedPreview(token: string): Promise<SignedImagePreview> {
    const storage = await this.resolveStorage();
    if (!storage.readSignedPreview) {
      throw new Error("Image preview not found.");
    }
    return storage.readSignedPreview(token);
  }

  async deleteImage(ref: StoredImageRef): Promise<void> {
    await (await this.resolveStorage()).deleteImage(ref);
  }

  private async resolveStorage(): Promise<ImageStorageService> {
    const config = await this.runtimeSecrets.getImageConfig();
    const provider = normalizeStorageProvider(config.storageProvider);
    if (provider === "local") return this.localStorage;
    return this.createS3Storage(config);
  }

  private createS3Storage(config: RuntimeImageConfig) {
    return new S3CompatibleImageStorageService({
      accessKey: config.storageAccessKey,
      bucket: config.storageBucket,
      endpoint: config.storageEndpoint,
      fetch: this.options.fetch,
      now: this.options.now,
      publicBaseUrl: resolveImagePreviewPublicBaseUrl(this.options.publicBaseUrl),
      randomBytes: this.options.randomBytes,
      region: config.storageRegion,
      secretKey: config.storageSecretKey,
      signingSecret: resolveImagePreviewSigningSecret(this.options.signingSecret)
    });
  }
}

export function createLocalImageStorageService() {
  return new LocalImageStorageService({
    publicBaseUrl: resolveImagePreviewPublicBaseUrl(),
    signingSecret: resolveImagePreviewSigningSecret()
  });
}

export function resolveImagePreviewPublicBaseUrl(value?: string): string {
  return (
    value?.trim() ||
    process.env.IMAGE_PUBLIC_BASE_URL?.trim() ||
    process.env.FRONTEND_ORIGIN?.trim() ||
    "http://localhost:3000"
  );
}

export function resolveImagePreviewSigningSecret(value?: string): string {
  return (
    value?.trim() ||
    process.env.IMAGE_PREVIEW_SIGNING_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    "mira-development-image-storage-signing-secret"
  );
}

function normalizeStorageProvider(value: string): "local" | "s3" {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "local") return "local";
  if (
    normalized === "oss" ||
    normalized === "s3" ||
    normalized === "s3-compatible"
  ) {
    return "s3";
  }
  throw new Error("Unsupported image storage provider");
}
