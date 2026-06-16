import { BadRequestException, Injectable } from '@nestjs/common';
import { createOpenAI } from '@ai-sdk/openai';
import {
  generateText,
  Output,
  type LanguageModel,
  type ModelMessage,
} from 'ai';
import { AdminModelConfigsService } from '../admin-model-configs/admin-model-configs.service';
import { isRecord, parseProviderJsonObject } from './openai-compatible';

export type TextJsonMessage = Extract<
  ModelMessage,
  { role: 'system' | 'user' }
>;

export type GenerateTextJsonInput = {
  maxOutputTokens?: number;
  messages: TextJsonMessage[];
  temperature?: number;
};

@Injectable()
export class AiTextModelService {
  constructor(private readonly modelConfigs: AdminModelConfigsService) {}

  async getTextModel(): Promise<LanguageModel> {
    const config = await this.modelConfigs.getRuntimeConfig('text');
    const provider = createOpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
    });

    return provider.chat(config.modelName);
  }

  async generateTextJson(
    input: GenerateTextJsonInput,
  ): Promise<Record<string, unknown>> {
    const model = await this.getTextModel();
    const result = await generateText({
      maxOutputTokens: input.maxOutputTokens,
      maxRetries: 0,
      messages: input.messages,
      model,
      output: Output.json(),
      temperature: input.temperature,
    });
    const output = result.output;

    if (isRecord(output)) {
      return output;
    }

    if (typeof result.text === 'string' && result.text.trim()) {
      return parseProviderJsonObject(result.text);
    }

    throw new BadRequestException('文本模型没有返回有效 JSON。');
  }
}
