import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AdminAuthService } from './admin-auth.service';

type MockAdminUser = {
  account: string;
  createdAt: Date;
  displayName: string;
  id: string;
  lastLoginAt: Date | null;
  passwordHash: string;
  updatedAt: Date;
};

function createAdminUser(
  overrides: Partial<MockAdminUser> = {},
): MockAdminUser {
  return {
    account: 'admin',
    createdAt: new Date('2026-06-09T01:00:00.000Z'),
    displayName: '系统管理员',
    id: 'admin-1',
    lastLoginAt: null,
    passwordHash: 'argon-hash',
    updatedAt: new Date('2026-06-09T01:00:00.000Z'),
    ...overrides,
  };
}

function createService(configValues: Record<string, string | undefined> = {}) {
  const adminUser = {
    count: jest.fn(),
    create: jest.fn(),
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    update: jest.fn(),
  };
  const configService = {
    get: jest.fn((key: string) => configValues[key]),
  };
  const jwtService = {
    sign: jest.fn(() => 'admin-token'),
  };
  const prisma = {
    adminUser,
  };

  return {
    adminUser,
    configService,
    jwtService,
    prisma,
    service: new AdminAuthService(
      jwtService as never,
      prisma as never,
      configService as never,
    ),
  };
}

describe('AdminAuthService', () => {
  it('bootstraps the first administrator with development defaults', async () => {
    const { adminUser, service } = createService();
    adminUser.count.mockResolvedValue(0);
    adminUser.create.mockImplementation(
      async ({ data }: { data: Omit<MockAdminUser, 'id'> }) =>
        createAdminUser({
          account: data.account,
          displayName: data.displayName,
          passwordHash: data.passwordHash,
        }),
    );

    const result = await service.ensureInitialAdmin();

    expect(adminUser.create).toHaveBeenCalledWith({
      data: {
        account: 'admin',
        displayName: '系统管理员',
        passwordHash: expect.any(String),
      },
    });
    const passwordHash = adminUser.create.mock.calls[0][0].data.passwordHash;
    expect(await argon2.verify(passwordHash, 'Rednote@123456')).toBe(true);
    expect(result?.account).toBe('admin');
  });

  it('uses configured initial administrator credentials', async () => {
    const { adminUser, service } = createService({
      ADMIN_INITIAL_ACCOUNT: 'RootAdmin',
      ADMIN_INITIAL_PASSWORD: 'Configured@123456',
    });
    adminUser.count.mockResolvedValue(0);
    adminUser.create.mockImplementation(
      async ({ data }: { data: Omit<MockAdminUser, 'id'> }) =>
        createAdminUser({
          account: data.account,
          displayName: data.displayName,
          passwordHash: data.passwordHash,
        }),
    );

    await service.ensureInitialAdmin();

    expect(adminUser.create.mock.calls[0][0].data.account).toBe('rootadmin');
    expect(
      await argon2.verify(
        adminUser.create.mock.calls[0][0].data.passwordHash,
        'Configured@123456',
      ),
    ).toBe(true);
  });

  it('requires a configured initial password before production bootstrap', async () => {
    const { adminUser, service } = createService({ NODE_ENV: 'production' });
    adminUser.count.mockResolvedValue(0);

    await expect(service.ensureInitialAdmin()).rejects.toThrow(
      'ADMIN_INITIAL_PASSWORD',
    );
    expect(adminUser.create).not.toHaveBeenCalled();
  });

  it('does not create a bootstrap administrator when one already exists', async () => {
    const { adminUser, service } = createService();
    adminUser.count.mockResolvedValue(1);

    await expect(service.ensureInitialAdmin()).resolves.toBeNull();

    expect(adminUser.create).not.toHaveBeenCalled();
  });

  it('rejects login with an unknown administrator account', async () => {
    const { adminUser, service } = createService();
    adminUser.findUnique.mockResolvedValue(null);

    await expect(
      service.login({ account: 'missing', password: 'password-1' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('logs in an administrator and updates last login time', async () => {
    const { adminUser, jwtService, service } = createService();
    const passwordHash = await argon2.hash('Correct@123456');
    const user = createAdminUser({ passwordHash });
    const loggedInUser = createAdminUser({
      lastLoginAt: new Date('2026-06-09T03:00:00.000Z'),
      passwordHash,
    });
    adminUser.findUnique.mockResolvedValue(user);
    adminUser.update.mockResolvedValue(loggedInUser);

    const result = await service.login({
      account: ' Admin ',
      password: 'Correct@123456',
    });

    expect(adminUser.findUnique).toHaveBeenCalledWith({
      where: { account: 'admin' },
    });
    expect(adminUser.update).toHaveBeenCalledWith({
      data: { lastLoginAt: expect.any(Date) },
      where: { id: 'admin-1' },
    });
    expect(jwtService.sign).toHaveBeenCalledWith({
      account: 'admin',
      displayName: '系统管理员',
      scope: 'admin',
      sub: 'admin-1',
    });
    expect(result.accessToken).toBe('admin-token');
    expect(result.admin.lastLoginAt).toBe('2026-06-09T03:00:00.000Z');
  });

  it('returns the current administrator profile', async () => {
    const { adminUser, service } = createService();
    adminUser.findUniqueOrThrow.mockResolvedValue(createAdminUser());

    const profile = await service.getMe('admin-1');

    expect(adminUser.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: 'admin-1' },
    });
    expect(profile.displayName).toBe('系统管理员');
  });

  it('updates administrator display name', async () => {
    const { adminUser, service } = createService();
    adminUser.update.mockResolvedValue(
      createAdminUser({ displayName: '内容运营管理员' }),
    );

    const profile = await service.updateProfile('admin-1', {
      displayName: ' 内容运营管理员 ',
    });

    expect(adminUser.update).toHaveBeenCalledWith({
      data: { displayName: '内容运营管理员' },
      where: { id: 'admin-1' },
    });
    expect(profile.displayName).toBe('内容运营管理员');
  });

  it('rejects password changes when the current password is wrong', async () => {
    const { adminUser, service } = createService();
    adminUser.findUniqueOrThrow.mockResolvedValue(
      createAdminUser({ passwordHash: await argon2.hash('Old@123456') }),
    );

    await expect(
      service.changePassword('admin-1', {
        currentPassword: 'Wrong@123456',
        newPassword: 'New@123456',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    expect(adminUser.update).not.toHaveBeenCalled();
  });

  it('changes administrator password after verifying the current password', async () => {
    const { adminUser, service } = createService();
    adminUser.findUniqueOrThrow.mockResolvedValue(
      createAdminUser({ passwordHash: await argon2.hash('Old@123456') }),
    );
    adminUser.update.mockImplementation(
      async ({ data }: { data: Pick<MockAdminUser, 'passwordHash'> }) =>
        createAdminUser({ passwordHash: data.passwordHash }),
    );

    const profile = await service.changePassword('admin-1', {
      currentPassword: 'Old@123456',
      newPassword: 'New@123456',
    });

    const newPasswordHash = adminUser.update.mock.calls[0][0].data.passwordHash;
    expect(await argon2.verify(newPasswordHash, 'New@123456')).toBe(true);
    expect(profile.id).toBe('admin-1');
  });
});
