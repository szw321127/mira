import {
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException
} from "@nestjs/common";
import {
  createOpenAI,
  type OpenAIImageModelEditOptions,
  type OpenAIImageModelGenerationOptions
} from "@ai-sdk/openai";
import { generateImage, type GenerateImageResult } from "ai";
import {
  RuntimeSecretsService,
  type RuntimeImageConfig
} from "../admin/runtime-secrets.service.js";
import {
  assertImageProviderResult,
  imageGenerateSizeForAspectRatio,
  type ImageAspectRatio,
  type ImageEditInput,
  type ImageEditSource,
  type ImageGenerateInput,
  type ImageGenerateSize,
  type ImageProviderAdapter,
  type ImageProviderResult
} from "./image-provider.types.js";
import {
  IMAGE_STORAGE,
  type ImageStorageService
} from "./image-storage.types.js";

type OpenAIImageFetch = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

type OpenAIImageResponseBody = {
  background?: unknown;
  created?: unknown;
  data?: unknown;
  output_format?: unknown;
  quality?: unknown;
  size?: unknown;
  usage?: unknown;
};

type ImageTokenUsage = {
  imageInputTokens: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  textInputTokens: number | null;
  totalTokens: number | null;
};

export type OpenAIImageProviderOptions = {
  fetch?: OpenAIImageFetch;
};

const IMAGE_GENERATION_FAILED_MESSAGE = "图像生成失败，请稍后再试";
const IMAGE_PROVIDER_UNAVAILABLE_MESSAGE =
  "图像模型通道暂不可用，请稍后重试或在后台切换模型";
const IMAGE_PROMPT_REJECTED_MESSAGE = "提示词可能包含平台限制内容，请调整后再试";

@Injectable()
export class OpenAIImageProviderService implements ImageProviderAdapter {
  private readonly fetcher: OpenAIImageFetch;
  private readonly logger = new Logger(OpenAIImageProviderService.name);

  constructor(
    private readonly runtimeSecrets: RuntimeSecretsService,
    @Inject(IMAGE_STORAGE)
    private readonly imageStorage: ImageStorageService,
    options: OpenAIImageProviderOptions = {}
  ) {
    this.fetcher =
      options.fetch ??
      (async (url, init) => {
        return fetch(url, init);
      });
  }

  async generate(input: ImageGenerateInput): Promise<ImageProviderResult> {
    const config = await this.requireOpenAIConfig();
    const size = input.aspectRatio
      ? imageGenerateSizeForAspectRatio(input.aspectRatio)
      : input.size;
    const result = await this.callImageSdk({
      config,
      prompt: promptWithAspectRatioInstruction(input.prompt, input.aspectRatio),
      size,
      providerOptions: {
        openai: {
          outputFormat: "png",
          ...(input.quality === "auto" ? {} : { quality: input.quality }),
          ...(input.background === "auto"
            ? {}
            : { background: input.background })
        } satisfies OpenAIImageModelGenerationOptions
      }
    });

    return this.toProviderResult(result, {
      aspectRatio: input.aspectRatio ?? null,
      background: input.background,
      model: config.openaiModel,
      quality: input.quality,
      size
    });
  }

  async edit(input: ImageEditInput): Promise<ImageProviderResult> {
    const config = await this.requireOpenAIConfig();
    const imageBytes = await this.resolveEditSourceBytes(input.image);
    const maskBytes = input.mask
      ? await this.resolveEditSourceBytes(input.mask)
      : undefined;
    const result = await this.callImageSdk({
      config,
      prompt: {
        text: input.prompt,
        images: [imageBytes],
        ...(maskBytes ? { mask: maskBytes } : {})
      },
      size: input.size,
      providerOptions: {
        openai: {
          outputFormat: "png"
        } satisfies OpenAIImageModelEditOptions
      }
    });

    return this.toProviderResult(result, {
      aspectRatio: null,
      model: config.openaiModel,
      quality: null,
      size: input.size
    });
  }

  private async resolveEditSourceBytes(source: ImageEditSource): Promise<Buffer> {
    return source.bytes ?? this.imageStorage.getImage(source);
  }

