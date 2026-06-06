import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { User } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import type { GoogleLoginDto } from './dto/google-login.dto';
import { GoogleIdentityService } from './google-identity.service';
import type { JwtPayload } from './auth.types';

type PublicUser = {
  account: string;
  id: string;
  loginAt: string;
  name: string;
};

type AuthResponse = {
  accessToken: string;
  user: PublicUser;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly googleIdentityService: GoogleIdentityService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const account = this.normalizeAccount(dto.account);
    const existing = await this.prisma.user.findUnique({ where: { account } });

    if (existing) {
      throw new ConflictException('Account already exists.');
    }

    const user = await this.prisma.user.create({
      data: {
        account,
        displayName: dto.name.trim(),
        passwordHash: await argon2.hash(dto.password),
      },
    });

    return this.createAuthResponse(user);
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const account = this.normalizeAccount(dto.account);
    const user = await this.prisma.user.findUnique({ where: { account } });

    if (!user) {
      throw new UnauthorizedException('Invalid account or password.');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('Invalid account or password.');
    }

    const isPasswordValid = await argon2.verify(
      user.passwordHash,
      dto.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid account or password.');
    }

    return this.createAuthResponse(user);
  }

  async loginWithGoogle(dto: GoogleLoginDto): Promise<AuthResponse> {
    const profile = await this.googleIdentityService.verifyCredential(
      dto.credential,
    );

    if (!profile.emailVerified) {
      throw new UnauthorizedException('Google email is not verified.');
    }

    const account = this.normalizeAccount(profile.email);
    const existingByGoogleSub = await this.prisma.user.findUnique({
      where: { googleSub: profile.sub },
    });

    if (existingByGoogleSub) {
      return this.createAuthResponse(existingByGoogleSub);
    }

    const existingByAccount = await this.prisma.user.findUnique({
      where: { account },
    });

    if (existingByAccount) {
      const user = await this.prisma.user.update({
        data: {
          authProvider: 'google',
          displayName: profile.name,
          googleSub: profile.sub,
        },
        where: { id: existingByAccount.id },
      });

      return this.createAuthResponse(user);
    }

    const user = await this.prisma.user.create({
      data: {
        account,
        authProvider: 'google',
        displayName: profile.name,
        googleSub: profile.sub,
        passwordHash: null,
      },
    });

    return this.createAuthResponse(user);
  }

  async loginDemo(): Promise<AuthResponse> {
    const account = 'creator@rednote.local';
    const user = await this.prisma.user.upsert({
      create: {
        account,
        displayName: '内容创作者',
        passwordHash: await argon2.hash('rednote-demo-password'),
      },
      update: {
        displayName: '内容创作者',
      },
      where: { account },
    });

    return this.createAuthResponse(user);
  }

  async getProfile(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    return this.toPublicUser(user);
  }

  private createAuthResponse(user: User): AuthResponse {
    const payload: JwtPayload = {
      account: user.account,
      name: user.displayName,
      sub: user.id,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: this.toPublicUser(user),
    };
  }

  private normalizeAccount(account: string): string {
    return account.trim().toLowerCase();
  }

  private toPublicUser(user: User): PublicUser {
    return {
      account: user.account,
      id: user.id,
      loginAt: new Date().toISOString(),
      name: user.displayName,
    };
  }
}
