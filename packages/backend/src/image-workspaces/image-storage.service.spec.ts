import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jest } from "@jest/globals";
import {
  ConfiguredImageStorageService,
  type ImageStorageFetch
} from "./image-storage.service.js";
import {
  LocalImageStorageService,
  normalizeImageMimeType
} from "./local-image-storage.service.js";
import type { ImageStorageService, StoreImageInput } from "./image-storage.types.js";

describe("image storage service", () => {
  let storageRoot: string;

  beforeEach(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), "mira-image-storage-"));
  });

  afterEach(async () => {
    await rm(storageRoot, { force: true, recursive: true });
  });

  it("writes image bytes and returns a stored image reference", async () => {
    const storage = new LocalImageStorageService({
      publicBaseUrl: "http://localhost:3001",
      signingSecret: "test-secret",
      storageRoot
    });

    const ref = await storage.putImage({
      userId: "user-1",
      workspaceId: "workspace-1",
      taskId: "task-1",
      filename: "Cover Hero.PNG",
      bytes: Buffer.from("png-bytes"),
      mimeType: "image/png"
    });

    expect(ref).toEqual({
      storageKey: expect.stringMatching(
        /^local\/user-1\/workspace-1\/task-1\/[a-f0-9]{16}-cover-hero\.png$/
      ),
      mimeType: "image/png",
      width: 0,
      height: 0,
      sizeBytes: 9
    });
    await expect(storage.getImage(ref)).resolves.toEqual(Buffer.from("png-bytes"));
  });

  it("creates signed preview URLs without exposing raw storage keys", async () => {
    const storage = new LocalImageStorageService({
      publicBaseUrl: "https://mira.example",
      signingSecret: "test-secret",
      storageRoot
    });
    const ref = await storage.putImage({
      userId: "user-1",
      workspaceId: "workspace-1",
      taskId: "task-1",
      filename: "cover.png",
      bytes: Buffer.from("png-bytes"),
      mimeType: "image/png"
    });

    const signedUrl = await storage.createSignedPreviewUrl(ref);

    expect(signedUrl).toMatch(/^https:\/\/mira\.example\/api\/image-assets\/preview\?token=/);
    expect(signedUrl).not.toContain(ref.storageKey);
  });

  it("reads image bytes from signed preview tokens", async () => {
    const storage = new LocalImageStorageService({
      publicBaseUrl: "https://mira.example",
      signingSecret: "test-secret",
      storageRoot
    });
    const ref = await storage.putImage({
      userId: "user-1",
      workspaceId: "workspace-1",
      taskId: "task-1",
      filename: "cover.png",
      bytes: Buffer.from("png-bytes"),
      mimeType: "image/png"
    });
    const signedUrl = await storage.createSignedPreviewUrl(ref);
    const token = new URL(signedUrl).searchParams.get("token");

    await expect(storage.readSignedPreview(token)).resolves.toEqual({
      bytes: Buffer.from("png-bytes"),
      mimeType: "image/png"
    });
  });

  it("rejects tampered signed preview tokens", async () => {
    const storage = new LocalImageStorageService({
      publicBaseUrl: "https://mira.example",
      signingSecret: "test-secret",
      storageRoot
    });
    const ref = await storage.putImage({
      userId: "user-1",
      workspaceId: "workspace-1",
      taskId: "task-1",
      filename: "cover.png",
      bytes: Buffer.from("png-bytes"),
      mimeType: "image/png"
    });
    const signedUrl = await storage.createSignedPreviewUrl(ref);
    const token = new URL(signedUrl).searchParams.get("token");

    await expect(storage.readSignedPreview(`${token}tampered`)).rejects.toThrow(
      "Invalid image preview token"
    );
  });

  it("rejects invalid MIME types before writing", async () => {
    const storage = new LocalImageStorageService({
      publicBaseUrl: "http://localhost:3001",
      signingSecret: "test-secret",
      storageRoot
    });

    expect(() => normalizeImageMimeType("text/plain")).toThrow(
      "Unsupported image MIME type"
    );
    await expect(
      storage.putImage({
        userId: "user-1",
        workspaceId: "workspace-1",
        taskId: "task-1",
        filename: "not-image.txt",
        bytes: Buffer.from("not-image"),
        mimeType: "text/plain" as "image/png"
      })
    ).rejects.toThrow("Unsupported image MIME type");
    await expect(readdir(storageRoot)).resolves.toEqual([]);
  });

  it("delegates to local storage when runtime storage provider is local", async () => {
    const local = createLocalStorageDouble();
    const storage = new ConfiguredImageStorageService(
      createRuntimeSecrets({
        storageProvider: "local"
      }),
      local,
      {
        publicBaseUrl: "https://mira.example",
        signingSecret: "preview-secret"
      }
    );
    const input = createStoreInput();

    await expect(storage.putImage(input)).resolves.toEqual({
      storageKey: "local/user-1/workspace-1/task-1/image.png",
      mimeType: "image/png",
      width: 0,
      height: 0,
      sizeBytes: 9
    });

    expect(local.putImage).toHaveBeenCalledWith(input);
  });

  it("uses database-backed S3-compatible storage config for production image bytes", async () => {
    const local = createLocalStorageDouble();
    const fetchImage = jest.fn<ImageStorageFetch>(() =>
      Promise.resolve(new Response(null, { status: 200 }))
    );
    const storage = new ConfiguredImageStorageService(
      createRuntimeSecrets({
        storageProvider: "oss",
        storageBucket: "mira-images",
        storageRegion: "cn-shenzhen",
        storageEndpoint: "https://s3.oss-cn-shenzhen-internal.aliyuncs.com",
        storageAccessKey: "access-key",
        storageSecretKey: "secret-key"
      }),
      local,
      {
        fetch: fetchImage,
        now: () => new Date("2026-06-23T12:00:00.000Z"),
        publicBaseUrl: "https://mira.example",
        randomBytes: () => Buffer.from("0123456789abcdef", "hex"),
        signingSecret: "preview-secret"
      }
    );

    const ref = await storage.putImage(createStoreInput());

    expect(ref).toEqual({
      storageKey:
        "s3/user-1/workspace-1/task-1/0123456789abcdef-cover-hero.png",
      mimeType: "image/png",
      width: 0,
      height: 0,
      sizeBytes: 9
    });
    expect(local.putImage).not.toHaveBeenCalled();
    expect(fetchImage).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImage.mock.calls[0];
    expect(String(url)).toBe(
      "https://mira-images.s3.oss-cn-shenzhen-internal.aliyuncs.com/s3/user-1/workspace-1/task-1/0123456789abcdef-cover-hero.png"
    );
    expect(init?.method).toBe("PUT");
    const headers = new Headers(init?.headers);
    expect(headers.get("content-type")).toBe("image/png");
    expect(headers.has("host")).toBe(false);
    expect(headers.get("x-amz-date")).toBe("20260623T120000Z");
    expect(headers.get("authorization")).toContain(
      "Credential=access-key/20260623/cn-shenzhen/s3/aws4_request"
    );
    expect(headers.get("authorization")).toContain(
      "SignedHeaders=content-type;host;x-amz-content-sha256;x-amz-date"
    );
  });

  it("keeps configured storage previews behind signed same-origin tokens", async () => {
    const local = createLocalStorageDouble();
    const fetchImage = jest.fn<ImageStorageFetch>(() =>
      Promise.resolve(
        new Response(Buffer.from("png-bytes"), {
          headers: {
            "content-type": "image/png"
          },
          status: 200
        })
      )
    );
    const storage = new ConfiguredImageStorageService(
      createRuntimeSecrets({
        storageProvider: "s3",
        storageBucket: "mira-images",
        storageRegion: "cn-shenzhen",
        storageEndpoint: "https://oss.example.com",
        storageAccessKey: "access-key",
        storageSecretKey: "secret-key"
      }),
      local,
      {
        fetch: fetchImage,
        now: () => new Date("2026-06-23T12:00:00.000Z"),
        publicBaseUrl: "https://mira.example",
        signingSecret: "preview-secret"
      }
    );
    const ref = {
      storageKey: "s3/user-1/workspace-1/task-1/cover.png",
      mimeType: "image/png" as const,
      width: 0,
      height: 0,
      sizeBytes: 9
    };

    const previewUrl = await storage.createSignedPreviewUrl(ref);
    const token = new URL(previewUrl).searchParams.get("token");

    expect(previewUrl).toMatch(
      /^https:\/\/mira\.example\/api\/image-assets\/preview\?token=/
    );
    expect(previewUrl).not.toContain(ref.storageKey);
    await expect(storage.readSignedPreview?.(token)).resolves.toEqual({
      bytes: Buffer.from("png-bytes"),
      mimeType: "image/png"
    });
    expect(fetchImage).toHaveBeenCalledWith(
      "https://mira-images.oss.example.com/s3/user-1/workspace-1/task-1/cover.png",
      expect.objectContaining({
        method: "GET"
      })
    );
  });

  it("keeps path-style S3-compatible URLs for localhost storage endpoints", async () => {
    const local = createLocalStorageDouble();
    const fetchImage = jest.fn<ImageStorageFetch>(() =>
      Promise.resolve(new Response(null, { status: 200 }))
    );
    const storage = new ConfiguredImageStorageService(
      createRuntimeSecrets({
        storageProvider: "s3",
        storageBucket: "mira-images",
        storageRegion: "local",
        storageEndpoint: "http://localhost:9000",
        storageAccessKey: "access-key",
        storageSecretKey: "secret-key"
      }),
      local,
      {
        fetch: fetchImage,
        now: () => new Date("2026-06-23T12:00:00.000Z"),
        publicBaseUrl: "https://mira.example",
        randomBytes: () => Buffer.from("0123456789abcdef", "hex"),
        signingSecret: "preview-secret"
      }
    );

    await storage.putImage(createStoreInput());

    const [url] = fetchImage.mock.calls[0];
    expect(String(url)).toBe(
      "http://localhost:9000/mira-images/s3/user-1/workspace-1/task-1/0123456789abcdef-cover-hero.png"
    );
  });
});