  private async requireOpenAIConfig(): Promise<RuntimeImageConfig> {
    const config = await this.runtimeSecrets.getImageConfig();
    if (config.provider.trim().toLowerCase() === "disabled" || !config.openaiApiKey.trim()) {
      throw new ServiceUnavailableException("图像生成服务未配置，请联系管理员");
    }
    return {
      ...config,
      openaiModel: config.openaiModel.trim() || "gpt-image-1"
    };
  }

  private async callImageSdk(args: {
    config: RuntimeImageConfig;
    prompt: Parameters<typeof generateImage>[0]["prompt"];
    providerOptions: Parameters<typeof generateImage>[0]["providerOptions"];
    size: ImageGenerateSize;
  }): Promise<GenerateImageResult> {
    try {
      const openai = createOpenAI({
        apiKey: args.config.openaiApiKey,
        ...(args.config.openaiBaseURL.trim()
          ? { baseURL: args.config.openaiBaseURL.trim() }
          : {}),
        fetch: this.createCompatibleImageFetch()
      });
      return await generateImage({
        model: openai.image(args.config.openaiModel),
        prompt: args.prompt,
        n: 1,
        providerOptions: args.providerOptions,
        ...(args.size === "auto" ? {} : { size: args.size })
      });
    } catch (error) {
      const summary = summarizeImageProviderError(error);
      this.logger.warn("OpenAI image request failed", JSON.stringify(summary));
      throw new ServiceUnavailableException(
        imageProviderFailureMessage(summary)
      );
    }
  }

  private createCompatibleImageFetch(): OpenAIImageFetch {
    return async (input, init) => {
      const response = await this.fetcher(input, init);
      return normalizeImageResponse(input, response, this.fetcher);
    };
  }

  private toProviderResult(
    value: GenerateImageResult,
    request: {
      aspectRatio: ImageAspectRatio | null;
      background?: ImageGenerateInput["background"];
      model: string;
      quality: ImageGenerateInput["quality"] | null;
      size: ImageGenerateSize;
    }
  ): ImageProviderResult {
    const image = value.image;
    const [width, height] = dimensionsForSize(request.size);
    return assertImageProviderResult({
      bytes: Buffer.from(image.uint8Array),
      mimeType: image.mediaType,
      width,
      height,
      provider: "openai",
      providerJob: firstResponseRequestId(value),
      metadata: {
        model: request.model,
        ...(request.aspectRatio ? { aspectRatio: request.aspectRatio } : {}),
        size: request.size,
        quality: request.quality,
        ...(request.background ? { background: request.background } : {}),
        estimatedCostUsd: estimateOpenAIImageCostUsd(
          request.model,
          request.size,
          request.quality,
          value
        ),
        ...readImageTokenUsage(value),
        revisedPrompt: firstOpenAIRevisedPrompt(value) ?? null
      }
    });
  }
}

function imageProviderFailureMessage(summary: {
  providerUnavailable: boolean;
  safetyRejected: boolean;
}): string {
  if (summary.safetyRejected) return IMAGE_PROMPT_REJECTED_MESSAGE;
  if (summary.providerUnavailable) return IMAGE_PROVIDER_UNAVAILABLE_MESSAGE;
  return IMAGE_GENERATION_FAILED_MESSAGE;
}

function promptWithAspectRatioInstruction(
  prompt: string,
  aspectRatio: ImageAspectRatio | undefined
): string {
  if (!aspectRatio) return prompt;
  return `画幅比例：${aspectRatio}。请严格按该比例进行构图。\n${prompt}`;
}

function dimensionsForSize(size: ImageGenerateSize): [number, number] {
  if (size === "1024x1536") return [1024, 1536];
  if (size === "1536x1024") return [1536, 1024];
  return [1024, 1024];
}

