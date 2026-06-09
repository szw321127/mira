import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AdminApiKeyGuard } from './admin-api-key.guard';

function createContext(headers: Record<string, string | undefined>) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

function createGuard(adminApiKey: string | undefined) {
  const configService = {
    get: jest.fn((key: string) =>
      key === 'ADMIN_API_KEY' ? adminApiKey : undefined,
    ),
  };

  return new AdminApiKeyGuard(configService as never);
}

describe('AdminApiKeyGuard', () => {
  it('allows admin requests when ADMIN_API_KEY is not configured', () => {
    const guard = createGuard(undefined);

    expect(guard.canActivate(createContext({}))).toBe(true);
  });

  it('rejects admin requests without a key when ADMIN_API_KEY is configured', () => {
    const guard = createGuard('secret-admin-key');

    expect(() => guard.canActivate(createContext({}))).toThrow(
      UnauthorizedException,
    );
  });

  it('rejects admin requests with the wrong key', () => {
    const guard = createGuard('secret-admin-key');

    expect(() =>
      guard.canActivate(
        createContext({
          'x-admin-api-key': 'wrong-key',
        }),
      ),
    ).toThrow('Invalid admin API key.');
  });

  it('allows admin requests with the correct key', () => {
    const guard = createGuard('secret-admin-key');

    expect(
      guard.canActivate(
        createContext({
          'x-admin-api-key': 'secret-admin-key',
        }),
      ),
    ).toBe(true);
  });

  it('keeps admin controllers on scoped administrator JWT auth', () => {
    const root = join(__dirname, '..');
    const controllerFiles = [
      'admin-projects/admin-projects.controller.ts',
      'admin-model-configs/admin-model-configs.controller.ts',
      'admin-audit-logs/admin-audit-logs.controller.ts',
    ];

    for (const file of controllerFiles) {
      const source = readFileSync(join(root, file), 'utf8');

      expect(source).toMatch(/UseGuards\(AdminJwtAuthGuard\)/);
      expect(source).not.toMatch(/UseGuards\(AdminApiKeyGuard\)/);
    }
  });
});
