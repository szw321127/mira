import { jest } from "@jest/globals";
import type {
  RuntimeImageConfig,
  RuntimeModelConfig
} from "../admin/runtime-secrets.service.js";
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

function createRuntimeSecrets(
  config = imageConfig(),
  model = modelConfig()
) {
  return {
    getImageConfig: jest.fn(() => Promise.resolve(config)),
    getModelConfig: jest.fn(() => Promise.resolve(model))
  };
}

function modelConfig(
  overrides: Partial<RuntimeModelConfig> = {}
): RuntimeModelConfig {
  return {
    baseURL: "https://model.example/v1",
    apiKey: "model-secret",
    modelName: "configured-text-model",
    ...overrides
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

  it("uses the configured text model for the Responses image tool and the configured image model for image generation", async () => {
    const createModel = jest.fn(() => "responses-model" as never);
    const streamText = jest.fn(() => ({
      fullStream: (async function* () {
        await Promise.resolve();
        yield {
          type: "tool-call",
          toolName: "image_generation",
          toolCallId: "image-call-1"
        };
        yield {
          type: "tool-result",
          toolName: "image_generation",
          toolCallId: "image-call-1",
          output: { result: "ZmluYWw=" }
        };
      })()
    }));
    const service = new ChatImageGenerationService(
      createRuntimeSecrets() as never,
      {
        createModel,
        streamText: streamText as never
      }
    );

    const events = [];
    for await (const event of service.streamWithConfig({
      prompt: "生成一张图片",
      config: {
        image: imageConfig({ openaiModel: "configured-image-model" }),
        model: modelConfig({ modelName: "configured-text-model" })
      }
    })) {
      events.push(event);
    }

    expect(createModel).toHaveBeenCalledWith({
      image: expect.objectContaining({ openaiModel: "configured-image-model" }),
      model: expect.objectContaining({ modelName: "configured-text-model" })
    });
    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "responses-model",
        tools: {
          image_generation: expect.objectContaining({
            args: expect.objectContaining({
              model: "configured-image-model"
            })
          })
        }
      })
    );
    expect(events).toContainEqual({
      type: "image-generation-complete",
      id: "image-call-1",
      imageBase64: "ZmluYWw=",
      mimeType: "image/png"
    });
  });

  it("falls back to direct image generation when the Responses image tool stream errors", async () => {
    const streamText = jest.fn(() => ({
      fullStream: (async function* () {
        await Promise.resolve();
        yield {
          type: "error",
          error: new Error(
            "分组 sora 下模型 configured-text-model 无可用渠道（distributor）"
          )
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
