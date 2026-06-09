import { AdminModelConfigsService } from './admin-model-configs.service';

type StoredConfig = {
  apiKeyEncrypted: string | null;
  baseUrl: string;
  createdAt: Date;
  id: string;
  modelName: string;
  type: string;
  updatedAt: Date;
};

type StoredApiKey = {
  apiKeyEncrypted: string;
  createdAt: Date;
  enabled: boolean;
  id: string;
  name: string;
  type: string;
  updatedAt: Date;
};

describe('AdminModelConfigsService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockFetchJson(payload: unknown, status = 200) {
    return jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => payload,
      ok: status >= 200 && status < 300,
      status,
    } as Response);
  }

  function createService(
    records: StoredConfig[] = [],
    apiKeyRecords: StoredApiKey[] = [],
  ) {
    const prisma = {
      adminModelApiKey: {
        create: jest.fn(async ({ data }) => {
          const record = {
            createdAt: new Date('2026-06-09T00:02:00.000Z'),
            enabled: data.enabled ?? true,
            id: `api-key-${apiKeyRecords.length + 1}`,
            updatedAt: new Date('2026-06-09T00:02:00.000Z'),
            ...data,
          };

          apiKeyRecords.push(record);
          return record;
        }),
        delete: jest.fn(async ({ where }: { where: { id: string } }) => {
          const index = apiKeyRecords.findIndex(
            (record) => record.id === where.id,
          );
          const [record] = apiKeyRecords.splice(index, 1);
          return record;
        }),
        findFirst: jest.fn(
          async ({
            where,
          }: {
            where: { enabled?: boolean; id?: string; type: string };
          }) =>
            apiKeyRecords.find(
              (record) =>
                record.type === where.type &&
                (where.id === undefined || record.id === where.id) &&
                (where.enabled === undefined ||
                  record.enabled === where.enabled),
            ) ?? null,
        ),
        findMany: jest.fn(
          async ({ where }: { where?: { type?: string } } = {}) =>
            apiKeyRecords.filter(
              (record) => !where?.type || record.type === where.type,
            ),
        ),
        update: jest.fn(
          async ({
            data,
            where,
          }: {
            data: Partial<StoredApiKey>;
            where: { id: string };
          }) => {
            const record = apiKeyRecords.find((item) => item.id === where.id);

            if (!record) {
              throw new Error('api key not found');
            }

            Object.assign(record, data, {
              updatedAt: new Date('2026-06-09T00:03:00.000Z'),
            });

            return record;
          },
        ),
      },
      adminModelConfig: {
        findMany: jest.fn(async () => records),
        findUnique: jest.fn(
          async ({ where }: { where: { type: string } }) =>
            records.find((record) => record.type === where.type) ?? null,
        ),
        upsert: jest.fn(async ({ create, update, where }) => {
          const existing = records.find((record) => record.type === where.type);
          const next = {
            ...(existing ?? {
              createdAt: new Date('2026-06-09T00:00:00.000Z'),
              id: `${where.type}-config`,
              type: where.type,
            }),
            ...create,
            ...update,
            updatedAt: new Date('2026-06-09T00:01:00.000Z'),
          };

          return next;
        }),
      },
    };
    const configService = {
      get: jest.fn((key: string) =>
        key === 'MODEL_CONFIG_SECRET' ? 'unit-test-secret' : undefined,
      ),
    };
    const auditLogs = {
      record: jest.fn(async () => undefined),
    };

    return {
      auditLogs,
      prisma,
      service: new AdminModelConfigsService(
        prisma as never,
        configService as never,
        auditLogs as never,
      ),
    };
  }

  it('encrypts apiKey and returns only key status plus preview', async () => {
    const { auditLogs, prisma, service } = createService();

    const result = await service.save('text', {
      apiKey: 'sk-rednote-text-secret',
      baseUrl: ' https://api.openai.example/v1 ',
      modelName: ' gpt-rednote ',
    });

    const upsertArgs = prisma.adminModelConfig.upsert.mock.calls[0][0];
    expect(upsertArgs.create.apiKeyEncrypted).not.toBe(
      'sk-rednote-text-secret',
    );
    expect(upsertArgs.create.apiKeyEncrypted).toMatch(/^v1:/);
    expect(result).toMatchObject({
      apiKeyPreview: '****************cret',
      baseUrl: 'https://api.openai.example/v1',
      hasApiKey: true,
      modelName: 'gpt-rednote',
      type: 'text',
    });
    expect(result).not.toHaveProperty('apiKey');
    expect(auditLogs.record).toHaveBeenCalledWith({
      action: 'model_config.saved',
      metadata: {
        apiKeyUpdated: true,
        baseUrl: 'https://api.openai.example/v1',
        hasApiKey: true,
        modelName: 'gpt-rednote',
      },
      targetKey: 'text',
      targetType: 'model_config',
    });
  });

  it('keeps the existing encrypted key when apiKey is blank', async () => {
    const existing: StoredConfig = {
      apiKeyEncrypted: 'v1:existing-key',
      baseUrl: 'https://old.example/v1',
      createdAt: new Date('2026-06-09T00:00:00.000Z'),
      id: 'text-config',
      modelName: 'old-model',
      type: 'text',
      updatedAt: new Date('2026-06-09T00:00:00.000Z'),
    };
    const { prisma, service } = createService([existing]);

    await service.save('text', {
      apiKey: '   ',
      baseUrl: 'https://new.example/v1',
      modelName: 'new-model',
    });

    const upsertArgs = prisma.adminModelConfig.upsert.mock.calls[0][0];
    expect(upsertArgs.update.apiKeyEncrypted).toBe('v1:existing-key');
  });

  it('lists text and image configs without exposing full api keys', async () => {
    const { prisma, service } = createService();
    const text = await service.save('text', {
      apiKey: 'sk-text-secret',
      baseUrl: 'https://text.example/v1',
      modelName: 'text-model',
    });
    const image = await service.save('image', {
      apiKey: 'sk-image-secret',
      baseUrl: 'https://image.example/v1',
      modelName: 'image-model',
    });
    const textEncrypted =
      prisma.adminModelConfig.upsert.mock.calls[0][0].create.apiKeyEncrypted;
    const imageEncrypted =
      prisma.adminModelConfig.upsert.mock.calls[1][0].create.apiKeyEncrypted;
    const { service: listService } = createService([
      {
        apiKeyEncrypted: textEncrypted,
        baseUrl: text.baseUrl,
        createdAt: new Date('2026-06-09T00:00:00.000Z'),
        id: 'text-config',
        modelName: text.modelName,
        type: 'text',
        updatedAt: new Date('2026-06-09T00:00:00.000Z'),
      },
      {
        apiKeyEncrypted: imageEncrypted,
        baseUrl: image.baseUrl,
        createdAt: new Date('2026-06-09T00:00:00.000Z'),
        id: 'image-config',
        modelName: image.modelName,
        type: 'image',
        updatedAt: new Date('2026-06-09T00:00:00.000Z'),
      },
    ]);

    await expect(listService.list()).resolves.toMatchObject([
      { hasApiKey: true, modelName: 'text-model', type: 'text' },
      { hasApiKey: true, modelName: 'image-model', type: 'image' },
    ]);
  });

  it('returns decrypted runtime config only for backend provider calls', async () => {
    const { prisma, service } = createService();
    await service.save('text', {
      apiKey: 'sk-runtime-secret',
      baseUrl: 'https://text.example/v1',
      modelName: 'text-model',
    });
    const apiKeyEncrypted =
      prisma.adminModelConfig.upsert.mock.calls[0][0].create.apiKeyEncrypted;
    const { auditLogs, service: runtimeService } = createService([
      {
        apiKeyEncrypted,
        baseUrl: 'https://text.example/v1',
        createdAt: new Date('2026-06-09T00:00:00.000Z'),
        id: 'text-config',
        modelName: 'text-model',
        type: 'text',
        updatedAt: new Date('2026-06-09T00:00:00.000Z'),
      },
    ]);

    await expect(runtimeService.getRuntimeConfig('text')).resolves.toEqual({
      apiKey: 'sk-runtime-secret',
      baseUrl: 'https://text.example/v1',
      modelName: 'text-model',
      type: 'text',
    });
  });

  it('rejects incomplete runtime config with a clear message', async () => {
    const { service } = createService([
      {
        apiKeyEncrypted: null,
        baseUrl: 'https://text.example/v1',
        createdAt: new Date('2026-06-09T00:00:00.000Z'),
        id: 'text-config',
        modelName: 'text-model',
        type: 'text',
        updatedAt: new Date('2026-06-09T00:00:00.000Z'),
      },
    ]);

    await expect(service.getRuntimeConfig('text')).rejects.toThrow(
      '请先在后台配置文本模型。',
    );
  });

  it('tests the saved text model connection without returning the api key', async () => {
    const { prisma, service } = createService();
    await service.save('text', {
      apiKey: 'sk-runtime-secret',
      baseUrl: 'https://text.example/v1',
      modelName: 'text-model',
    });
    const apiKeyEncrypted =
      prisma.adminModelConfig.upsert.mock.calls[0][0].create.apiKeyEncrypted;
    const { auditLogs, service: runtimeService } = createService([
      {
        apiKeyEncrypted,
        baseUrl: 'https://text.example/v1',
        createdAt: new Date('2026-06-09T00:00:00.000Z'),
        id: 'text-config',
        modelName: 'text-model',
        type: 'text',
        updatedAt: new Date('2026-06-09T00:00:00.000Z'),
      },
    ]);
    const fetchMock = mockFetchJson({
      choices: [{ message: { content: 'ok' } }],
    });

    const result = await runtimeService.testConnection('text');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://text.example/v1/chat/completions',
      expect.objectContaining({
        body: expect.stringContaining('"model":"text-model"'),
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-runtime-secret',
          'Content-Type': 'application/json',
        }),
        method: 'POST',
      }),
    );
    expect(result).toMatchObject({
      endpoint: 'https://text.example/v1/chat/completions',
      modelName: 'text-model',
      ok: true,
      type: 'text',
    });
    expect(result).not.toHaveProperty('apiKey');
    expect(auditLogs.record).toHaveBeenCalledWith({
      action: 'model_config.connection_tested',
      metadata: {
        endpoint: 'https://text.example/v1/chat/completions',
        modelName: 'text-model',
      },
      targetKey: 'text',
      targetType: 'model_config',
    });
  });

  it('tests the saved image model connection against the image endpoint', async () => {
    const { prisma, service } = createService();
    await service.save('image', {
      apiKey: 'sk-image-secret',
      baseUrl: 'https://image.example/v1',
      modelName: 'image-model',
    });
    const apiKeyEncrypted =
      prisma.adminModelConfig.upsert.mock.calls[0][0].create.apiKeyEncrypted;
    const { service: runtimeService } = createService([
      {
        apiKeyEncrypted,
        baseUrl: 'https://image.example/v1',
        createdAt: new Date('2026-06-09T00:00:00.000Z'),
        id: 'image-config',
        modelName: 'image-model',
        type: 'image',
        updatedAt: new Date('2026-06-09T00:00:00.000Z'),
      },
    ]);
    const fetchMock = mockFetchJson({
      data: [{ b64_json: 'iVBORw0KGgo=' }],
    });

    await expect(runtimeService.testConnection('image')).resolves.toMatchObject(
      {
        endpoint: 'https://image.example/v1/images/generations',
        modelName: 'image-model',
        ok: true,
        type: 'image',
      },
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://image.example/v1/images/generations',
      expect.objectContaining({
        body: expect.stringContaining('"model":"image-model"'),
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-image-secret',
        }),
        method: 'POST',
      }),
    );
  });

  it('surfaces provider errors while testing model connections', async () => {
    const { prisma, service } = createService();
    await service.save('text', {
      apiKey: 'sk-runtime-secret',
      baseUrl: 'https://text.example/v1',
      modelName: 'text-model',
    });
    const apiKeyEncrypted =
      prisma.adminModelConfig.upsert.mock.calls[0][0].create.apiKeyEncrypted;
    const { service: runtimeService } = createService([
      {
        apiKeyEncrypted,
        baseUrl: 'https://text.example/v1',
        createdAt: new Date('2026-06-09T00:00:00.000Z'),
        id: 'text-config',
        modelName: 'text-model',
        type: 'text',
        updatedAt: new Date('2026-06-09T00:00:00.000Z'),
      },
    ]);
    mockFetchJson({ error: { message: 'invalid api key' } }, 401);

    await expect(runtimeService.testConnection('text')).rejects.toThrow(
      'invalid api key',
    );
  });

  it('adds multiple api keys without exposing their values', async () => {
    const { service } = createService([
      {
        apiKeyEncrypted: null,
        baseUrl: 'https://text.example/v1',
        createdAt: new Date('2026-06-09T00:00:00.000Z'),
        id: 'text-config',
        modelName: 'text-model',
        type: 'text',
        updatedAt: new Date('2026-06-09T00:00:00.000Z'),
      },
    ]);

    const first = await service.addApiKey('text', {
      apiKey: 'sk-first-secret',
      enabled: true,
      name: '主 Key',
    });
    const second = await service.addApiKey('text', {
      apiKey: 'sk-second-secret',
      enabled: false,
      name: '备用 Key',
    });
    const [config] = await service.list();

    expect(first).toMatchObject({
      apiKeyPreview: '****************cret',
      enabled: true,
      name: '主 Key',
      type: 'text',
    });
    expect(second).toMatchObject({
      enabled: false,
      name: '备用 Key',
      type: 'text',
    });
    expect(config.apiKeys).toHaveLength(2);
    expect(JSON.stringify(config.apiKeys)).not.toContain('sk-first-secret');
    expect(JSON.stringify(config.apiKeys)).not.toContain('sk-second-secret');
  });

  it('uses the first enabled key for runtime provider calls', async () => {
    const { service } = createService(
      [
        {
          apiKeyEncrypted: null,
          baseUrl: 'https://text.example/v1',
          createdAt: new Date('2026-06-09T00:00:00.000Z'),
          id: 'text-config',
          modelName: 'text-model',
          type: 'text',
          updatedAt: new Date('2026-06-09T00:00:00.000Z'),
        },
      ],
      [
        {
          apiKeyEncrypted: '',
          createdAt: new Date('2026-06-09T00:00:00.000Z'),
          enabled: false,
          id: 'disabled-key',
          name: '停用 Key',
          type: 'text',
          updatedAt: new Date('2026-06-09T00:00:00.000Z'),
        },
      ],
    );
    const enabled = await service.addApiKey('text', {
      apiKey: 'sk-enabled-secret',
      enabled: true,
      name: '启用 Key',
    });

    const runtimeConfig = await service.getRuntimeConfig('text');

    expect(enabled.enabled).toBe(true);
    expect(runtimeConfig.apiKey).toBe('sk-enabled-secret');
  });

  it('updates and deletes api keys by id', async () => {
    const { service } = createService();
    const created = await service.addApiKey('image', {
      apiKey: 'sk-image-secret',
      enabled: true,
      name: '图片 Key',
    });

    const disabled = await service.updateApiKey('image', created.id, {
      enabled: false,
      name: '图片备用 Key',
    });
    const deleted = await service.deleteApiKey('image', created.id);
    const imageConfig = (await service.list()).find(
      (config) => config.type === 'image',
    );

    expect(disabled).toMatchObject({
      enabled: false,
      name: '图片备用 Key',
    });
    expect(deleted.id).toBe(created.id);
    expect(imageConfig?.apiKeys).toHaveLength(0);
  });
});
