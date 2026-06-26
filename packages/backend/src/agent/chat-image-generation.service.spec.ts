import { jest } from "@jest/globals";
import type { RuntimeImageConfig } from "../admin/runtime-secrets.service.js";
import { ChatImageGenerationService } from "./chat-image-generation.service.js";

function imageConfig(overrides: Partial<RuntimeImageConfig> = {}): RuntimeImageConfig {
  return {
    provider: "openai",
    openaiApiKey: "image-secret",
    openaiBaseURL: "https://image.example/v1",
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

function createRuntimeSecrets(config = imageConfig()) {
  return {
    getImageConfig: jest.fn(() => Promise.resolve(config))
  };
}

describe("ChatImageGenerationService", () => {
  it("recognizes photography-style image generation wording", () => {
    const service = new ChatImageGenerationService(
      createRuntimeSecrets() as never,
      {}
    );

    expect(service.shouldHandle("生成一张边牧写真摄影图")).toBe(true);
  });

  it("falls back to direct image generation when the Responses image tool stream errors", async () => {
    const streamText = jest.fn(() => ({
      fullStream: (async function* () {
        await Promise.resolve();
        yield {
          type: "error",
          error: new Error("分组 sora 下模型 gpt-5 无可用渠道（distributor）")
        };
      })()
    }));
    const generateImage = jest.fn(() =>
      Promise.resolve({
        image: {
          base64: "ZmluYWw=",
          mediaType: "image/png",
          uint8Array: new Uint8Array()
        },
        images: [],
        providerMetadata: {},
        responses: [],
        usage: {},
        warnings: []
      })
    );
    const service = new ChatImageGenerationService(
      createRuntimeSecrets() as never,
      {
        createModel: jest.fn(() => "model" as never),
        generateImage: generateImage as never,
        streamText: streamText as never
      }
    );

    const events = [];
    for await (const event of service.streamFromPrompt("生成一张图片")) {
      events.push(event);
    }

    expect(generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        n: 1,
        prompt: "生成一张图片"
      })
    );
    expect(events).toEqual([
      {
        type: "image-generation-start",
        id: expect.stringMatching(/^image-/),
        prompt: "生成一张图片"
      },
      {
        type: "image-generation-progress",
        id: expect.stringMatching(/^image-/),
        stage: "queued",
        message: "已提交图像生成请求"
      },
      {
        type: "image-generation-progress",
        id: expect.stringMatching(/^image-/),
        stage: "generating",
        message: "模型正在生成图像"
      },
      {
        type: "image-generation-progress",
        id: expect.stringMatching(/^image-/),
        stage: "finalizing",
        message: "正在整理图像结果"
      },
      {
        type: "image-generation-complete",
        id: expect.stringMatching(/^image-/),
        imageBase64: "ZmluYWw=",
        mimeType: "image/png"
      }
    ]);
  });

  it("emits a visible error when both Responses and direct image generation fail", async () => {
    const streamText = jest.fn(() => ({
      fullStream: (async function* () {
        await Promise.resolve();
        yield {
          type: "error",
          error: new Error("responses unavailable")
        };
      })()
    }));
    const service = new ChatImageGenerationService(
      createRuntimeSecrets() as never,
      {
        createModel: jest.fn(() => "model" as never),
        generateImage: jest.fn(() =>
          Promise.reject(new Error("no available channel"))
        ) as never,
        streamText: streamText as never
      }
    );

    const events = [];
    for await (const event of service.streamFromPrompt("生成一张图片")) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        type: "image-generation-start",
        id: expect.stringMatching(/^image-/),
        prompt: "生成一张图片"
      },
      {
        type: "image-generation-progress",
        id: expect.stringMatching(/^image-/),
        stage: "queued",
        message: "已提交图像生成请求"
      },
      {
        type: "image-generation-progress",
        id: expect.stringMatching(/^image-/),
        stage: "generating",
        message: "模型正在生成图像"
      },
      {
        type: "error",
        message: "图像模型通道暂不可用，请稍后重试或在后台切换模型"
      }
    ]);
  });
});