function estimateOpenAIImageCostUsd(
  model: string,
  size: ImageGenerateSize,
  quality: ImageGenerateInput["quality"] | null,
  result: GenerateImageResult
): number | null {
  const usageCost = estimateOpenAIImageUsageCostUsd(model, result);
  if (usageCost !== null) return usageCost;
  if (!quality) return null;
  const normalizedQuality = quality === "auto" ? "medium" : quality;
  const normalizedSize =
    size === "1024x1536" || size === "1536x1024" ? "large" : "square";
  const prices = OPENAI_IMAGE_COST_BY_MODEL[model.trim().toLowerCase()];
  return prices?.[normalizedSize][normalizedQuality] ?? null;
}

function estimateOpenAIImageUsageCostUsd(
  model: string,
  result: GenerateImageResult
): number | null {
  const prices = OPENAI_IMAGE_TOKEN_PRICES_BY_MODEL[model.trim().toLowerCase()];
  if (!prices) return null;

  const usage = readImageTokenUsage(result);
  const outputTokens = usage.outputTokens ?? 0;
  const textInputTokens = usage.textInputTokens ?? 0;
  const imageInputTokens = usage.imageInputTokens ?? 0;
  const hasUsage =
    outputTokens > 0 ||
    textInputTokens > 0 ||
    imageInputTokens > 0 ||
    (usage.inputTokens ?? 0) > 0;
  if (!hasUsage) return null;

  const unknownInputTokens = Math.max(
    0,
    (usage.inputTokens ?? 0) - textInputTokens - imageInputTokens
  );
  const cost =
    (textInputTokens + unknownInputTokens) * prices.textInputTokenUsd +
    imageInputTokens * prices.imageInputTokenUsd +
    outputTokens * prices.imageOutputTokenUsd;
  return roundUsd(cost);
}

function readImageTokenUsage(result: GenerateImageResult): ImageTokenUsage {
  const usage = result.usage;
  const tokenDetails = firstOpenAIImageTokenDetails(result);
  return {
    inputTokens: readFiniteNumber(usage.inputTokens),
    outputTokens: readFiniteNumber(usage.outputTokens),
    totalTokens: readFiniteNumber(usage.totalTokens),
    textInputTokens: readFiniteNumber(tokenDetails?.textTokens),
    imageInputTokens: readFiniteNumber(tokenDetails?.imageTokens)
  };
}

function firstOpenAIImageTokenDetails(
  value: GenerateImageResult
): { imageTokens?: unknown; textTokens?: unknown } | null {
  const openaiMetadata = value.providerMetadata.openai;
  if (!isRecord(openaiMetadata) || !Array.isArray(openaiMetadata.images)) {
    return null;
  }
  const first = openaiMetadata.images[0];
  if (!isRecord(first)) return null;
  return first;
}

const OPENAI_IMAGE_COST_BY_MODEL: Record<
  string,
  Record<"square" | "large", Record<"low" | "medium" | "high", number>>
> = {
  "gpt-image-1": {
    square: { low: 0.011, medium: 0.042, high: 0.167 },
    large: { low: 0.016, medium: 0.063, high: 0.25 }
  },
  "gpt-image-1.5": {
    square: { low: 0.006, medium: 0.017, high: 0.067 },
    large: { low: 0.008, medium: 0.025, high: 0.1 }
  },
  "gpt-image-1-mini": {
    square: { low: 0.005, medium: 0.011, high: 0.016 },
    large: { low: 0.007, medium: 0.016, high: 0.024 }
  }
};

const OPENAI_IMAGE_TOKEN_PRICES_BY_MODEL: Record<
  string,
  {
    imageInputTokenUsd: number;
    imageOutputTokenUsd: number;
    textInputTokenUsd: number;
  }
> = {
  "gpt-image-2": {
    textInputTokenUsd: 5 / 1_000_000,
    imageInputTokenUsd: 8 / 1_000_000,
    imageOutputTokenUsd: 30 / 1_000_000
  }
};

function firstOpenAIRevisedPrompt(value: GenerateImageResult): string | undefined {
  const openaiMetadata = value.providerMetadata.openai;
  if (!isRecord(openaiMetadata) || !Array.isArray(openaiMetadata.images)) {
    return undefined;
  }
  const first = openaiMetadata.images[0];
  if (!isRecord(first) || typeof first.revisedPrompt !== "string") {
    return undefined;
  }
  return first.revisedPrompt;
}

