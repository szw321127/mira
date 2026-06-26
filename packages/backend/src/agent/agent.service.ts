import { Inject, Injectable, Optional } from "@nestjs/common";
import type { LanguageModel, ModelMessage, UserContent } from "ai";
import type { ToolRegistry } from "@rednote/agent";
import {
  RuntimeSecretsService,
  type RuntimeImageConfig,
  type RuntimeModelConfig,
  type RuntimeSearchConfig
} from "../admin/runtime-secrets.service.js";
import { ChatImageGenerationService } from "./chat-image-generation.service.js";
import type {
  AgentChatImageAttachment,
  AgentChatRequest,
  AgentStreamEvent
} from "./agent.types.js";
import { normalizeAgentEvent } from "./agent-event-normalizer.js";
import { createAgentModel } from "./model-factory.js";
import {
  createAgentRegistry,
  createGPTAgentHarness,
  type AgentHarnessFactory
} from "./agent-runtime.js";

type ModelFactory = (config: RuntimeModelConfig) => LanguageModel;
type RegistryFactory = (config: RuntimeSearchConfig) => ToolRegistry;

type AgentServiceDependencies = {
  createModel?: ModelFactory;
  createRegistry?: RegistryFactory;
  createHarness?: AgentHarnessFactory;
  createImageStream?: (
    input: { prompt: string; config: RuntimeImageConfig }
  ) => AsyncGenerator<AgentStreamEvent, void, void>;
};

type RuntimeSecretsReader = {
  getModelConfig(): Promise<RuntimeModelConfig>;
  getSearchConfig(): Promise<RuntimeSearchConfig>;
  getImageConfig(): Promise<RuntimeImageConfig>;
};

export const AGENT_SERVICE_DEPS = Symbol("AGENT_SERVICE_DEPS");

@Injectable()
export class AgentService {
  private readonly createModel: ModelFactory;
  private readonly createRegistry: RegistryFactory;
  private readonly createHarness: AgentHarnessFactory;
  private readonly createImageStream?: AgentServiceDependencies["createImageStream"];

  constructor(
    @Optional()
    @Inject(AGENT_SERVICE_DEPS)
    dependencies: AgentServiceDependencies = {},
    @Optional()
    @Inject(RuntimeSecretsService)
    private readonly runtimeSecrets?: RuntimeSecretsReader,
    @Optional()
    private readonly chatImageGeneration?: ChatImageGenerationService
  ) {
    this.createModel = dependencies.createModel ?? createAgentModel;
    this.createRegistry = dependencies.createRegistry ?? createAgentRegistry;
    this.createHarness = dependencies.createHarness ?? createGPTAgentHarness;
    this.createImageStream = dependencies.createImageStream;
  }

  async *streamChat(
    request: AgentChatRequest
  ): AsyncGenerator<AgentStreamEvent, void, void> {
    const lastUserMessage = [...request.messages].reverse().find((message) => {
      return (
        message.role === "user" &&
        (message.content.trim() || (message.attachments?.length ?? 0) > 0)
      );
    });

    if (!lastUserMessage) {
      throw new Error("Message is required.");
    }

    const imagePrompt = readTextPrompt(lastUserMessage);
    if (imagePrompt && this.shouldGenerateImage(imagePrompt)) {
      const imageConfig = await this.getImageConfig();
      const imageStream =
        this.createImageStream?.({ prompt: imagePrompt, config: imageConfig }) ??
        this.chatImageGeneration?.streamWithConfig({
          prompt: imagePrompt,
          config: imageConfig
        });

      if (!imageStream) {
        throw new Error("Image generation is not available.");
      }

      let failed = false;
      for await (const event of imageStream) {
        if (event.type === "error") failed = true;
        yield event;
      }
      if (!failed) {
        yield { type: "stop", reason: "done" };
      }
      return;
    }

    const [modelConfig, searchConfig] = await Promise.all([
      this.getModelConfig(),
      this.getSearchConfig()
    ]);
    const model = this.createModel(modelConfig);
    const registry = this.createRegistry(searchConfig);
    const harness = this.createHarness({
      model,
      registry,
      messages: this.getHistoryBeforeMessage(request.messages, lastUserMessage),
      sessionId: request.conversationId,
      maxSteps: Number(process.env.AGENT_MAX_STEPS ?? 30)
    });

    let eventIndex = 0;

    for await (const event of harness.runEvents(
      this.toUserContent(lastUserMessage)
    )) {
      const normalized = normalizeAgentEvent(event, eventIndex);
      eventIndex += 1;
      yield normalized;
    }
  }

  private getHistoryBeforeMessage(
    messages: AgentChatRequest["messages"],
    target: AgentChatRequest["messages"][number]
  ): ModelMessage[] {
    const index = messages.lastIndexOf(target);
    return messages.slice(0, index).map((message) => {
      if (message.role === "user") {
        return {
          role: message.role,
          content: this.toUserContent(message)
        };
      }

      return {
        role: message.role,
        content: message.content
      };
    });
  }

  private toUserContent(
    message: AgentChatRequest["messages"][number]
  ): UserContent {
    const attachments = message.attachments ?? [];
    if (attachments.length === 0) return message.content;

    return [
      { type: "text", text: message.content },
      ...attachments.map((attachment) => this.toImagePart(attachment))
    ];
  }

  private toImagePart(attachment: AgentChatImageAttachment) {
    return {
      type: "image" as const,
      image: readBase64DataUrlPayload(attachment.dataUrl),
      mediaType: attachment.mimeType
    };
  }

  private async getModelConfig(): Promise<RuntimeModelConfig> {
    return this.runtimeSecrets?.getModelConfig() ?? {
      baseURL: "",
      apiKey: "",
      modelName: ""
    };
  }

  private async getSearchConfig(): Promise<RuntimeSearchConfig> {
    return this.runtimeSecrets?.getSearchConfig() ?? {
      tavilyApiKey: ""
    };
  }

  private async getImageConfig(): Promise<RuntimeImageConfig> {
    return this.runtimeSecrets?.getImageConfig() ?? {
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
    };
  }

  private shouldGenerateImage(prompt: string) {
    if (this.createImageStream) return isImageGenerationPrompt(prompt);
    return this.chatImageGeneration?.shouldHandle(prompt) ?? false;
  }
}

function readBase64DataUrlPayload(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(",");
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}

function readTextPrompt(message: AgentChatRequest["messages"][number]) {
  if ((message.attachments?.length ?? 0) > 0) return "";
  return message.content.trim();
}

function isImageGenerationPrompt(prompt: string) {
  return /(生成|画|绘制|做|出|设计|create|generate|draw|make).{0,12}(图片|图像|插画|海报|封面|头像|logo|image|picture|poster|illustration)/i.test(
    prompt
  );
}