function createStoreInput(): StoreImageInput {
  return {
    userId: "user-1",
    workspaceId: "workspace-1",
    taskId: "task-1",
    filename: "Cover Hero.PNG",
    bytes: Buffer.from("png-bytes"),
    mimeType: "image/png"
  };
}

function createLocalStorageDouble() {
  return {
    putImage: jest.fn(() =>
      Promise.resolve({
        storageKey: "local/user-1/workspace-1/task-1/image.png",
        mimeType: "image/png",
        width: 0,
        height: 0,
        sizeBytes: 9
      })
    ),
    getImage: jest.fn(),
    createSignedPreviewUrl: jest.fn(),
    readSignedPreview: jest.fn(),
    deleteImage: jest.fn()
  } satisfies jest.Mocked<ImageStorageService>;
}

function createRuntimeSecrets(config: Partial<{
  storageAccessKey: string;
  storageBucket: string;
  storageEndpoint: string;
  storageProvider: string;
  storageRegion: string;
  storageSecretKey: string;
}>) {
  return {
    getImageConfig: jest.fn(() =>
      Promise.resolve({
        provider: "openai",
        openaiApiKey: "",
        openaiBaseURL: "",
        openaiModel: "gpt-image-1",
        storageProvider: config.storageProvider ?? "local",
        storageBucket: config.storageBucket ?? "",
        storageRegion: config.storageRegion ?? "",
        storageEndpoint: config.storageEndpoint ?? "",
        storageAccessKey: config.storageAccessKey ?? "",
        storageSecretKey: config.storageSecretKey ?? "",
        maxDailyTasksPerUser: "50",
        maxImageSizeMb: "20",
        defaultQuality: "auto"
      })
    )
  };
}
