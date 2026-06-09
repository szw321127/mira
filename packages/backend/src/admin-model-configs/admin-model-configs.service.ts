import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { AdminAuditLogsService } from '../admin-audit-logs/admin-audit-logs.service';
import {
  createProviderEndpoint,
  extractChatContent,
  isRecord,
  postProviderJson,
} from '../model-provider/openai-compatible';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateAdminModelConfigDto } from './dto/update-admin-model-config.dto';
import type { CreateAdminModelApiKeyDto } from './dto/create-admin-model-api-key.dto';
import type { UpdateAdminModelApiKeyDto } from './dto/update-admin-model-api-key.dto';
import {
  adminModelConfigTypes,
  type AdminModelApiKeyView,
  type AdminModelConnectionTestResult,
  type AdminModelRuntimeConfig,
  type AdminModelConfigType,
  type AdminModelConfigView,
} from './admin-model-configs.types';

type StoredModelConfig = {
  apiKeyEncrypted: string | null;
  baseUrl: string;
  modelName: string;
  type: string;
  updatedAt: Date;
};

type StoredModelApiKey = {
  apiKeyEncrypted: string;
  createdAt: Date;
  enabled: boolean;
  id: string;
  name: string;
  type: string;
  updatedAt: Date;
};

@Injectable()
export class AdminModelConfigsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly auditLogs: AdminAuditLogsService,
  ) {}

  async list(): Promise<AdminModelConfigView[]> {
    const [configs, apiKeys] = await Promise.all([
      this.prisma.adminModelConfig.findMany(),
      this.prisma.adminModelApiKey.findMany({
        orderBy: [{ type: 'asc' }, { createdAt: 'asc' }],
      }),
    ]);
    const byType = new Map(configs.map((config) => [config.type, config]));
    const keysByType = new Map<AdminModelConfigType, StoredModelApiKey[]>();

    apiKeys.forEach((apiKey) => {
      const keyType = this.parseType(apiKey.type);
      keysByType.set(keyType, [...(keysByType.get(keyType) ?? []), apiKey]);
    });

    return adminModelConfigTypes.map((type) =>
      this.toView(type, byType.get(type) ?? null, keysByType.get(type) ?? []),
    );
  }

  async save(
    type: string,
    dto: UpdateAdminModelConfigDto,
  ): Promise<AdminModelConfigView> {
    const modelType = this.parseType(type);
    const baseUrl = dto.baseUrl.trim();
    const modelName = dto.modelName.trim();

    if (!baseUrl || !modelName) {
      throw new BadRequestException('baseUrl and modelName are required.');
    }

    const existing = await this.prisma.adminModelConfig.findUnique({
      where: { type: modelType },
    });
    const nextApiKey = dto.apiKey?.trim();
    const apiKeyEncrypted = nextApiKey
      ? this.encrypt(nextApiKey)
      : (existing?.apiKeyEncrypted ?? null);

    const saved = await this.prisma.adminModelConfig.upsert({
      create: {
        apiKeyEncrypted,
        baseUrl,
        modelName,
        type: modelType,
      },
      update: {
        apiKeyEncrypted,
        baseUrl,
        modelName,
      },
      where: { type: modelType },
    });
    const apiKeys = await this.prisma.adminModelApiKey.findMany({
      orderBy: { createdAt: 'asc' },
      where: { type: modelType },
    });
    const view = this.toView(modelType, saved, apiKeys);

    await this.auditLogs.record({
      action: 'model_config.saved',
      metadata: {
        apiKeyUpdated: Boolean(nextApiKey),
        baseUrl: view.baseUrl,
        hasApiKey: view.hasApiKey,
        modelName: view.modelName,
      },
      targetKey: modelType,
      targetType: 'model_config',
    });

    return view;
  }

  async addApiKey(
    type: string,
    dto: CreateAdminModelApiKeyDto,
  ): Promise<AdminModelApiKeyView> {
    const modelType = this.parseType(type);
    const name = dto.name.trim();
    const apiKey = dto.apiKey.trim();

    if (!name || !apiKey) {
      throw new BadRequestException('name and apiKey are required.');
    }

    const created = await this.prisma.adminModelApiKey.create({
      data: {
        apiKeyEncrypted: this.encrypt(apiKey),
        enabled: dto.enabled ?? true,
        name,
        type: modelType,
      },
    });
    const view = this.toApiKeyView(created);

    await this.auditLogs.record({
      action: 'model_config.api_key_created',
      metadata: {
        enabled: view.enabled,
        name: view.name,
      },
      targetKey: modelType,
      targetType: 'model_config',
    });

    return view;
  }

  async updateApiKey(
    type: string,
    keyId: string,
    dto: UpdateAdminModelApiKeyDto,
  ): Promise<AdminModelApiKeyView> {
    const modelType = this.parseType(type);
    await this.ensureApiKeyBelongsToType(modelType, keyId);

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

    const updated = await this.prisma.adminModelApiKey.update({
      data,
      where: { id: keyId },
    });
    const view = this.toApiKeyView(updated);

    await this.auditLogs.record({
      action: 'model_config.api_key_updated',
      metadata: {
        enabled: view.enabled,
        keyId,
        name: view.name,
        rotated: Boolean(nextApiKey),
      },
      targetKey: modelType,
      targetType: 'model_config',
    });

    return view;
  }

  async deleteApiKey(
    type: string,
    keyId: string,
  ): Promise<AdminModelApiKeyView> {
    const modelType = this.parseType(type);
    await this.ensureApiKeyBelongsToType(modelType, keyId);
    const deleted = await this.prisma.adminModelApiKey.delete({
      where: { id: keyId },
    });
    const view = this.toApiKeyView(deleted);

    await this.auditLogs.record({
      action: 'model_config.api_key_deleted',
      metadata: {
        keyId,
        name: view.name,
      },
      targetKey: modelType,
      targetType: 'model_config',
    });

    return view;
  }

  async getRuntimeConfig(type: string): Promise<AdminModelRuntimeConfig> {
    const modelType = this.parseType(type);
    const [config, enabledKey, apiKeys] = await Promise.all([
      this.prisma.adminModelConfig.findUnique({
        where: { type: modelType },
      }),
      this.prisma.adminModelApiKey.findFirst({
        orderBy: { createdAt: 'asc' },
        where: { enabled: true, type: modelType },
      }),
      this.prisma.adminModelApiKey.findMany({
        where: { type: modelType },
      }),
    ]);
    const apiKey = enabledKey?.apiKeyEncrypted
      ? this.decrypt(enabledKey.apiKeyEncrypted)
      : apiKeys.length === 0 && config?.apiKeyEncrypted
        ? this.decrypt(config.apiKeyEncrypted)
        : null;

    if (!config?.baseUrl?.trim() || !config.modelName.trim() || !apiKey) {
      throw new BadRequestException(
        modelType === 'text'
          ? '请先在后台配置文本模型。'
          : '请先在后台配置图片模型。',
      );
    }

    return {
      apiKey,
      baseUrl: config.baseUrl.trim(),
      modelName: config.modelName.trim(),
      type: modelType,
    };
  }

  async testConnection(type: string): Promise<AdminModelConnectionTestResult> {
    const config = await this.getRuntimeConfig(type);
    const endpoint =
      config.type === 'text'
        ? await this.testTextConnection(config)
        : await this.testImageConnection(config);
    await this.auditLogs.record({
      action: 'model_config.connection_tested',
      metadata: {
        endpoint,
        modelName: config.modelName,
      },
      targetKey: config.type,
      targetType: 'model_config',
    });

    return {
      checkedAt: new Date().toISOString(),
      endpoint,
      modelName: config.modelName,
      ok: true,
      type: config.type,
    };
  }

  private async testTextConnection(
    config: AdminModelRuntimeConfig,
  ): Promise<string> {
    const endpoint = createProviderEndpoint(config.baseUrl, 'chat/completions');
    const payload = await postProviderJson(endpoint, config.apiKey, {
      max_tokens: 8,
      messages: [
        {
          content: '只回复 ok，用于后台测试模型连接。',
          role: 'user',
        },
      ],
      model: config.modelName,
      temperature: 0,
    });

    extractChatContent(payload);

    return endpoint;
  }

  private async testImageConnection(
    config: AdminModelRuntimeConfig,
  ): Promise<string> {
    const endpoint = createProviderEndpoint(
      config.baseUrl,
      'images/generations',
    );
    const payload = await postProviderJson(endpoint, config.apiKey, {
      model: config.modelName,
      prompt: '小红书封面图测试连接，简单红色圆形图标。',
      response_format: 'b64_json',
      size: '1024x1024',
    });

    if (!isRecord(payload) || !Array.isArray(payload.data)) {
      throw new BadRequestException('图片模型响应格式无效。');
    }

    return endpoint;
  }

  private parseType(type: string): AdminModelConfigType {
    if (adminModelConfigTypes.includes(type as AdminModelConfigType)) {
      return type as AdminModelConfigType;
    }

    throw new BadRequestException('Unknown model config type.');
  }

  private toView(
    type: AdminModelConfigType,
    config: StoredModelConfig | null,
    apiKeys: StoredModelApiKey[],
  ): AdminModelConfigView {
    const apiKeyViews = apiKeys.map((apiKey) => this.toApiKeyView(apiKey));
    const firstKeyPreview =
      apiKeyViews.find((apiKey) => apiKey.enabled)?.apiKeyPreview ??
      apiKeyViews[0]?.apiKeyPreview ??
      null;

    if (!config) {
      return {
        apiKeyPreview: firstKeyPreview,
        apiKeys: apiKeyViews,
        baseUrl: '',
        hasApiKey: apiKeyViews.length > 0,
        modelName: '',
        type,
        updatedAt: null,
      };
    }

    return {
      apiKeyPreview: config.apiKeyEncrypted
        ? this.previewApiKey(config.apiKeyEncrypted)
        : firstKeyPreview,
      apiKeys: apiKeyViews,
      baseUrl: config.baseUrl,
      hasApiKey: Boolean(config.apiKeyEncrypted) || apiKeyViews.length > 0,
      modelName: config.modelName,
      type,
      updatedAt: config.updatedAt,
    };
  }

  private toApiKeyView(apiKey: StoredModelApiKey): AdminModelApiKeyView {
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
    type: AdminModelConfigType,
    keyId: string,
  ) {
    const apiKey = await this.prisma.adminModelApiKey.findFirst({
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
      .get<string>('MODEL_CONFIG_SECRET')
      ?.trim();

    if (!secret && process.env.NODE_ENV === 'production') {
      throw new BadRequestException('MODEL_CONFIG_SECRET is required.');
    }

    return createHash('sha256')
      .update(secret || 'rednote-dev-model-config-secret')
      .digest();
  }
}
