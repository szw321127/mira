import { ServiceUnavailableException } from "@nestjs/common";
import { jest } from "@jest/globals";
import type {
  RuntimeImageConfig,
  RuntimeSecretsService
} from "../admin/runtime-secrets.service.js";
import type { ImageStorageService } from "./image-storage.types.js";
import { OpenAIImageProviderService } from "./openai-image-provider.service.js";

type FetchCall = {
  init?: RequestInit;
  url: string;
};

function imageConfig(overrides: Partial<RuntimeImageConfig> = {}): RuntimeImageConfig {
  return {
    provider: "openai",
    openaiApiKey: "sk-live-secret",
    openaiModel: "gpt-image-1",
    storageProvider: "local",
    storageBucket: "",
    storageRegion: "",
    storageEndpoint: "",
    storageAccessKey: "",
    storageSecretKey: "",
    maxDailyTasksPerUser: "50",
    maxImageSizeMb: "20",
    defaultQuality: "auto",
    ...overrides
  };
}

function createRuntimeSecrets(config: RuntimeImageConfig) {
  return {
    getImageConfig: jest.fn(() => Promise.resolve(config))
  } as unknown as RuntimeSecretsService;
}

function createStorage(): ImageStorageService {
  return {
    putImage: jest.fn(),
    getImage: jest.fn((ref) =>
      Promise.resolve(Buffer.from(`bytes:${ref.storageKey}`))
    ),
    createSignedPreviewUrl: jest.fn(),
    deleteImage: jest.fn()
  };
}

function createFetch(json: unknown, ok = true) {
  const calls: FetchCall[] = [];
  const fetchMock = jest.fn((url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return Promise.resolve(
      new Response(JSON.stringify(json), {
        status: ok ? 200 : 400,
        headers: {
          "content-type": "application/json",
          "x-request-id": "req_img_1"
        }
      })
    );
  });
  return { calls, fetchMock };
}

function responseJson(base64 = Buffer.from("image-bytes").toString("base64")) {
  return {
    created: 1782196000,
    data: [
      {
        b64_json: base64,
        revised_prompt: "A clean product hero"
      }
    ],
    size: "1536x1024",
    quality: "high",
    background: "transparent",
    output_format: "png"
  };
}

