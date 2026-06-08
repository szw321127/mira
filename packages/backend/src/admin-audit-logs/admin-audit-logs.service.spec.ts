import { AdminAuditLogsService } from './admin-audit-logs.service';

describe('AdminAuditLogsService', () => {
  function createService(rows: Array<Record<string, unknown>> = []) {
    const prisma = {
      adminAuditLog: {
        create: jest.fn(async ({ data }) => ({
          ...data,
          createdAt: new Date('2026-06-09T00:00:00.000Z'),
          id: 'audit-created',
        })),
        findMany: jest.fn(async () => rows),
      },
    };

    return {
      prisma,
      service: new AdminAuditLogsService(prisma as never),
    };
  }

  it('records sanitized metadata without secrets', async () => {
    const { prisma, service } = createService();

    await service.record({
      action: 'model_config.saved',
      metadata: {
        apiKey: 'sk-secret',
        modelName: 'text-model',
        nested: { token: 'secret-token', visible: 'ok' },
      },
      targetKey: 'text',
      targetType: 'model_config',
    });

    expect(prisma.adminAuditLog.create).toHaveBeenCalledWith({
      data: {
        action: 'model_config.saved',
        actor: 'system',
        metadata: JSON.stringify({
          modelName: 'text-model',
          nested: { visible: 'ok' },
        }),
        targetKey: 'text',
        targetType: 'model_config',
      },
    });
  });

  it('lists newest audit rows and parses metadata', async () => {
    const { prisma, service } = createService([
      {
        action: 'project.created',
        actor: 'system',
        createdAt: new Date('2026-06-09T00:00:00.000Z'),
        id: 'audit-1',
        metadata: '{"name":"商业化后台"}',
        targetKey: 'commercial-admin',
        targetType: 'project',
      },
    ]);

    await expect(service.list(150)).resolves.toEqual([
      {
        action: 'project.created',
        actor: 'system',
        createdAt: '2026-06-09T00:00:00.000Z',
        id: 'audit-1',
        metadata: { name: '商业化后台' },
        targetKey: 'commercial-admin',
        targetType: 'project',
      },
    ]);
    expect(prisma.adminAuditLog.findMany).toHaveBeenCalledWith({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  });
});
