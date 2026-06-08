import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';

type RequestWithHeaders = {
  headers: Record<string, string | string[] | undefined>;
};

@Injectable()
export class AdminApiKeyGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const configuredKey = this.configService
      .get<string>('ADMIN_API_KEY')
      ?.trim();

    if (!configuredKey) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithHeaders>();
    const providedKey = this.readHeader(request.headers['x-admin-api-key']);

    if (!providedKey || !this.isSameSecret(configuredKey, providedKey)) {
      throw new UnauthorizedException('Invalid admin API key.');
    }

    return true;
  }

  private readHeader(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
  }

  private isSameSecret(expected: string, actual: string) {
    const expectedHash = this.hashSecret(expected);
    const actualHash = this.hashSecret(actual);

    return timingSafeEqual(expectedHash, actualHash);
  }

  private hashSecret(secret: string) {
    return createHash('sha256').update(secret).digest();
  }
}