describe("OpenAIImageProviderService", () => {
  it("returns a safe configuration error when the database API key is missing", async () => {
    const { fetchMock } = createFetch(responseJson());
    const service = new OpenAIImageProviderService(
      createRuntimeSecrets(imageConfig({ openaiApiKey: "" })),
      createStorage(),
      { fetch: fetchMock }
    );

    await expect(
      service.generate({
        prompt: "make a launch cover",
        size: "1024x1024",
        quality: "auto",
        background: "auto"
      })
    ).rejects.toThrow(
      new ServiceUnavailableException("图像生成服务未配置，请联系管理员")
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps generation settings to the configured OpenAI image model", async () => {
    const { calls, fetchMock } = createFetch(responseJson());
    const service = new OpenAIImageProviderService(
      createRuntimeSecrets(
        imageConfig({
          openaiModel: "gpt-image-1.5"
        })
      ),
      createStorage(),
      { fetch: fetchMock }
    );

    await expect(
      service.generate({
        prompt: "make a launch cover",
        size: "1536x1024",
        quality: "high",
        background: "transparent"
      })
    ).resolves.toEqual(
      expect.objectContaining({
        bytes: Buffer.from("image-bytes"),
        mimeType: "image/png",
        width: 1536,
        height: 1024,
        provider: "openai",
        providerJob: "req_img_1",
        metadata: expect.objectContaining({
          model: "gpt-image-1.5",
          size: "1536x1024",
          quality: "high",
          background: "transparent",
          estimatedCostUsd: 0.1,
          revisedPrompt: "A clean product hero"
        })
      })
    );

    expect(calls[0]?.url).toBe("https://api.openai.com/v1/images/generations");
    const generationHeaders = new Headers(calls[0]?.init?.headers);
    expect(generationHeaders.get("authorization")).toBe("Bearer sk-live-secret");
    expect(generationHeaders.get("content-type")).toBe("application/json");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      background: "transparent",
      model: "gpt-image-1.5",
      n: 1,
      output_format: "png",
      prompt: "make a launch cover",
      quality: "high",
      size: "1536x1024"
    });
  });

  it("leaves estimated image cost null for unrecognized OpenAI-compatible models", async () => {
    const { fetchMock } = createFetch(responseJson());
    const service = new OpenAIImageProviderService(
      createRuntimeSecrets(
        imageConfig({
          openaiModel: "gpt-image-mira"
        })
      ),
      createStorage(),
      { fetch: fetchMock }
    );

    await expect(
      service.generate({
        prompt: "make a launch cover",
        size: "1024x1024",
        quality: "high",
        background: "auto"
      })
    ).resolves.toEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({
          model: "gpt-image-mira",
          estimatedCostUsd: null
        })
      })
    );
  });

  it("uses the AI SDK image edit prompt for source image and optional mask data", async () => {
    const { calls, fetchMock } = createFetch(responseJson());
    const storage = createStorage();
    const service = new OpenAIImageProviderService(
      createRuntimeSecrets(imageConfig()),
      storage,
      { fetch: fetchMock }
    );

    await service.edit({
      prompt: "replace the background",
      image: {
        storageKey: "local/user-1/source.png",
        mimeType: "image/png",
        width: 1024,
        height: 1024,
        sizeBytes: 128
      },
      mask: {
        storageKey: "local/user-1/mask.png",
        mimeType: "image/png",
        width: 1024,
        height: 1024,
        sizeBytes: 64
      },
      size: "1024x1536"
    });

    expect(storage.getImage).toHaveBeenCalledTimes(2);
    expect(calls[0]?.url).toBe("https://api.openai.com/v1/images/edits");
    const editHeaders = new Headers(calls[0]?.init?.headers);
    expect(editHeaders.get("authorization")).toBe("Bearer sk-live-secret");
    expect(editHeaders.get("content-type")).toBeNull();
    expect(calls[0]?.init?.body).toBeInstanceOf(FormData);

    const form = calls[0]?.init?.body as FormData;
    expect(form.get("model")).toBe("gpt-image-1");
    expect(form.get("prompt")).toBe("replace the background");
    expect(form.get("n")).toBe("1");
    expect(form.get("output_format")).toBe("png");
    expect(form.get("size")).toBe("1024x1536");

    const images = form.getAll("image");
    expect(images).toHaveLength(1);
    expect(images[0]).toBeInstanceOf(File);
    const imageFile = images[0] as File;
    expect(imageFile.type).toBe("image/png");
    await expect(imageFile.text()).resolves.toBe("bytes:local/user-1/source.png");

    const maskFile = form.get("mask");
    expect(maskFile).toBeInstanceOf(File);
    expect((maskFile as File).type).toBe("image/png");
    await expect((maskFile as File).text()).resolves.toBe(
      "bytes:local/user-1/mask.png"
    );
  });

  it("wraps OpenAI failures as short safe user errors without leaking the API key", async () => {
    const { fetchMock } = createFetch(
      {
        error: {
          message: "invalid api key sk-live-secret"
        }
      },
      false
    );
    const service = new OpenAIImageProviderService(
      createRuntimeSecrets(imageConfig()),
      createStorage(),
      { fetch: fetchMock }
    );

    await expect(
      service.generate({
        prompt: "make a launch cover",
        size: "1024x1024",
        quality: "auto",
        background: "auto"
      })
    ).rejects.toThrow("图像生成失败，请稍后再试");

    await expect(
      service.generate({
        prompt: "make a launch cover",
        size: "1024x1024",
        quality: "auto",
        background: "auto"
      })
    ).rejects.not.toThrow("sk-live-secret");
  });
});
