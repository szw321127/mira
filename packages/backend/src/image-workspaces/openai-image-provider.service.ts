import { Inject, Injectable, ServiceUnavailableException } from "@nestjs/common";
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
  type ImageEditInput,
  type ImageGenerateInput,
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

export type OpenAIImageProviderOptions = {
  fetch?: OpenAIImageFetch;
};

@Injectable()
export class OpenAIImageProviderService implements ImageProviderAdapter {
  private readonly fetcher: OpenAIImageFetch;

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
    const result = await this.callImageSdk({
      config,
      prompt: input.prompt,
      size: input.size,
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
      background: input.background,
      model: config.openaiModel,
      quality: input.quality,
      size: input.size
    });
  }

  async edit(input: ImageEditInput): Promise<ImageProviderResult> {
    const config = await this.requireOpenAIConfig();
    const imageBytes = await this.imageStorage.getImage(input.image);
    const maskBytes = input.mask
      ? await this.imageStorage.getImage(input.mask)
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
      model: config.openaiModel,
      quality: null,
      size: input.size
    });
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
    size: ImageGenerateInput["size"];
  }): Promise<GenerateImageResult> {
    try {
      const openai = createOpenAI({
        apiKey: args.config.openaiApiKey,
        ...(args.config.openaiBaseURL.trim()
          ? { baseURL: args.config.openaiBaseURL.trim() }
          : {}),
        fetch: this.fetcher
      });
      return await generateImage({
        model: openai.image(args.config.openaiModel),
        prompt: args.prompt,
        n: 1,
        providerOptions: args.providerOptions,
        ...(args.size === "auto" ? {} : { size: args.size })
      });
    } catch {
      throw new ServiceUnavailableException("图像生成失败，请稍后再试");
    }
  }

  private toProviderResult(
    value: GenerateImageResult,
    request: {
      background?: ImageGenerateInput["background"];
      model: string;
      quality: ImageGenerateInput["quality"] | null;
      size: ImageGenerateInput["size"];
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
        size: request.size,
        quality: request.quality,
        ...(request.background ? { background: request.background } : {}),
        estimatedCostUsd: estimateOpenAIImageCostUsd(
          request.model,
          request.size,
          request.quality
        ),
        revisedPrompt: firstOpenAIRevisedPrompt(value) ?? null
      }
    });
  }
}

function dimensionsForSize(size: ImageGenerateInput["size"]): [number, number] {
  if (size === "1024x1536") return [1024, 1536];
  if (size === "1536x1024") return [1536, 1024];
  return [1024, 1024];
}

function estimateOpenAIImageCostUsd(
  model: string,
  size: ImageGenerateInput["size"],
  quality: ImageGenerateInput["quality"] | null
): number | null {
  if (!quality) return null;
  const normalizedQuality = quality === "auto" ? "medium" : quality;
  const normalizedSize =
    size === "1024x1536" || size === "1536x1024" ? "large" : "square";
  const prices = OPENAI_IMAGE_COST_BY_MODEL[model.trim().toLowerCase()];
  return prices?.[normalizedSize][normalizedQuality] ?? null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
