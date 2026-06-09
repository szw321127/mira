import { ConfigService } from '@nestjs/config';
import { AdminAuditLogsService } from '../admin-audit-logs/admin-audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import { AdminContentProvidersService } from './admin-content-providers.service';

const now = new Date('2026-06-10T08:00:00.000Z');

function createService() {
  const configs = new Map<string, Record<string, unknown>>();
  const apiKeys = new Map<string, Record<string, unknown>>();
  let keyCounter = 0;
  const prisma = {
    adminContentProviderApiKey: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        keyCounter += 1;
        const row = {
          createdAt: now,
          id: `key-${keyCounter}`,
          updatedAt: now,
          ...data,
        };
        apiKeys.set(String(row.id), row);
        return row;
      }),
      delete: jest.fn(({ where }: { where: { id: string } }) => {
        const row = apiKeys.get(where.id);
        if (!row) {
          throw new Error('missing key');
        }
        apiKeys.delete(where.id);
        return row;
      }),
      findFirst: jest.fn(
        ({
          where,
        }: {
          where: { enabled?: boolean; id?: string; type?: string };
        }) =>
          Array.from(apiKeys.values()).find(
            (row) =>
              (where.enabled === undefined || row.enabled === where.enabled) &&
              (where.id === undefined || row.id === where.id) &&
              (where.type === undefined || row.type === where.type),
          ) ?? null,
      ),
      findMany: jest.fn(({ where }: { where?: { type?: string } } = {}) =>
        Array.from(apiKeys.values()).filter(
          (row) => !where?.type || row.type === where.type,
        ),
      ),
      update: jest.fn(
        ({
          data,
          where,
        }: {
          data: Record<string, unknown>;
          where: { id: string };
        }) => {
          const row = apiKeys.get(where.id);
          if (!row) {
            throw new Error('missing key');
          }
          const updated = { ...row, ...data, updatedAt: now };
          apiKeys.set(where.id, updated);
          return updated;
        },
      ),
    },
    adminContentProviderConfig: {
      findMany: jest.fn(() => Array.from(configs.values())),
      findUnique: jest.fn(
        ({ where }: { where: { type: string } }) =>
          configs.get(where.type) ?? null,
      ),
      upsert: jest.fn(
        ({
          create,
          update,
          where,
        }: {
          create: Record<string, unknown>;
          update: Record<string, unknown>;
          where: { type: string };
        }) => {
          const existing = configs.get(where.type);
          const saved = existing
            ? { ...existing, ...update, updatedAt: now }
            : {
                createdAt: now,
                id: `config-${where.type}`,
                updatedAt: now,
                ...create,
              };
          configs.set(where.type, saved);
          return saved;
        },
      ),
    },
  };
  const auditLogs = {
    record: jest.fn(() => undefined),
  };
  const service = new AdminContentProvidersService(
    prisma as unknown as PrismaService,
    new ConfigService(),
    auditLogs as unknown as AdminAuditLogsService,
  );

  return { auditLogs, prisma, service };
}

describe('AdminContentProvidersService', () => {
  it('lists default provider configs even before they are saved', async () => {
    const { service } = createService();

    const configs = await service.list();

    expect(configs.map((config) => config.type)).toEqual(['tikhub', 'custom']);
    expect(configs[0]).toMatchObject({
      apiKeys: [],
      baseUrl: '',
      enabled: false,
      hasApiKey: false,
      type: 'tikhub',
    });
  });

  it('saves provider connection settings and records an audit log', async () => {
    const { auditLogs, service } = createService();

    const saved = await service.save('tikhub', {
      baseUrl: 'https://api.tikhub.example',
      complianceNote: 'Only use user-authorized imports.',
      enabled: true,
      name: 'TikHub 主通道',
      rateLimitPerMinute: 30,
    });

    expect(saved).toMatchObject({
      baseUrl: 'https://api.tikhub.example',
      enabled: true,
      name: 'TikHub 主通道',
      rateLimitPerMinute: 30,
      type: 'tikhub',
    });
    expect(auditLogs.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'content_provider.saved',
        targetKey: 'tikhub',
        targetType: 'content_provider',
      }),
    );
  });

  it('adds, masks, toggles, and deletes multiple provider API keys', async () => {
    const { service } = createService();

    await service.save('tikhub', {
      baseUrl: 'https://api.tikhub.example',
      enabled: true,
      name: 'TikHub',
      rateLimitPerMinute: 20,
    });
    const created = await service.addApiKey('tikhub', {
      apiKey: 'sk-provider-secret-123456',
      enabled: true,
      name: '主 Key',
    });
    const second = await service.addApiKey('tikhub', {
      apiKey: 'sk-provider-backup-654321',
      enabled: false,
      name: '备用 Key',
    });

    expect(created.apiKeyPreview).toBe('****************3456');
    expect(second.enabled).toBe(false);

    const updated = await service.updateApiKey('tikhub', second.id, {
      enabled: true,
      name: '备用 Key 已启用',
    });
    expect(updated).toMatchObject({
      enabled: true,
      name: '备用 Key 已启用',
    });

    const deleted = await service.deleteApiKey('tikhub', created.id);
    expect(deleted.name).toBe('主 Key');

    const configs = await service.list();
    expect(configs[0]?.apiKeys.map((apiKey) => apiKey.name)).toEqual([
      '备用 Key 已启用',
    ]);
  });

  it('returns runtime config using the first enabled provider key', async () => {
    const { service } = createService();

    await service.save('custom', {
      baseUrl: 'https://provider.example/v1',
      enabled: true,
      name: '自定义服务商',
      rateLimitPerMinute: 60,
    });
    await service.addApiKey('custom', {
      apiKey: 'disabled-key',
      enabled: false,
      name: '停用 Key',
    });
    await service.addApiKey('custom', {
      apiKey: 'enabled-key',
      enabled: true,
      name: '启用 Key',
    });

    await expect(service.getRuntimeConfig('custom')).resolves.toMatchObject({
      apiKey: 'enabled-key',
      baseUrl: 'https://provider.example/v1',
      enabled: true,
      rateLimitPerMinute: 60,
      type: 'custom',
    });
  });
});
