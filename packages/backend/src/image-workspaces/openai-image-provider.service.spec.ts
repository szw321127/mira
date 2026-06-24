import { Logger, ServiceUnavailableException } from "@nestjs/common";
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
    openaiBaseURL: "",
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

function createFetchSequence(
  responses: Array<{
    body: Buffer | string;
    contentType?: string;
    ok?: boolean;
    status?: number;
  }>
) {
  const calls: FetchCall[] = [];
  const fetchMock = jest.fn((url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const response = responses.shift();
    if (!response) throw new Error("Unexpected fetch call");
    return Promise.resolve(
      new Response(response.body, {
        status: response.status ?? (response.ok === false ? 400 : 200),
        headers: {
          "content-type": response.contentType ?? "application/json",
          "x-request-id": "req_img_1"
        }
      })
    );
  });
  return { calls, fetchMock };
}

function readJsonRequestBody(call: FetchCall | undefined): unknown {
  const body = call?.init?.body;
  if (typeof body !== "string") {
    throw new Error("Expected a JSON request body");
  }
  return JSON.parse(body);
}

function responseJson(
  base64 = Buffer.from("image-bytes").toString("base64"),
  overrides: Record<string, unknown> = {}
) {
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
    output_format: "png",
    ...overrides
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
        aspectRatio: "16:9",
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
            aspectRatio: "16:9",
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
    expect(readJsonRequestBody(calls[0])).toEqual({
      background: "transparent",
      model: "gpt-image-1.5",
      n: 1,
      output_format: "png",
      prompt: expect.stringContaining("16:9"),
      quality: "high",
      size: "1536x1024"
    });
    expect(readJsonRequestBody(calls[0])).not.toHaveProperty("aspectRatio");
    expect(readJsonRequestBody(calls[0])).not.toHaveProperty("aspect_ratio");
  });

  it("uses the configured OpenAI-compatible image base URL for generation requests", async () => {
    const { calls, fetchMock } = createFetch(responseJson());
    const service = new OpenAIImageProviderService(
      createRuntimeSecrets(
        imageConfig({
          openaiBaseURL: "https://image-gateway.example/v1"
        })
      ),
      createStorage(),
      { fetch: fetchMock }
    );

    await service.generate({
      prompt: "make a launch cover",
      size: "1024x1024",
      quality: "auto",
      background: "auto"
    });

    expect(calls[0]?.url).toBe(
      "https://image-gateway.example/v1/images/generations"
    );
  });

  it("normalizes OpenAI-compatible image URL responses into image bytes", async () => {
    const { calls, fetchMock } = createFetchSequence([
      {
        body: JSON.stringify(
          responseJson(undefined, {
            data: [{ url: "https://image-gateway.example/generated.png" }]
          })
        )
      },
      {
        body: Buffer.from("downloaded-image-bytes"),
        contentType: "image/png"
      }
    ]);
    const service = new OpenAIImageProviderService(
      createRuntimeSecrets(
        imageConfig({
          openaiBaseURL: "https://image-gateway.example/v1",
          openaiModel: "gpt-image-2"
        })
      ),
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
    ).resolves.toEqual(
      expect.objectContaining({
        bytes: Buffer.from("downloaded-image-bytes"),
        mimeType: "image/png",
        metadata: expect.objectContaining({
          model: "gpt-image-2"
        })
      })
    );

    expect(calls[0]?.url).toBe("https://image-gateway.example/v1/images/generations");
    expect(readJsonRequestBody(calls[0])).toEqual(
      expect.objectContaining({
        model: "gpt-image-2",
        output_format: "png"
      })
    );
    expect(readJsonRequestBody(calls[0])).not.toHaveProperty("response_format");
    expect(calls[1]?.url).toBe("https://image-gateway.example/generated.png");
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

  it("estimates gpt-image-2 usage from token usage details", async () => {
    const { fetchMock } = createFetch(
      responseJson(Buffer.from("image-bytes").toString("base64"), {
        usage: {
          input_tokens: 500,
          output_tokens: 1000,
          total_tokens: 1500,
          input_tokens_details: {
            text_tokens: 100,
            image_tokens: 400
          }
        }
      })
    );
    const service = new OpenAIImageProviderService(
      createRuntimeSecrets(
        imageConfig({
          openaiModel: "gpt-image-2"
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
          model: "gpt-image-2",
          inputTokens: 500,
          textInputTokens: 100,
          imageInputTokens: 400,
          outputTokens: 1000,
          totalTokens: 1500,
          estimatedCostUsd: 0.0337
        })
      })
    );
  });

  it("uses the AI SDK image edit prompt for source image and optional mask data", async () => {
    const { calls, fetchMock } = createFetch(responseJson());
    const getImageMock = jest.fn((ref: { storageKey: string }) =>
      Promise.resolve(Buffer.from(`bytes:${ref.storageKey}`))
    );
    const storage: ImageStorageService = {
      ...createStorage(),
      getImage: getImageMock as ImageStorageService["getImage"]
    };
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

    expect(getImageMock.mock.calls).toHaveLength(2);
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
    const loggerSpy = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
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

    expect(loggerSpy).toHaveBeenCalledWith(
      expect.stringContaining("OpenAI image request failed"),
      expect.anything()
    );
    expect(JSON.stringify(loggerSpy.mock.calls)).not.toContain("sk-live-secret");
    loggerSpy.mockRestore();
  });

  it("maps image safety rejections to actionable safe user errors", async () => {
    const loggerSpy = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    const { fetchMock } = createFetch(
      {
        error: {
          message:
            "Your request was rejected by the safety system. safety_violations=[sexual]. sk-live-secret"
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
        prompt: "restricted prompt",
        size: "1024x1024",
        quality: "auto",
        background: "auto"
      })
    ).rejects.toThrow("提示词可能包含平台限制内容，请调整后再试");

    expect(JSON.stringify(loggerSpy.mock.calls)).not.toContain("sk-live-secret");
    loggerSpy.mockRestore();
  });

  it("maps provider channel exhaustion to an actionable safe user error", async () => {
    const loggerSpy = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    const { fetchMock } = createFetch(
      {
        error: {
          message:
            "分组 sora 下模型 gpt-image-2 无可用渠道（distributor），请尝试切换其他分组"
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
    ).rejects.toThrow("图像模型通道暂不可用，请稍后重试或在后台切换模型");

    expect(JSON.stringify(loggerSpy.mock.calls)).not.toContain("sk-live-secret");
    loggerSpy.mockRestore();
  });
});
