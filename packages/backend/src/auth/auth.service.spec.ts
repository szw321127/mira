import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

describe('AuthService Google login', () => {
  const googleProfile = {
    email: 'Creator@Gmail.com',
    emailVerified: true,
    name: 'Creator Name',
    sub: 'google-sub-1',
  };

  function createService(
    configValues: Record<string, string | undefined> = {},
  ) {
    const configService = {
      get: jest.fn((key: string) => configValues[key]),
    };
    const jwtService = {
      sign: jest.fn(() => 'jwt-token'),
    };
    const prisma = {
      user: {
        create: jest.fn(),
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
    };
    const googleIdentity = {
      verifyCredential: jest.fn().mockResolvedValue(googleProfile),
    };

    return {
      configService,
      googleIdentity,
      jwtService,
      prisma,
      service: new AuthService(
        jwtService as never,
        prisma as never,
        googleIdentity as never,
        configService as never,
      ),
    };
  }

  it('creates a user when a verified Google email has not registered', async () => {
    const { googleIdentity, prisma, service } = createService();
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.user.create.mockResolvedValue({
      account: 'creator@gmail.com',
      authProvider: 'google',
      displayName: 'Creator Name',
      googleSub: 'google-sub-1',
      id: 'user-1',
      passwordHash: null,
    });

    const result = await service.loginWithGoogle({
      credential: 'google-id-token',
    });

    expect(googleIdentity.verifyCredential).toHaveBeenCalledWith(
      'google-id-token',
    );
    expect(prisma.user.findUnique).toHaveBeenNthCalledWith(1, {
      where: { googleSub: 'google-sub-1' },
    });
    expect(prisma.user.findUnique).toHaveBeenNthCalledWith(2, {
      where: { account: 'creator@gmail.com' },
    });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        account: 'creator@gmail.com',
        authProvider: 'google',
        displayName: 'Creator Name',
        googleSub: 'google-sub-1',
        passwordHash: null,
      },
    });
    expect(result.accessToken).toBe('jwt-token');
    expect(result.user.account).toBe('creator@gmail.com');
  });

  it('links an existing email account to Google before logging in', async () => {
    const { prisma, service } = createService();
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({
      account: 'creator@gmail.com',
      authProvider: 'password',
      displayName: 'Old Name',
      googleSub: null,
      id: 'user-1',
      passwordHash: 'argon-hash',
    });
    prisma.user.update.mockResolvedValue({
      account: 'creator@gmail.com',
      authProvider: 'google',
      displayName: 'Creator Name',
      googleSub: 'google-sub-1',
      id: 'user-1',
      passwordHash: 'argon-hash',
    });

    const result = await service.loginWithGoogle({
      credential: 'google-id-token',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      data: {
        authProvider: 'google',
        displayName: 'Creator Name',
        googleSub: 'google-sub-1',
      },
      where: { id: 'user-1' },
    });
    expect(result.user.name).toBe('Creator Name');
  });

  it('does not allow password login for a Google-only account', async () => {
    const { prisma, service } = createService();
    prisma.user.findUnique.mockResolvedValue({
      account: 'creator@gmail.com',
      authProvider: 'google',
      displayName: 'Creator Name',
      googleSub: 'google-sub-1',
      id: 'user-1',
      passwordHash: null,
    });

    await expect(
      service.login({ account: 'creator@gmail.com', password: 'password-1' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('allows demo login outside production by default', async () => {
    const { prisma, service } = createService();
    prisma.user.upsert.mockResolvedValue({
      account: 'creator@rednote.local',
      authProvider: 'password',
      displayName: '内容创作者',
      googleSub: null,
      id: 'demo-user',
      passwordHash: 'argon-hash',
    });

    const result = await service.loginDemo();

    expect(prisma.user.upsert).toHaveBeenCalled();
    expect(result.user.account).toBe('creator@rednote.local');
  });

  it('rejects demo login in production by default', async () => {
    const { prisma, service } = createService({ NODE_ENV: 'production' });

    await expect(service.loginDemo()).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.user.upsert).not.toHaveBeenCalled();
  });

  it('allows demo login in production when explicitly enabled', async () => {
    const { prisma, service } = createService({
      ENABLE_DEMO_LOGIN: 'true',
      NODE_ENV: 'production',
    });
    prisma.user.upsert.mockResolvedValue({
      account: 'creator@rednote.local',
      authProvider: 'password',
      displayName: '内容创作者',
      googleSub: null,
      id: 'demo-user',
      passwordHash: 'argon-hash',
    });

    const result = await service.loginDemo();

    expect(prisma.user.upsert).toHaveBeenCalled();
    expect(result.user.account).toBe('creator@rednote.local');
  });
});
