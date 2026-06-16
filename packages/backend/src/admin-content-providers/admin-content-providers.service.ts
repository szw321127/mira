import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { AdminAuditLogsService } from '../admin-audit-logs/admin-audit-logs.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateAdminContentProviderApiKeyDto } from './dto/create-admin-content-provider-api-key.dto';
import type { UpdateAdminContentProviderApiKeyDto } from './dto/update-admin-content-provider-api-key.dto';
import type { UpdateAdminContentProviderDto } from './dto/update-admin-content-provider.dto';
import {
  adminContentProviderDefaults,
  adminContentProviderTypes,
  type AdminContentProviderApiKeyView,
  type AdminContentProviderConfigView,
  type AdminContentProviderRuntimeConfig,
  type AdminContentProviderType,
} from './admin-content-providers.types';

type StoredContentProviderConfig = {
  baseUrl: string;
  complianceNote: string | null;
  enabled: boolean;
  name: string;
  rateLimitPerMinute: number | null;
  type: string;
  updatedAt: Date;
};

type StoredContentProviderApiKey = {
  apiKeyEncrypted: string;
  createdAt: Date;
  enabled: boolean;
  id: string;
  name: string;
  type: string;
  updatedAt: Date;
};

@Injectable()
export class AdminContentProvidersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly auditLogs: AdminAuditLogsService,
  ) {}

  async list(): Promise<AdminContentProviderConfigView[]> {
    const [configs, apiKeys] = await Promise.all([
      this.prisma.adminContentProviderConfig.findMany(),
      this.prisma.adminContentProviderApiKey.findMany({
        orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);
    const byType = new Map(configs.map((config) => [config.type, config]));
    const keysByType = new Map<
      AdminContentProviderType,
      StoredContentProviderApiKey[]
    >();

    apiKeys.forEach((apiKey) => {
      const providerType = this.parseType(apiKey.type);
      keysByType.set(providerType, [
        ...(keysByType.get(providerType) ?? []),
        apiKey,
      ]);
    });

    return adminContentProviderTypes.map((type) =>
      this.toView(type, byType.get(type) ?? null, keysByType.get(type) ?? []),
    );
  }

  async save(
    type: string,
    dto: UpdateAdminContentProviderDto,
  ): Promise<AdminContentProviderConfigView> {
    const providerType = this.parseType(type);
    const name = dto.name.trim();
    const baseUrl = dto.baseUrl.trim();
    const complianceNote = dto.complianceNote?.trim() ?? '';
    const rateLimitPerMinute = dto.rateLimitPerMinute ?? null;

    if (!name || !baseUrl) {
      throw new BadRequestException('name and baseUrl are required.');
    }

    const saved = await this.prisma.adminContentProviderConfig.upsert({
      create: {
        baseUrl,
        complianceNote,
        enabled: dto.enabled,
        name,
        rateLimitPerMinute,
        type: providerType,
      },
      update: {
        baseUrl,
        complianceNote,
        enabled: dto.enabled,
        name,
        rateLimitPerMinute,
      },
      where: { type: providerType },
    });
    const apiKeys = await this.prisma.adminContentProviderApiKey.findMany({
      orderBy: { createdAt: 'asc' },
      where: { type: providerType },
    });
    const view = this.toView(providerType, saved, apiKeys);

    await this.auditLogs.record({
      action: 'content_provider.saved',
      metadata: {
        baseUrl: view.baseUrl,
        enabled: view.enabled,
        name: view.name,
        rateLimitPerMinute: view.rateLimitPerMinute,
      },
      targetKey: providerType,
      targetType: 'content_provider',
    });

    return view;
  }

  async addApiKey(
    type: string,
    dto: CreateAdminContentProviderApiKeyDto,
  ): Promise<AdminContentProviderApiKeyView> {
    const providerType = this.parseType(type);
    const name = dto.name.trim();
    const apiKey = dto.apiKey.trim();

    if (!name || !apiKey) {
      throw new BadRequestException('name and apiKey are required.');
    }

    const created = await this.prisma.adminContentProviderApiKey.create({
      data: {
        apiKeyEncrypted: this.encrypt(apiKey),
        enabled: dto.enabled ?? true,
        name,
        type: providerType,
      },
    });
    const view = this.toApiKeyView(created);

    await this.auditLogs.record({
      action: 'content_provider.api_key_created',
      metadata: {
        enabled: view.enabled,
        name: view.name,
      },
      targetKey: providerType,
      targetType: 'content_provider',
    });

    return view;
  }

  async updateApiKey(
    type: string,
    keyId: string,
    dto: UpdateAdminContentProviderApiKeyDto,
  ): Promise<AdminContentProviderApiKeyView> {
    const providerType = this.parseType(type);
    await this.ensureApiKeyBelongsToType(providerType, keyId);

    const data: {
      apiKeyEncrypted?: string;
      enabled?: boolean;
      name?: string;
    } = {};
    const nextName = dto.name?.trim();
    const nextApiKey = dto.apiKey?.trim();

    if (dto.name !== undefined) {
      if (!nextName) {
        throw new BadRequestException('name is required.');
      }
      data.name = nextName;
    }

    if (dto.apiKey !== undefined) {
      if (!nextApiKey) {
        throw new BadRequestException('apiKey is required.');
      }
      data.apiKeyEncrypted = this.encrypt(nextApiKey);
    }

    if (dto.enabled !== undefined) {
      data.enabled = dto.enabled;
    }

    const updated = await this.prisma.adminContentProviderApiKey.update({
      data,
      where: { id: keyId },
    });
    const view = this.toApiKeyView(updated);

    await this.auditLogs.record({
      action: 'content_provider.api_key_updated',
      metadata: {
        enabled: view.enabled,
        keyId,
        name: view.name,
        rotated: Boolean(nextApiKey),
      },
      targetKey: providerType,
      targetType: 'content_provider',
    });

    return view;
  }

  async deleteApiKey(
    type: string,
    keyId: string,
  ): Promise<AdminContentProviderApiKeyView> {
    const providerType = this.parseType(type);
    await this.ensureApiKeyBelongsToType(providerType, keyId);
    const deleted = await this.prisma.adminContentProviderApiKey.delete({
      where: { id: keyId },
    });
    const view = this.toApiKeyView(deleted);

    await this.auditLogs.record({
      action: 'content_provider.api_key_deleted',
      metadata: {
        keyId,
        name: view.name,
      },
      targetKey: providerType,
      targetType: 'content_provider',
    });

    return view;
  }

  async getRuntimeConfig(
    type: string,
  ): Promise<AdminContentProviderRuntimeConfig> {
    const providerType = this.parseType(type);
    const [config, enabledKey] = await Promise.all([
      this.prisma.adminContentProviderConfig.findUnique({
        where: { type: providerType },
      }),
      this.prisma.adminContentProviderApiKey.findFirst({
        orderBy: { createdAt: 'asc' },
        where: { enabled: true, type: providerType },
      }),
    ]);
    const apiKey = enabledKey?.apiKeyEncrypted
      ? this.decrypt(enabledKey.apiKeyEncrypted)
      : null;

    if (!config?.enabled || !config.baseUrl.trim() || !apiKey) {
      throw new BadRequestException('请先在后台配置内容采集服务。');
    }

    return {
      apiKey,
      baseUrl: config.baseUrl.trim(),
      complianceNote: config.complianceNote ?? '',
      enabled: config.enabled,
      rateLimitPerMinute: config.rateLimitPerMinute,
      type: providerType,
    };
  }

  async getFirstAvailableRuntimeConfig(
    types: string[],
  ): Promise<AdminContentProviderRuntimeConfig | null> {
    for (const type of types) {
      try {
        return await this.getRuntimeConfig(type);
      } catch (error) {
        if (error instanceof BadRequestException) {
          continue;
        }

        throw error;
      }
    }

    return null;
  }

  private parseType(type: string): AdminContentProviderType {
    if (adminContentProviderTypes.includes(type as AdminContentProviderType)) {
      return type as AdminContentProviderType;
    }

    throw new BadRequestException('Unknown content provider type.');
  }

  private toView(
    type: AdminContentProviderType,
    config: StoredContentProviderConfig | null,
    apiKeys: StoredContentProviderApiKey[],
  ): AdminContentProviderConfigView {
    const defaults = adminContentProviderDefaults[type];
    const apiKeyViews = apiKeys.map((apiKey) => this.toApiKeyView(apiKey));
    const firstKeyPreview =
      apiKeyViews.find((apiKey) => apiKey.enabled)?.apiKeyPreview ??
      apiKeyViews[0]?.apiKeyPreview ??
      null;

    if (!config) {
      return {
        apiKeyPreview: firstKeyPreview,
        apiKeys: apiKeyViews,
        baseUrl: defaults.baseUrl,
        complianceNote: defaults.complianceNote,
        enabled: false,
        hasApiKey: apiKeyViews.length > 0,
        name: defaults.name,
        rateLimitPerMinute: null,
        type,
        updatedAt: null,
      };
    }

    return {
      apiKeyPreview: firstKeyPreview,
      apiKeys: apiKeyViews,
      baseUrl: config.baseUrl,
      complianceNote: config.complianceNote ?? '',
      enabled: config.enabled,
      hasApiKey: apiKeyViews.length > 0,
      name: config.name,
      rateLimitPerMinute: config.rateLimitPerMinute,
      type,
      updatedAt: config.updatedAt,
    };
  }

  private toApiKeyView(
    apiKey: StoredContentProviderApiKey,
  ): AdminContentProviderApiKeyView {
    return {
      apiKeyPreview: this.previewApiKey(apiKey.apiKeyEncrypted),
      createdAt: apiKey.createdAt,
      enabled: apiKey.enabled,
      id: apiKey.id,
      name: apiKey.name,
      type: this.parseType(apiKey.type),
      updatedAt: apiKey.updatedAt,
    };
  }

  private async ensureApiKeyBelongsToType(
    type: AdminContentProviderType,
    keyId: string,
  ) {
    const apiKey = await this.prisma.adminContentProviderApiKey.findFirst({
      where: { id: keyId, type },
    });

    if (!apiKey) {
      throw new BadRequestException('API Key not found.');
    }
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

    if (version !== 'v1' || !iv || !tag || !encrypted) {
      return null;
    }

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

  private previewApiKey(encrypted: string): string | null {
    const apiKey = this.decrypt(encrypted);

    if (!apiKey) {
      return null;
    }

    return `${'*'.repeat(16)}${apiKey.slice(-4)}`;
  }

  private getKey(): Buffer {
    const secret = this.configService
      .get<string>('CONTENT_PROVIDER_SECRET')
      ?.trim();

    if (!secret && process.env.NODE_ENV === 'production') {
      throw new BadRequestException('CONTENT_PROVIDER_SECRET is required.');
    }

    return createHash('sha256')
      .update(secret || 'rednote-dev-content-provider-secret')
      .digest();
  }
}
