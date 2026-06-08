import { BadRequestException, Injectable } from '@nestjs/common';
import { AdminModelConfigsService } from '../admin-model-configs/admin-model-configs.service';
import {
  createProviderEndpoint,
  isRecord,
  postProviderJson,
} from '../model-provider/openai-compatible';
import type {
  ImageGenerationInput,
  ImageGenerationResult,
} from './image-generation.types';

@Injectable()
export class ImageGenerationService {
  constructor(private readonly modelConfigs: AdminModelConfigsService) {}

  async generateCover(
    input: ImageGenerationInput,
  ): Promise<ImageGenerationResult> {
    const config = await this.modelConfigs.getRuntimeConfig('image');
    const payload = await postProviderJson(
      createProviderEndpoint(config.baseUrl, 'images/generations'),
      config.apiKey,
      {
        model: config.modelName,
        prompt: this.createPrompt(input),
        response_format: 'b64_json',
        size: '1024x1536',
      },
    );

    return {
      generatedAt: new Date(),
      imageUrl: this.extractImageUrl(payload),
      provider: config.modelName,
    };
  }

  private createPrompt(input: ImageGenerationInput): string {
    return [
      input.imagePrompt,
      `主题：${input.topic}`,
      `封面标题：${input.coverLine}`,
      `正文标题：${input.title}`,
      `标签：${input.tags.join('、')}`,
      '画幅：竖版 3:4，小红书图文封面，可直接发布，标题区域留白清楚。',
    ].join('\n');
  }

  private extractImageUrl(payload: unknown): string {
    if (!isRecord(payload) || !Array.isArray(payload.data)) {
      throw new BadRequestException('图片模型响应格式无效。');
    }

    const firstImage = payload.data[0];

    if (!isRecord(firstImage)) {
      throw new BadRequestException('图片模型响应格式无效。');
    }

    if (typeof firstImage.b64_json === 'string' && firstImage.b64_json.trim()) {
      return `data:image/png;base64,${firstImage.b64_json.trim()}`;
    }

    if (typeof firstImage.url === 'string' && firstImage.url.trim()) {
      return firstImage.url.trim();
    }

    throw new BadRequestException('图片模型响应格式无效。');
  }
}
