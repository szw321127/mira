import { jest } from "@jest/globals";
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
    const createRegistry = jest.fn(() => "registry");
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
      registry: "registry",
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
        createRegistry: jest.fn(() => "registry"),
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
      const createRegistry = jest.fn(() => "registry");
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

  it("streams progressive chat image generation events when the user asks for an image", async () => {
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
    const service = new AgentService(
      {
        createModel: jest.fn(() => "model"),
        createRegistry: jest.fn(() => "registry"),
        createHarness: jest.fn(),
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
      prompt: "生成一张橙色猫写文案的图片",
      config: expect.objectContaining({
        openaiApiKey: "image-secret",
        openaiModel: "gpt-image-1"
      })
    });
    expect(events).toEqual([
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
      },
      { type: "stop", reason: "done" }
    ]);
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
