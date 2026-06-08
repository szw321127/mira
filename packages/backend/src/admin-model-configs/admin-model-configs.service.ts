import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateAdminModelConfigDto } from './dto/update-admin-model-config.dto';
import {
  adminModelConfigTypes,
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

@Injectable()
export class AdminModelConfigsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async list(): Promise<AdminModelConfigView[]> {
    const configs = await this.prisma.adminModelConfig.findMany();
    const byType = new Map(configs.map((config) => [config.type, config]));

    return adminModelConfigTypes.map((type) =>
      this.toView(type, byType.get(type) ?? null),
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

    return this.toView(modelType, saved);
  }

  async getRuntimeConfig(type: string): Promise<AdminModelRuntimeConfig> {
    const modelType = this.parseType(type);
    const config = await this.prisma.adminModelConfig.findUnique({
      where: { type: modelType },
    });
    const apiKey = config?.apiKeyEncrypted
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

  private parseType(type: string): AdminModelConfigType {
    if (adminModelConfigTypes.includes(type as AdminModelConfigType)) {
      return type as AdminModelConfigType;
    }

    throw new BadRequestException('Unknown model config type.');
  }

  private toView(
    type: AdminModelConfigType,
    config: StoredModelConfig | null,
  ): AdminModelConfigView {
    if (!config) {
      return {
        apiKeyPreview: null,
        baseUrl: '',
        hasApiKey: false,
        modelName: '',
        type,
        updatedAt: null,
      };
    }

    return {
      apiKeyPreview: config.apiKeyEncrypted
        ? this.previewApiKey(config.apiKeyEncrypted)
        : null,
      baseUrl: config.baseUrl,
      hasApiKey: Boolean(config.apiKeyEncrypted),
      modelName: config.modelName,
      type,
      updatedAt: config.updatedAt,
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
