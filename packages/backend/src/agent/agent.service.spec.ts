import { jest } from "@jest/globals";
import { ToolRegistry } from "@rednote/agent";
import { AgentService } from "./agent.service.js";
import type {
  RuntimeImageConfig,
  RuntimeModelConfig,
  RuntimeSearchConfig
} from "../admin/runtime-secrets.service.js";

describe("AgentService", () => {
  it("uses the last non-empty user message and keeps previous messages as history", async () => {
    const runEvents = jest.fn(async function* (content: string) {
      await Promise.resolve();
      yield { type: "text-delta", text: content };
    });
    const createHarness = jest.fn(() => ({ runEvents }));
    const createModel = jest.fn(() => "model");
    const createRegistry = jest.fn(() => new ToolRegistry());
    const service = new AgentService(
      {
        createModel,
        createRegistry,
        createHarness
      },
      createRuntimeSecrets({
        model: {
          baseURL: "https://db-model.example/v1",
          apiKey: "db-model-secret",
          modelName: "mira-db"
        },
        search: { tavilyApiKey: "db-tavily-secret" }
      })
    );

    const events = [];
    for await (const event of service.streamChat({
      conversationId: "conversation-1",
      messages: [
        { role: "user", content: "第一条" },
        { role: "assistant", content: "回复" },
        { role: "user", content: "  最新问题  " }
      ]
    })) {
      events.push(event);
    }

    expect(createHarness).toHaveBeenCalledWith({
      model: "model",
      registry: expect.any(ToolRegistry),
      messages: [
        { role: "user", content: "第一条" },
        { role: "assistant", content: "回复" }
      ],
      sessionId: "conversation-1",
      maxSteps: 30
    });
    expect(createModel).toHaveBeenCalledWith({
      baseURL: "https://db-model.example/v1",
      apiKey: "db-model-secret",
      modelName: "mira-db"
    });
    expect(createRegistry).toHaveBeenCalledWith({
      tavilyApiKey: "db-tavily-secret"
    });
    expect(runEvents).toHaveBeenCalledWith("  最新问题  ");
    expect(events).toEqual([{ type: "text-delta", text: "  最新问题  " }]);
  });

  it("converts chat image attachments into model image parts", async () => {
    const runEvents = jest.fn(async function* () {
      await Promise.resolve();
      yield { type: "stop", reason: "complete" };
    });
    const createHarness = jest.fn(() => ({ runEvents }));
    const service = new AgentService(
      {
        createModel: jest.fn(() => "model"),
        createRegistry: jest.fn(() => new ToolRegistry()),
        createHarness
      },
      createRuntimeSecrets()
    );
    const attachment = {
      id: "att-1",
      type: "image" as const,
      name: "source.png",
      mimeType: "image/png",
      dataUrl: "data:image/png;base64,aGVsbG8=",
      sizeBytes: 5
    };

    for await (const event of service.streamChat({
      conversationId: "conversation-1",
      messages: [
        { role: "user", content: "第一张", attachments: [attachment] },
        { role: "assistant", content: "已收到" },
        { role: "user", content: "  看这张  ", attachments: [attachment] }
      ]
    })) {
      expect(event).toBeDefined();
    }

    expect(createHarness).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "第一张" },
              { type: "image", image: "aGVsbG8=", mediaType: "image/png" }
            ]
          },
          { role: "assistant", content: "已收到" }
        ]
      })
    );
    expect(runEvents).toHaveBeenCalledWith([
      { type: "text", text: "  看这张  " },
      { type: "image", image: "aGVsbG8=", mediaType: "image/png" }
    ]);
  });

  it("keeps generated image summaries in conversation history for follow-up image edits", async () => {
    const runEvents = jest.fn(async function* () {
      await Promise.resolve();
      yield { type: "stop", reason: "done" };
    });
    const createHarness = jest.fn(() => ({ runEvents }));
    const service = new AgentService(
      {
        createModel: jest.fn(() => "model"),
        createRegistry: jest.fn(() => new ToolRegistry()),
        createHarness
      },
      createRuntimeSecrets()
    );

    for await (const event of service.streamChat({
      conversationId: "conversation-1",
      messages: [
        { role: "user", content: "生成一张边牧写真摄影图" },
        {
          role: "assistant",
          content: "",
          generatedImages: [
            {
              id: "image-1",
              prompt: "一张边牧写真摄影图，草地背景",
              status: "complete",
              imageBase64: "large-base64-should-not-reach-model",
              mimeType: "image/png",
              partialIndex: 0,
              updatedAt: "2026-06-27T00:00:00.000Z"
            }
          ]
        },
        { role: "user", content: "背景太糊了，重新生成一张清晰背景的" }
      ]
    })) {
      expect(event).toBeDefined();
    }

    expect(createHarness).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: "user", content: "生成一张边牧写真摄影图" },
          {
            role: "assistant",
            content:
              "[已生成图片]\n- image-1: 一张边牧写真摄影图，草地背景"
          }
        ]
      })
    );
  });

  it("does not read model or search keys from process.env", async () => {
    const originalEnv = { ...process.env };
    process.env = {
      ...originalEnv,
      AGENT_MODEL_BASE_URL: "https://env-model.example/v1",
      AGENT_MODEL_API_KEY: "env-model-secret",
      AGENT_MODEL_NAME: "env-model",
      TAVILY_API_KEY: "env-tavily-secret"
    };

    try {
      const runEvents = jest.fn(async function* () {
        await Promise.resolve();
        yield { type: "stop", reason: "complete" };
      });
      const createHarness = jest.fn(() => ({ runEvents }));
      const createModel = jest.fn(() => "model");
      const createRegistry = jest.fn(() => new ToolRegistry());
      const service = new AgentService(
        {
          createModel,
          createRegistry,
          createHarness
        },
        createRuntimeSecrets()
      );

      for await (const event of service.streamChat({
        conversationId: "conversation-1",
        messages: [{ role: "user", content: "你好" }]
      })) {
        expect(event).toBeDefined();
      }

      expect(createModel).toHaveBeenCalledWith({
        baseURL: "",
        apiKey: "",
        modelName: ""
      });
      expect(createRegistry).toHaveBeenCalledWith({ tavilyApiKey: "" });
    } finally {
      process.env = originalEnv;
    }
  });

  it("streams image events from the agent image generation tool", async () => {
    const registry = new ToolRegistry();
    const createImageStream = jest.fn(async function* () {
      await Promise.resolve();
      yield {
        type: "image-generation-start",
        id: "image-call-1",
        prompt: "一只橙色猫在写小红书文案"
      };
      yield {
        type: "image-generation-partial",
        id: "image-call-1",
        imageBase64: "cGFydGlhbA==",
        mimeType: "image/png",
        index: 1
      };
      yield {
        type: "image-generation-complete",
        id: "image-call-1",
        imageBase64: "ZmluYWw=",
        mimeType: "image/png"
      };
    });
    const runEvents = jest.fn(async function* () {
      await Promise.resolve();
      yield {
        type: "tool-call" as const,
        toolName: "generate_image",
        input: { prompt: "一只橙色猫在写小红书文案" }
      };
      const tool = registry.get("generate_image");
      if (!tool) throw new Error("generate_image tool was not registered");
      const output = await tool.execute({
        prompt: "一只橙色猫在写小红书文案"
      });
      yield {
        type: "tool-result" as const,
        toolName: "generate_image",
        output,
        preview: "generated image"
      };
      yield { type: "stop" as const, reason: "done" as const };
    });
    const service = new AgentService(
      {
        createModel: jest.fn(() => "model"),
        createRegistry: jest.fn(() => registry),
        createHarness: jest.fn(() => ({ runEvents })),
        createImageStream
      },
      createRuntimeSecrets({
        image: {
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
          defaultQuality: "auto"
        }
      })
    );

    const events = [];
    for await (const event of service.streamChat({
      conversationId: "conversation-1",
      messages: [{ role: "user", content: "生成一张橙色猫写文案的图片" }]
    })) {
      events.push(event);
    }

    expect(createImageStream).toHaveBeenCalledWith({
      prompt: "一只橙色猫在写小红书文案",
      config: expect.objectContaining({
        openaiApiKey: "image-secret",
        openaiModel: "gpt-image-1"
      })
    });
    expect(events).toEqual(
      expect.arrayContaining([
        {
          type: "tool-call",
          id: "tool-0",
          toolName: "generate_image",
          inputPreview: "{\"prompt\":\"一只橙色猫在写小红书文案\"}"
        },
        {
          type: "image-generation-start",
          id: "image-call-1",
          prompt: "一只橙色猫在写小红书文案"
        },
        {
          type: "image-generation-partial",
          id: "image-call-1",
          imageBase64: "cGFydGlhbA==",
          mimeType: "image/png",
          index: 1
        },
        {
          type: "image-generation-complete",
          id: "image-call-1",
          imageBase64: "ZmluYWw=",
          mimeType: "image/png"
        }
      ])
    );
    expect(events).toContainEqual({
      type: "tool-result",
      id: "tool-1",
      toolName: "generate_image",
      outputPreview: "generated image"
    });
    expect(events).not.toContainEqual({ type: "stop", reason: "done" });
  });

  it("does not append a done stop event after a failed chat image generation stream", async () => {
    const registry = new ToolRegistry();
    const createImageStream = jest.fn(async function* () {
      await Promise.resolve();
      {
        // Keep this generator asynchronous in tests so event merging mirrors the real stream.
      }
      yield {
        type: "image-generation-start",
        id: "image-call-1",
        prompt: "生成图片"
      };
      yield {
        type: "error",
        message: "图像模型通道暂不可用，请稍后重试或在后台切换模型"
      };
    });
    const runEvents = jest.fn(async function* () {
      await Promise.resolve();
      yield {
        type: "tool-call" as const,
        toolName: "generate_image",
        input: { prompt: "生成图片" }
      };
      const tool = registry.get("generate_image");
      if (!tool) throw new Error("generate_image tool was not registered");
      const output = await tool.execute({ prompt: "生成图片" });
      yield {
        type: "tool-result" as const,
        toolName: "generate_image",
        output,
        preview: "failed image"
      };
      yield { type: "stop" as const, reason: "done" as const };
    });
    const service = new AgentService(
      {
        createModel: jest.fn(() => "model"),
        createRegistry: jest.fn(() => registry),
        createHarness: jest.fn(() => ({ runEvents })),
        createImageStream
      },
      createRuntimeSecrets({
        image: {
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
          defaultQuality: "auto"
        }
      })
    );

    const events = [];
    for await (const event of service.streamChat({
      conversationId: "conversation-1",
      messages: [{ role: "user", content: "生成一张图片" }]
    })) {
      events.push(event);
    }

    expect(events).toEqual(
      expect.arrayContaining([
        {
          type: "tool-call",
          id: "tool-0",
          toolName: "generate_image",
          inputPreview: "{\"prompt\":\"生成图片\"}"
        },
        {
          type: "image-generation-start",
          id: "image-call-1",
          prompt: "生成图片"
        },
        {
          type: "error",
          message: "图像模型通道暂不可用，请稍后重试或在后台切换模型"
        }
      ])
    );
    expect(events).toContainEqual({
      type: "tool-result",
      id: "tool-1",
      toolName: "generate_image",
      outputPreview: "failed image"
    });
    expect(events).not.toContainEqual({ type: "stop", reason: "done" });
  });
});

function createRuntimeSecrets(
  data: {
    model?: RuntimeModelConfig;
    search?: RuntimeSearchConfig;
    image?: RuntimeImageConfig;
  } = {}
) {
  return {
    getModelConfig: jest.fn(() =>
      Promise.resolve(
        data.model ?? {
          baseURL: "",
          apiKey: "",
          modelName: ""
        }
      )
    ),
    getSearchConfig: jest.fn(() =>
      Promise.resolve(data.search ?? { tavilyApiKey: "" })
    ),
    getImageConfig: jest.fn(() =>
      Promise.resolve(
        data.image ?? {
          provider: "disabled",
          openaiApiKey: "",
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
          defaultQuality: "auto"
        }
      )
    )
  };
}
