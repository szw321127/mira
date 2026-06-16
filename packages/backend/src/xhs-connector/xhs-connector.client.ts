import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isRecord } from '../model-provider/openai-compatible';
import type {
  XhsConnectorAccount,
  XhsConnectorPost,
} from '../xhs-authorizations/xhs-authorizations.types';

type ConnectorEnvelope = {
  data?: unknown;
  error?: { message?: unknown };
  message?: unknown;
};

@Injectable()
export class XhsConnectorClient {
  constructor(private readonly configService: ConfigService) {}

  async validateCookie(input: {
    cookie: string;
    userId: string;
  }): Promise<{ account: XhsConnectorAccount | null; valid: boolean }> {
    const payload = await this.post('/xhs/auth/validate', input);
    const data = this.unwrapData(payload);

    if (!isRecord(data)) {
      throw new BadRequestException('小红书连接器响应格式无效。');
    }

    return {
      account: isRecord(data.account) ? data.account : null,
      valid: data.valid === true,
    };
  }

  async searchPosts(input: {
    authorizationId: string;
    cookie: string;
    keyword: string;
    limit: number;
    sort: 'popular';
  }): Promise<XhsConnectorPost[]> {
    const payload = await this.post('/xhs/posts/search', input);
    const data = this.unwrapData(payload);
    const records = isRecord(data) ? data.posts : Array.isArray(data) ? data : null;

    if (!Array.isArray(records)) {
      throw new BadRequestException('小红书连接器搜索响应格式无效。');
    }

    return records.filter(isRecord);
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const { apiKey, baseUrl } = this.getConnectorConfig();

    if (!baseUrl || !apiKey) {
      throw new BadRequestException('请先配置小红书连接器服务。');
    }

    let response: Response;

    try {
      response = await fetch(
        `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`,
        {
          body: JSON.stringify(body),
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
        },
      );
    } catch {
      throw new BadRequestException(
        '小红书连接器服务不可用，请确认已启动 pnpm dev:connector。',
      );
    }

    const payload: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      throw new BadRequestException(this.getErrorMessage(payload));
    }

    return payload;
  }

  private getConnectorConfig() {
    const configuredBaseUrl = this.configService
      .get<string>('XHS_CONNECTOR_BASE_URL')
      ?.trim();
    const configuredApiKey = this.configService
      .get<string>('XHS_CONNECTOR_API_KEY')
      ?.trim();

    if (configuredBaseUrl || configuredApiKey) {
      return {
        apiKey: configuredApiKey,
        baseUrl: configuredBaseUrl,
      };
    }

    if (process.env.NODE_ENV === 'development') {
      return {
        apiKey: 'rednote-local-xhs-connector-key',
        baseUrl: 'http://localhost:8800',
      };
    }

    return { apiKey: configuredApiKey, baseUrl: configuredBaseUrl };
  }

  private unwrapData(payload: unknown): unknown {
    if (!isRecord(payload)) return payload;
    return 'data' in payload ? payload.data : payload;
  }

  private getErrorMessage(payload: unknown) {
    if (!isRecord(payload)) return '小红书连接器请求失败。';
    const body = payload as ConnectorEnvelope;
    const nested = body.error?.message;

    if (typeof nested === 'string' && nested.trim()) return nested;
    if (typeof body.message === 'string' && body.message.trim()) return body.message;

    return '小红书连接器请求失败。';
  }
}
