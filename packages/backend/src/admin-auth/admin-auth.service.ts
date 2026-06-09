import {
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { AdminUser } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import type {
  AdminAuthResponse,
  AdminJwtPayload,
  AdminProfile,
} from './admin-auth.types';
import type { AdminLoginDto } from './dto/admin-login.dto';
import type { ChangeAdminPasswordDto } from './dto/change-admin-password.dto';
import type { UpdateAdminProfileDto } from './dto/update-admin-profile.dto';

const DEFAULT_ADMIN_ACCOUNT = 'admin';
const DEFAULT_ADMIN_DISPLAY_NAME = '系统管理员';
const DEFAULT_ADMIN_PASSWORD = 'Rednote@123456';

@Injectable()
export class AdminAuthService implements OnModuleInit {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureInitialAdmin();
  }

  async ensureInitialAdmin(): Promise<AdminProfile | null> {
    const existingCount = await this.prisma.adminUser.count();

    if (existingCount > 0) {
      return null;
    }

    const account = this.normalizeAccount(
      this.configService.get<string>('ADMIN_INITIAL_ACCOUNT') ??
        DEFAULT_ADMIN_ACCOUNT,
    );
    const password = this.resolveInitialPassword();
    const admin = await this.prisma.adminUser.create({
      data: {
        account,
        displayName: DEFAULT_ADMIN_DISPLAY_NAME,
        passwordHash: await argon2.hash(password),
      },
    });

    return this.toPublicAdmin(admin);
  }

  async login(dto: AdminLoginDto): Promise<AdminAuthResponse> {
    const account = this.normalizeAccount(dto.account);
    const admin = await this.prisma.adminUser.findUnique({
      where: { account },
    });

    if (!admin) {
      throw new UnauthorizedException(
        'Invalid administrator account or password.',
      );
    }

    const isPasswordValid = await argon2.verify(
      admin.passwordHash,
      dto.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException(
        'Invalid administrator account or password.',
      );
    }

    const loggedInAdmin = await this.prisma.adminUser.update({
      data: { lastLoginAt: new Date() },
      where: { id: admin.id },
    });

    return this.createAuthResponse(loggedInAdmin);
  }

  async getMe(adminId: string): Promise<AdminProfile> {
    const admin = await this.prisma.adminUser.findUniqueOrThrow({
      where: { id: adminId },
    });

    return this.toPublicAdmin(admin);
  }

  async updateProfile(
    adminId: string,
    dto: UpdateAdminProfileDto,
  ): Promise<AdminProfile> {
    const admin = await this.prisma.adminUser.update({
      data: { displayName: dto.displayName.trim() },
      where: { id: adminId },
    });

    return this.toPublicAdmin(admin);
  }

  async changePassword(
    adminId: string,
    dto: ChangeAdminPasswordDto,
  ): Promise<AdminProfile> {
    const admin = await this.prisma.adminUser.findUniqueOrThrow({
      where: { id: adminId },
    });
    const isPasswordValid = await argon2.verify(
      admin.passwordHash,
      dto.currentPassword,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid current password.');
    }

    const updated = await this.prisma.adminUser.update({
      data: { passwordHash: await argon2.hash(dto.newPassword) },
      where: { id: adminId },
    });

    return this.toPublicAdmin(updated);
  }

  private createAuthResponse(admin: AdminUser): AdminAuthResponse {
    const payload: AdminJwtPayload = {
      account: admin.account,
      displayName: admin.displayName,
      scope: 'admin',
      sub: admin.id,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      admin: this.toPublicAdmin(admin),
    };
  }

  private normalizeAccount(account: string): string {
    return account.trim().toLowerCase();
  }

  private resolveInitialPassword(): string {
    const configuredPassword = this.configService
      .get<string>('ADMIN_INITIAL_PASSWORD')
      ?.trim();

    if (configuredPassword) {
      return configuredPassword;
    }

    if (this.configService.get<string>('NODE_ENV')?.trim() === 'production') {
      throw new Error(
        'ADMIN_INITIAL_PASSWORD must be configured before bootstrapping a production admin.',
      );
    }

    return DEFAULT_ADMIN_PASSWORD;
  }

  private toPublicAdmin(admin: AdminUser): AdminProfile {
    return {
      account: admin.account,
      createdAt: admin.createdAt.toISOString(),
      displayName: admin.displayName,
      id: admin.id,
      lastLoginAt: admin.lastLoginAt?.toISOString() ?? null,
      updatedAt: admin.updatedAt.toISOString(),
    };
  }
}
