import { BadRequestException } from '@nestjs/common';
import { Output } from 'ai';
import { AiTextModelService } from './ai-text-model.service';
import type { AdminModelConfigsService } from '../admin-model-configs/admin-model-configs.service';

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: jest.fn(() => ({
    chat: jest.fn((modelName: string) => ({
      modelName,
      provider: 'mock-openai',
    })),
  })),
}));

jest.mock('ai', () => {
  const actual = jest.requireActual('ai') as typeof import('ai');

  return {
    ...actual,
    generateText: jest.fn(),
  };
});

const { createOpenAI } = jest.requireMock('@ai-sdk/openai') as {
  createOpenAI: jest.Mock;
};
const { generateText } = jest.requireMock('ai') as {
  generateText: jest.Mock;
};

describe('AiTextModelService', () => {
  const runtimeConfig = {
    apiKey: 'sk-text-runtime',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    modelName: 'qwen-plus-latest',
    type: 'text' as const,
  };

  function createService() {
    const modelConfigs = {
      getRuntimeConfig: jest.fn(async () => runtimeConfig),
    } satisfies Partial<AdminModelConfigsService>;

    return {
      modelConfigs,
      service: new AiTextModelService(modelConfigs as AdminModelConfigsService),
    };
  }

  beforeEach(() => {
    createOpenAI.mockClear();
    generateText.mockReset();
  });

  it('creates an AI SDK LanguageModel from the configured OpenAI-compatible text runtime', async () => {
    const { modelConfigs, service } = createService();

    const model = await service.getTextModel();

    expect(modelConfigs.getRuntimeConfig).toHaveBeenCalledWith('text');
    expect(createOpenAI).toHaveBeenCalledWith({
      apiKey: 'sk-text-runtime',
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    });
    expect(model).toMatchObject({
      modelName: 'qwen-plus-latest',
      provider: 'mock-openai',
    });
  });

  it('requests JSON through generateText and parses the generated object', async () => {
    generateText.mockResolvedValueOnce({
      output: { ok: true, outlines: [] },
      text: '{"ok":true,"outlines":[]}',
    });
    const { service } = createService();

    const payload = await service.generateTextJson({
      messages: [
        { content: '你只返回 JSON。', role: 'system' },
        { content: '生成 3 个大纲。', role: 'user' },
      ],
      temperature: 0.7,
    });

    expect(payload).toEqual({ ok: true, outlines: [] });
    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        maxRetries: 0,
        messages: [
          { content: '你只返回 JSON。', role: 'system' },
          { content: '生成 3 个大纲。', role: 'user' },
        ],
        model: expect.objectContaining({ modelName: 'qwen-plus-latest' }),
        output: expect.objectContaining({ name: Output.json().name }),
        temperature: 0.7,
      }),
    );
  });

  it('rejects non-object JSON output', async () => {
    generateText.mockResolvedValueOnce({
      output: ['not-object'],
      text: '["not-object"]',
    });
    const { service } = createService();

    await expect(
      service.generateTextJson({
        messages: [{ content: '只返回 JSON。', role: 'user' }],
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
