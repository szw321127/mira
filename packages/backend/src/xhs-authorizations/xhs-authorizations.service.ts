import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { XhsConnectorClient } from '../xhs-connector/xhs-connector.client';
import type { CreateXhsAuthorizationDto } from './dto/create-xhs-authorization.dto';
import type {
  XhsAuthorizationRuntime,
  XhsAuthorizationView,
} from './xhs-authorizations.types';

type StoredXhsAuthorization = {
  accountId: string | null;
  accountName: string | null;
  avatarUrl: string | null;
  cookieEncrypted: string;
  createdAt: Date;
  id: string;
  lastValidatedAt: Date | null;
  platform: string;
  status: string;
  subType: string;
  updatedAt: Date;
};

@Injectable()
export class XhsAuthorizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly connector: XhsConnectorClient,
  ) {}

  async createOrReplace(
    userId: string,
    dto: CreateXhsAuthorizationDto,
  ): Promise<XhsAuthorizationView> {
    const cookie = dto.cookie.trim();

    if (!cookie) {
      throw new BadRequestException('请粘贴小红书 PC Cookie。');
    }

    const validation = await this.connector.validateCookie({ cookie, userId });

    if (!validation.valid) {
      throw new BadRequestException('小红书授权无效，请重新粘贴 Cookie。');
    }

    await this.prisma.xhsAuthorization.updateMany({
      data: { status: 'deleted' },
      where: { platform: 'xhs', status: 'active', subType: 'pc', userId },
    });

    const account = validation.account ?? {};
    const created = await this.prisma.xhsAuthorization.create({
      data: {
        accountId:
          typeof account.user_id === 'string' ? account.user_id : null,
        accountName:
          typeof account.nickname === 'string' ? account.nickname : null,
        avatarUrl: typeof account.avatar === 'string' ? account.avatar : null,
        cookieEncrypted: this.encrypt(cookie),
        lastValidatedAt: new Date(),
        platform: 'xhs',
        status: 'active',
        subType: 'pc',
        userId,
      },
    });

    return this.toView(created);
  }

  async getCurrent(userId: string): Promise<XhsAuthorizationView | null> {
    const authorization = await this.prisma.xhsAuthorization.findFirst({
      orderBy: { updatedAt: 'desc' },
      where: { platform: 'xhs', status: 'active', subType: 'pc', userId },
    });

    return authorization ? this.toView(authorization) : null;
  }

  async getActiveRuntimeAuthorization(
    userId: string,
  ): Promise<XhsAuthorizationRuntime> {
    const authorization = await this.prisma.xhsAuthorization.findFirst({
      orderBy: { updatedAt: 'desc' },
      where: { platform: 'xhs', status: 'active', subType: 'pc', userId },
    });

    if (!authorization) {
      throw new BadRequestException('请先授权小红书账号，再生成爆款研究大纲。');
    }

    const cookie = this.decrypt(authorization.cookieEncrypted);

    if (!cookie) {
      throw new BadRequestException('小红书授权已失效，请重新授权。');
    }

    return { ...this.toView(authorization), cookie };
  }

  async delete(userId: string, authorizationId: string) {
    const authorization = await this.prisma.xhsAuthorization.findFirst({
      where: { id: authorizationId, userId },
    });

    if (!authorization) {
      throw new NotFoundException('小红书授权不存在或无权删除。');
    }

    const deleted = await this.prisma.xhsAuthorization.update({
      data: { status: 'deleted' },
      where: { id: authorizationId },
    });

    return this.toView(deleted);
  }

  private toView(row: StoredXhsAuthorization): XhsAuthorizationView {
    return {
      accountId: row.accountId,
      accountName: row.accountName,
      avatarUrl: row.avatarUrl,
      createdAt: row.createdAt,
      id: row.id,
      lastValidatedAt: row.lastValidatedAt,
      platform: 'xhs',
      status:
        row.status === 'deleted' ||
        row.status === 'expired' ||
        row.status === 'invalid'
          ? row.status
          : 'active',
      subType: 'pc',
      updatedAt: row.updatedAt,
    };
  }

  private encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.getKey(), iv);
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    return [
      'v1',
      iv.toString('base64url'),
      tag.toString('base64url'),
      encrypted.toString('base64url'),
    ].join(':');
  }

  private decrypt(payload: string): string | null {
    const [version, iv, tag, encrypted] = payload.split(':');

    if (version !== 'v1' || !iv || !tag || !encrypted) return null;

    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.getKey(),
        Buffer.from(iv, 'base64url'),
      );
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));

      return Buffer.concat([
        decipher.update(Buffer.from(encrypted, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      return null;
    }
  }

  private getKey(): Buffer {
    const secret = this.configService.get<string>('XHS_AUTH_SECRET')?.trim();

    if (!secret && process.env.NODE_ENV === 'production') {
      throw new BadRequestException('XHS_AUTH_SECRET is required.');
    }

    return createHash('sha256')
      .update(secret || 'rednote-dev-xhs-auth-secret')
      .digest();
  }
}
