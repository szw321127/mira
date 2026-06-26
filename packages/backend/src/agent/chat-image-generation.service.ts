import {
  Inject,
  Injectable,
  Optional,
  ServiceUnavailableException
} from "@nestjs/common";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText, type LanguageModel } from "ai";
import {
  RuntimeSecretsService,
  type RuntimeImageConfig
} from "../admin/runtime-secrets.service.js";
import type { AgentStreamEvent } from "./agent.types.js";

type StreamText = typeof streamText;

export type ChatImageGenerationInput = {
  prompt: string;
  config: RuntimeImageConfig;
};

export type ChatImageGenerationDependencies = {
  streamText?: StreamText;
  createModel?: (config: RuntimeImageConfig) => LanguageModel;
};

export const CHAT_IMAGE_GENERATION_DEPS = Symbol("CHAT_IMAGE_GENERATION_DEPS");

const IMAGE_INTENT_PATTERN =
  /(生成|画|绘制|做|出|设计|create|generate|draw|make).{0,12}(图片|图像|插画|海报|封面|头像|logo|image|picture|poster|illustration)/i;

@Injectable()
export class ChatImageGenerationService {
  private readonly streamTextFn: StreamText;
  private readonly createModel: (config: RuntimeImageConfig) => LanguageModel;

  constructor(
    private readonly runtimeSecrets: RuntimeSecretsService,
    @Optional()
    @Inject(CHAT_IMAGE_GENERATION_DEPS)
    dependencies: ChatImageGenerationDependencies = {}
  ) {
    this.streamTextFn = dependencies.streamText ?? streamText;
    this.createModel =
      dependencies.createModel ??
      ((config) => {
        const openai = createOpenAI({
          apiKey: config.openaiApiKey,
          ...(config.openaiBaseURL.trim()
            ? { baseURL: config.openaiBaseURL.trim() }
            : {})
        });
        return openai.responses(resolveResponsesModel(config));
      });
  }

  shouldHandle(prompt: string) {
    return IMAGE_INTENT_PATTERN.test(prompt);
  }

  async *streamFromPrompt(prompt: string): AsyncGenerator<AgentStreamEvent> {
    const config = await this.requireImageConfig();
    yield* this.streamWithConfig({ prompt, config });
  }

  async *streamWithConfig({
    prompt,
    config
  }: ChatImageGenerationInput): AsyncGenerator<AgentStreamEvent> {
    const model = this.createModel(config);
    const openai = createOpenAI({
      apiKey: config.openaiApiKey,
      ...(config.openaiBaseURL.trim()
        ? { baseURL: config.openaiBaseURL.trim() }
        : {})
    });
    const imageModel = config.openaiModel.trim() || "gpt-image-1";
    const result = this.streamTextFn({
      model,
      prompt,
      tools: {
        image_generation: openai.tools.imageGeneration({
          model: imageModel,
          partialImages: 3,
          outputFormat: "png",
          quality: normalizeImageQuality(config.defaultQuality)
        })
      },
      toolChoice: {
        type: "tool",
        toolName: "image_generation"
      },
      maxRetries: 0
    });

    let activeId = "";
    let partialIndex = 0;

    for await (const part of result.fullStream) {
      if (part.type === "tool-call" && part.toolName === "image_generation") {
        activeId = part.toolCallId;
        yield {
          type: "image-generation-start",
          id: part.toolCallId,
          prompt
        };
      }

      if (part.type === "tool-result" && part.toolName === "image_generation") {
        const imageBase64 = readImageGenerationResult(part.output);
        if (!imageBase64) continue;

        if (part.preliminary) {
          partialIndex += 1;
          yield {
            type: "image-generation-partial",
            id: part.toolCallId || activeId,
            imageBase64,
            mimeType: "image/png",
            index: partialIndex
          };
        } else {
          yield {
            type: "image-generation-complete",
            id: part.toolCallId || activeId,
            imageBase64,
            mimeType: "image/png"
          };
        }
      }
    }
  }

  private async requireImageConfig() {
    const config = await this.runtimeSecrets.getImageConfig();
    if (
      config.provider.trim().toLowerCase() === "disabled" ||
      !config.openaiApiKey.trim()
    ) {
      throw new ServiceUnavailableException("图像生成服务未配置，请联系管理员");
    }
    return config;
  }
}

function readImageGenerationResult(output: unknown) {
  if (!output || typeof output !== "object") return null;
  const direct = (output as { result?: unknown }).result;
  const nested =
    direct && typeof direct === "object"
      ? (direct as { result?: unknown }).result
      : undefined;
  const result = typeof direct === "string" ? direct : nested;
  return typeof result === "string" && result.trim() ? result : null;
}

function resolveResponsesModel(config: RuntimeImageConfig) {
  const configured = config.openaiModel.trim();
  return configured.startsWith("gpt-5") ? configured : "gpt-5-mini";
}

function normalizeImageQuality(value: string) {
  if (
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "auto"
  ) {
    return value;
  }
  return "auto";
}
