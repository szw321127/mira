import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AdminJwtAuthGuard } from './admin-jwt-auth.guard';

function createContext(headers: Record<string, string | undefined>) {
  const request = { headers };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;

  return { context, request };
}

function createGuard(payload: unknown) {
  const jwtService = {
    verifyAsync: jest.fn().mockResolvedValue(payload),
  };

  return {
    guard: new AdminJwtAuthGuard(jwtService as never),
    jwtService,
  };
}

describe('AdminJwtAuthGuard', () => {
  it('rejects requests without a bearer token', async () => {
    const { context } = createContext({});
    const { guard } = createGuard(null);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects non-admin scoped JWT payloads', async () => {
    const { context } = createContext({
      authorization: 'Bearer creator-token',
    });
    const { guard } = createGuard({
      account: 'creator@example.com',
      displayName: 'Creator',
      scope: 'creator',
      sub: 'user-1',
    });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('attaches the administrator identity from a valid admin token', async () => {
    const { context, request } = createContext({
      authorization: 'Bearer admin-token',
    });
    const { guard, jwtService } = createGuard({
      account: 'admin',
      displayName: '系统管理员',
      scope: 'admin',
      sub: 'admin-1',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(jwtService.verifyAsync).toHaveBeenCalledWith('admin-token');
    expect(request).toMatchObject({
      admin: {
        account: 'admin',
        displayName: '系统管理员',
        id: 'admin-1',
      },
    });
  });

  it('exports the JWT module so feature modules can resolve guard dependencies', () => {
    const source = readFileSync(
      join(__dirname, 'admin-auth.module.ts'),
      'utf8',
    );

    expect(source).toMatch(/exports:\s*\[AdminJwtAuthGuard,\s*JwtModule\]/);
  });
});
