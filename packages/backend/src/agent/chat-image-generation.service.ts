import {
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException
} from "@nestjs/common";
import { createOpenAI } from "@ai-sdk/openai";
import {
  generateImage,
  streamText,
  type GenerateImageResult,
  type LanguageModel
} from "ai";
import {
  RuntimeSecretsService,
  type RuntimeImageConfig
} from "../admin/runtime-secrets.service.js";
import type { AgentStreamEvent } from "./agent.types.js";

type StreamText = typeof streamText;
type GenerateImage = typeof generateImage;

export type ChatImageGenerationInput = {
  prompt: string;
  config: RuntimeImageConfig;
};

export type ChatImageGenerationDependencies = {
  generateImage?: GenerateImage;
  streamText?: StreamText;
  createModel?: (config: RuntimeImageConfig) => LanguageModel;
};

export const CHAT_IMAGE_GENERATION_DEPS = Symbol("CHAT_IMAGE_GENERATION_DEPS");

const IMAGE_INTENT_PATTERN =
  /(生成|画|绘制|做|出|设计|create|generate|draw|make).{0,12}(图片|图像|照片|相片|摄影图|写真|插画|海报|封面|头像|logo|image|picture|photo|poster|illustration)/i;

@Injectable()
export class ChatImageGenerationService {
  private readonly generateImageFn: GenerateImage;
  private readonly logger = new Logger(ChatImageGenerationService.name);
  private readonly streamTextFn: StreamText;
  private readonly createModel: (config: RuntimeImageConfig) => LanguageModel;

  constructor(
    private readonly runtimeSecrets: RuntimeSecretsService,
    @Optional()
    @Inject(CHAT_IMAGE_GENERATION_DEPS)
    dependencies: ChatImageGenerationDependencies = {}
  ) {
    this.generateImageFn = dependencies.generateImage ?? generateImage;
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
        return openai.responses(resolveResponsesModel());
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
    try {
      yield* this.streamWithResponsesTool({ prompt, config });
    } catch (error) {
      this.logger.warn(
        "Chat image generation Responses tool failed; falling back to image model",
        summarizeImageError(error)
      );
      yield* this.streamWithImageModel({ prompt, config });
    }
  }

  private async *streamWithResponsesTool({
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
    let completed = false;

    for await (const part of result.fullStream) {
      if (part.type === "error") {
        throw toError(part.error);
      }

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
          completed = true;
          yield {
            type: "image-generation-complete",
            id: part.toolCallId || activeId,
            imageBase64,
            mimeType: "image/png"
          };
        }
      }
    }

    if (!completed) {
      throw new Error("图像生成没有返回图片结果");
    }
  }

  private async *streamWithImageModel({
    prompt,
    config
  }: ChatImageGenerationInput): AsyncGenerator<AgentStreamEvent> {
    const id = `image-${Date.now().toString(36)}`;
    yield {
      type: "image-generation-start",
      id,
      prompt
    };
    yield {
      type: "image-generation-progress",
      id,
      stage: "queued",
      message: "已提交图像生成请求"
    };
    yield {
      type: "image-generation-progress",
      id,
      stage: "generating",
      message: "模型正在生成图像"
    };

    try {
      const openai = createOpenAI({
        apiKey: config.openaiApiKey,
        ...(config.openaiBaseURL.trim()
          ? { baseURL: config.openaiBaseURL.trim() }
          : {})
      });
      const result = await this.generateImageFn({
        model: openai.image(config.openaiModel.trim() || "gpt-image-1"),
        prompt,
        n: 1,
        providerOptions: {
          openai: {
            outputFormat: "png",
            quality: normalizeImageQuality(config.defaultQuality)
          }
        }
      });
      yield {
        type: "image-generation-progress",
        id,
        stage: "finalizing",
        message: "正在整理图像结果"
      };
      yield {
        type: "image-generation-complete",
        id,
        imageBase64: readGeneratedImageBase64(result),
        mimeType: normalizeMimeType(result.image.mediaType)
      };
    } catch (error) {
      yield {
        type: "error",
        message: imageProviderFailureMessage(error)
      };
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

function readGeneratedImageBase64(result: GenerateImageResult) {
  const imageBase64 = result.image.base64;
  if (!imageBase64.trim()) {
    throw new Error("图像生成没有返回图片结果");
  }
  return imageBase64;
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

function resolveResponsesModel() {
  return "gpt-5";
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

function normalizeMimeType(value: string): "image/png" | "image/jpeg" | "image/webp" {
  if (value === "image/jpeg" || value === "image/webp") return value;
  return "image/png";
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

function imageProviderFailureMessage(error: unknown) {
  const message = summarizeImageError(error);
  const lowerMessage = message.toLowerCase();
  if (
    lowerMessage.includes("无可用渠道") ||
    lowerMessage.includes("distributor") ||
    lowerMessage.includes("no available channel")
  ) {
    return "图像模型通道暂不可用，请稍后重试或在后台切换模型";
  }
  if (
    lowerMessage.includes("safety") ||
    lowerMessage.includes("safety_violations") ||
    lowerMessage.includes("rejected by the safety system")
  ) {
    return "提示词可能包含平台限制内容，请调整后再试";
  }
  return "图像生成失败，请稍后再试";
}

function summarizeImageError(error: unknown) {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Unknown image provider error";
  return raw
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .slice(0, 500);
}
