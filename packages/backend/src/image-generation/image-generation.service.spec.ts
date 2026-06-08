import type { AdminModelConfigsService } from '../admin-model-configs/admin-model-configs.service';
import { ImageGenerationService } from './image-generation.service';

describe('ImageGenerationService real image provider', () => {
  const runtimeConfig = {
    apiKey: 'sk-image-runtime',
    baseUrl: 'https://image.example/v1',
    modelName: 'rednote-image-model',
    type: 'image' as const,
  };

  function createService() {
    const modelConfigs = {
      getRuntimeConfig: jest.fn(async () => runtimeConfig),
    } satisfies Partial<AdminModelConfigsService>;

    return {
      modelConfigs,
      service: new ImageGenerationService(
        modelConfigs as AdminModelConfigsService,
      ),
    };
  }

  function mockFetchJson(payload: unknown, status = 200) {
    return jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(payload), {
        headers: { 'Content-Type': 'application/json' },
        status,
      }),
    );
  }

  const input = {
    coverLine: '阳台早餐角',
    imagePrompt: '真实出租屋阳台，早餐盘，柔和自然光，标题留白。',
    postDraftId: 'draft-1',
    tags: ['小红书家居', '出租屋改造'],
    title: '出租屋阳台早餐角，300 元内就能开始',
    topic: '出租屋阳台早餐角',
  };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('generates a cover image through the configured image model as base64 data URL', async () => {
    const fetchMock = mockFetchJson({
      data: [{ b64_json: 'abc123' }],
    });
    const { modelConfigs, service } = createService();

    const result = await service.generateCover(input);

    expect(modelConfigs.getRuntimeConfig).toHaveBeenCalledWith('image');
    expect(result).toEqual({
      generatedAt: expect.any(Date),
      imageUrl: 'data:image/png;base64,abc123',
      provider: 'rednote-image-model',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://image.example/v1/images/generations',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-image-runtime',
          'Content-Type': 'application/json',
        }),
        method: 'POST',
      }),
    );
    const requestBody = JSON.parse(
      fetchMock.mock.calls[0][1]?.body as string,
    ) as { model: string; prompt: string; size: string };
    expect(requestBody.model).toBe('rednote-image-model');
    expect(requestBody.prompt).toContain('真实出租屋阳台');
    expect(requestBody.prompt).toContain('阳台早餐角');
    expect(requestBody.size).toBe('1024x1536');
  });

  it('accepts image URLs returned by providers', async () => {
    mockFetchJson({
      data: [{ url: 'https://cdn.example/cover.png' }],
    });
    const { service } = createService();

    await expect(service.generateCover(input)).resolves.toMatchObject({
      imageUrl: 'https://cdn.example/cover.png',
      provider: 'rednote-image-model',
    });
  });

  it('rejects malformed image provider responses', async () => {
    mockFetchJson({ data: [{}] });
    const { service } = createService();

    await expect(service.generateCover(input)).rejects.toThrow(
      '图片模型响应格式无效。',
    );
  });
});
