import { ConfigService } from '@nestjs/config';
import { XhsAuthorizationsService } from './xhs-authorizations.service';

const now = new Date('2026-06-16T10:00:00.000Z');

function createService() {
  const rows = new Map<string, Record<string, unknown>>();
  let counter = 0;
  const prisma = {
    xhsAuthorization: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        counter += 1;
        const row = {
          createdAt: now,
          id: `xhs-auth-${counter}`,
          updatedAt: now,
          ...data,
        };
        rows.set(String(row.id), row);
        return row;
      }),
      findFirst: jest.fn(
        ({ where }: { where: { id?: string; status?: string; userId?: string } }) =>
          Array.from(rows.values()).find(
            (row) =>
              (!where.id || row.id === where.id) &&
              (!where.userId || row.userId === where.userId) &&
              (!where.status || row.status === where.status),
          ) ?? null,
      ),
      update: jest.fn(
        ({
          data,
          where,
        }: {
          data: Record<string, unknown>;
          where: { id: string };
        }) => {
          const existing = rows.get(where.id);
          if (!existing) throw new Error('missing row');
          const row = { ...existing, ...data, updatedAt: now };
          rows.set(where.id, row);
          return row;
        },
      ),
      updateMany: jest.fn(
        ({
          data,
          where,
        }: {
          data: Record<string, unknown>;
          where: { status?: string; userId?: string };
        }) => {
          let count = 0;
          for (const [id, row] of rows) {
            if (
              (!where.userId || row.userId === where.userId) &&
              (!where.status || row.status === where.status)
            ) {
              rows.set(id, { ...row, ...data, updatedAt: now });
              count += 1;
            }
          }
          return { count };
        },
      ),
    },
  };
  const connector = {
    validateCookie: jest.fn().mockResolvedValue({
      account: {
        avatar: 'https://example.com/avatar.jpg',
        nickname: '小红书作者',
        user_id: 'xhs-user-1',
      },
      valid: true,
    }),
  };
  const service = new XhsAuthorizationsService(
    prisma as never,
    new ConfigService({ XHS_AUTH_SECRET: 'unit-test-secret' }),
    connector as never,
  );

  return { connector, prisma, rows, service };
}

describe('XhsAuthorizationsService', () => {
  it('validates, encrypts, and stores one active PC cookie per user', async () => {
    const { connector, prisma, rows, service } = createService();

    const view = await service.createOrReplace('user-1', {
      cookie: 'a1=abc; web_session=session;',
    });

    expect(connector.validateCookie).toHaveBeenCalledWith({
      cookie: 'a1=abc; web_session=session;',
      userId: 'user-1',
    });
    expect(prisma.xhsAuthorization.updateMany).toHaveBeenCalledWith({
      data: { status: 'deleted' },
      where: { platform: 'xhs', status: 'active', subType: 'pc', userId: 'user-1' },
    });
    expect(view).toMatchObject({
      accountId: 'xhs-user-1',
      accountName: '小红书作者',
      platform: 'xhs',
      status: 'active',
      subType: 'pc',
    });
    const stored = rows.get(view.id);
    expect(stored?.cookieEncrypted).not.toBe('a1=abc; web_session=session;');
    expect(JSON.stringify(view)).not.toContain('web_session');
  });

  it('returns decrypted runtime authorization for connector calls', async () => {
    const { service } = createService();
    const created = await service.createOrReplace('user-1', {
      cookie: 'a1=abc; web_session=session;',
    });

    const runtime = await service.getActiveRuntimeAuthorization('user-1');

    expect(runtime).toMatchObject({
      cookie: 'a1=abc; web_session=session;',
      id: created.id,
      status: 'active',
    });
  });

  it('marks an owned authorization as deleted', async () => {
    const { service } = createService();
    const created = await service.createOrReplace('user-1', {
      cookie: 'a1=abc; web_session=session;',
    });

    const result = await service.delete('user-1', created.id);

    expect(result.status).toBe('deleted');
  });
});
