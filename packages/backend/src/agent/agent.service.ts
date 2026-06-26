import { Inject, Injectable, Optional } from "@nestjs/common";
import type { LanguageModel, ModelMessage, UserContent } from "ai";
import type { ToolDefinition, ToolRegistry } from "@rednote/agent";
import {
  RuntimeSecretsService,
  type RuntimeImageConfig,
  type RuntimeModelConfig,
  type RuntimeSearchConfig
} from "../admin/runtime-secrets.service.js";
import { ChatImageGenerationService } from "./chat-image-generation.service.js";
import type {
  AgentChatImageAttachment,
  AgentChatMessage,
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

type AsyncEventQueue<T> = AsyncIterable<T> & {
  push(value: T): void;
  shift(): T | undefined;
  close(): void;
  fail(error: unknown): void;
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

    const [modelConfig, searchConfig] = await Promise.all([
      this.getModelConfig(),
      this.getSearchConfig()
    ]);
    const model = this.createModel(modelConfig);
    const registry = this.createRegistry(searchConfig);
    const imageEvents = createAsyncEventQueue<AgentStreamEvent>();
    this.registerImageGenerationTool(registry, imageEvents);
    const harness = this.createHarness({
      model,
      registry,
      messages: this.getHistoryBeforeMessage(request.messages, lastUserMessage),
      sessionId: request.conversationId,
      maxSteps: Number(process.env.AGENT_MAX_STEPS ?? 30)
    });

    yield* mergeAgentAndImageEvents(
      harness.runEvents(this.toUserContent(lastUserMessage)),
      imageEvents
    );
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
        content: this.toAssistantContent(message)
      };
    });
  }

  private toUserContent(
    message: AgentChatMessage
  ): UserContent {
    const attachments = message.attachments ?? [];
    if (attachments.length === 0) return message.content;

    return [
      { type: "text", text: message.content },
      ...attachments.map((attachment) => this.toImagePart(attachment))
    ];
  }

  private toAssistantContent(message: AgentChatMessage) {
    const imageSummaries = summarizeGeneratedImages(message);
    if (!imageSummaries) return message.content;
    return [message.content.trim(), imageSummaries].filter(Boolean).join("\n\n");
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

  private registerImageGenerationTool(
    registry: ToolRegistry,
    imageEvents: AsyncEventQueue<AgentStreamEvent>
  ) {
    registry.register(this.createImageGenerationTool(imageEvents));
  }

  private createImageGenerationTool(
    imageEvents: AsyncEventQueue<AgentStreamEvent>
  ): ToolDefinition {
    return {
      name: "generate_image",
      description:
        "Generate an image for the user. Use this for new image requests and follow-up edits to previously generated images; rewrite the full prompt using conversation context before calling.",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description:
              "Complete image prompt to generate, including context from the conversation and requested changes."
          }
        },
        required: ["prompt"],
        additionalProperties: false
      },
      maxResultChars: 800,
      execute: async (input: { prompt?: unknown }) => {
        const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
        if (!prompt) {
          throw new Error("Image prompt is required.");
        }
        const imageConfig = await this.getImageConfig();
        const imageStream =
          this.createImageStream?.({ prompt, config: imageConfig }) ??
          this.chatImageGeneration?.streamWithConfig({
            prompt,
            config: imageConfig
          });

        if (!imageStream) {
          throw new Error("Image generation is not available.");
        }

        let completed = false;
        let failedMessage = "";
        for await (const event of imageStream) {
          if (event.type === "image-generation-complete") completed = true;
          if (event.type === "error") failedMessage = event.message;
          imageEvents.push(event);
        }

        if (failedMessage) {
          return `Image generation failed: ${failedMessage}`;
        }
        return completed
          ? `Image generated successfully for prompt: ${prompt}`
          : `Image generation finished without an image for prompt: ${prompt}`;
      }
    };
  }
}

function readBase64DataUrlPayload(dataUrl: string) {
  const commaIndex = dataUrl.indexOf(",");
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}

function summarizeGeneratedImages(message: AgentChatMessage) {
  const completedImages = (message.generatedImages ?? []).filter((image) => {
    return image.status === "complete" && image.prompt.trim();
  });
  if (completedImages.length === 0) return "";

  const lines = completedImages.map((image) => {
    return `- ${image.id}: ${image.prompt.trim()}`;
  });
  return `[已生成图片]\n${lines.join("\n")}`;
}

function createAsyncEventQueue<T>(): AsyncEventQueue<T> {
  const values: T[] = [];
  const waiters: Array<{
    resolve(value: IteratorResult<T>): void;
    reject(error: unknown): void;
  }> = [];
  let closed = false;
  let failure: unknown = null;

  return {
    push(value: T) {
      if (closed) return;
      const waiter = waiters.shift();
      if (waiter) {
        waiter.resolve({ value, done: false });
        return;
      }
      values.push(value);
    },
    shift() {
      return values.shift();
    },
    close() {
      closed = true;
      for (const waiter of waiters.splice(0)) {
        waiter.resolve({ value: undefined, done: true });
      }
    },
    fail(error: unknown) {
      closed = true;
      failure = error;
      for (const waiter of waiters.splice(0)) {
        waiter.reject(error);
      }
    },
    [Symbol.asyncIterator]() {
      return {
        next(): Promise<IteratorResult<T>> {
          if (values.length > 0) {
            return Promise.resolve({ value: values.shift() as T, done: false });
          }
          if (failure) {
            return Promise.reject(failure);
          }
          if (closed) {
            return Promise.resolve({ value: undefined, done: true });
          }
          return new Promise((resolve, reject) => {
            waiters.push({ resolve, reject });
          });
        }
      };
    }
  };
}

async function* mergeAgentAndImageEvents(
  agentEvents: AsyncIterable<Parameters<typeof normalizeAgentEvent>[0]>,
  imageEvents: AsyncEventQueue<AgentStreamEvent>
): AsyncGenerator<AgentStreamEvent, void, void> {
  let eventIndex = 0;
  let agentDone = false;
  const agentIterator = agentEvents[Symbol.asyncIterator]();
  const imageIterator = imageEvents[Symbol.asyncIterator]();
  let nextAgent = agentIterator.next();
  let nextImage = imageIterator.next();

  try {
    while (!agentDone) {
      const result = await Promise.race([
        nextImage.then((result) => ({ source: "image" as const, result })),
        nextAgent.then((result) => ({ source: "agent" as const, result }))
      ]);

      if (result.source === "image") {
        if (!result.result.done) {
          nextImage = imageIterator.next();
          yield result.result.value;
        } else {
          nextImage = new Promise<IteratorResult<AgentStreamEvent>>(() => {});
        }
        continue;
      }

      if (result.result.done) {
        agentDone = true;
        imageEvents.close();
        continue;
      }

      let queuedImageEvent: AgentStreamEvent | undefined;
      while ((queuedImageEvent = imageEvents.shift())) {
        yield queuedImageEvent;
      }

      const normalized = normalizeAgentEvent(result.result.value, eventIndex);
      eventIndex += 1;
      if (!(normalized.type === "stop" && normalized.reason === "done")) {
        yield normalized;
      }
      nextAgent = agentIterator.next();
    }

    let queuedImageEvent: AgentStreamEvent | undefined;
    while ((queuedImageEvent = imageEvents.shift())) {
      yield queuedImageEvent;
    }
  } catch (error) {
    imageEvents.fail(error);
    throw error;
  } finally {
    imageEvents.close();
  }
}