function firstResponseRequestId(value: GenerateImageResult): string | null {
  for (const response of value.responses) {
    const requestId = response.headers?.["x-request-id"];
    if (typeof requestId === "string" && requestId.trim()) {
      return requestId.trim();
    }
  }
  return null;
}

async function normalizeImageResponse(
  input: string | URL | Request,
  response: Response,
  fetcher: OpenAIImageFetch
): Promise<Response> {
  if (!response.ok || !isImageEndpoint(input)) return response;

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.toLowerCase().startsWith("image/")) {
    return imageBytesToOpenAIResponse(response, await response.arrayBuffer(), contentType);
  }

  const text = await response.text();
  const body = parseJsonObject(text);
  if (!body) return cloneTextResponse(response, text);

  const normalized = await normalizeImageResponseBody(body, fetcher);
  if (!normalized) return cloneTextResponse(response, text);

  return jsonResponse(response, normalized);
}

async function normalizeImageResponseBody(
  body: Record<string, unknown>,
  fetcher: OpenAIImageFetch
): Promise<OpenAIImageResponseBody | null> {
  if (!Array.isArray(body.data)) return null;

  const data = await Promise.all(
    body.data.map(async (item) => {
      if (!isRecord(item)) return item;
      if (typeof item.b64_json === "string" && item.b64_json.trim()) {
        return item;
      }
      if (typeof item.url !== "string" || !item.url.trim()) return item;

      const downloaded = await fetcher(item.url);
      if (!downloaded.ok) return item;
      const mimeType = downloaded.headers.get("content-type") ?? "image/png";
      const bytes = Buffer.from(await downloaded.arrayBuffer());
      return {
        ...item,
        b64_json: bytes.toString("base64"),
        mime_type: mimeType
      };
    })
  );

  return {
    ...body,
    data
  };
}

function imageBytesToOpenAIResponse(
  response: Response,
  bytes: ArrayBuffer,
  contentType: string
): Response {
  return jsonResponse(response, {
    data: [
      {
        b64_json: Buffer.from(bytes).toString("base64"),
        mime_type: contentType
      }
    ]
  });
}

function jsonResponse(response: Response, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: response.status,
    statusText: response.statusText,
    headers: normalizeResponseHeaders(response.headers, "application/json")
  });
}

function cloneTextResponse(response: Response, text: string): Response {
  return new Response(text, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

function normalizeResponseHeaders(headers: Headers, contentType: string): Headers {
  const nextHeaders = new Headers(headers);
  nextHeaders.set("content-type", contentType);
  return nextHeaders;
}

function isImageEndpoint(input: string | URL | Request): boolean {
  const url = input instanceof Request ? input.url : String(input);
  return url.includes("/images/generations") || url.includes("/images/edits");
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function summarizeImageProviderError(error: unknown): {
  code: string | null;
  message: string;
  name: string;
  providerUnavailable: boolean;
  safetyRejected: boolean;
  statusCode: number | null;
  type: string | null;
} {
  const name = error instanceof Error ? error.name : typeof error;
  const message = sanitizeProviderErrorMessage(readErrorMessage(error));
  const lowerMessage = message.toLowerCase();
  return {
    code: readStringField(error, "code"),
    message,
    name,
    providerUnavailable:
      lowerMessage.includes("无可用渠道") ||
      lowerMessage.includes("distributor") ||
      lowerMessage.includes("no available channel"),
    safetyRejected:
      lowerMessage.includes("safety") ||
      lowerMessage.includes("safety_violations") ||
      lowerMessage.includes("rejected by the safety system"),
    statusCode: readNumberField(error, "statusCode") ?? readNumberField(error, "status"),
    type: readStringField(error, "type")
  };
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown image provider error";
}

function readStringField(error: unknown, key: string): string | null {
  if (!isRecord(error)) return null;
  const value = error[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNumberField(error: unknown, key: string): number | null {
  if (!isRecord(error)) return null;
  const value = error[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizeProviderErrorMessage(message: string): string {
  return message
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .slice(0, 500);
}
