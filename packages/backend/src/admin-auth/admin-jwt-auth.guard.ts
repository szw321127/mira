import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type {
  AdminAuthenticatedRequest,
  AdminJwtPayload,
} from './admin-auth.types';

function isAdminJwtPayload(value: unknown): value is AdminJwtPayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const payload = value as Record<string, unknown>;

  return (
    payload.scope === 'admin' &&
    typeof payload.sub === 'string' &&
    typeof payload.account === 'string' &&
    typeof payload.displayName === 'string'
  );
}

@Injectable()
export class AdminJwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<AdminAuthenticatedRequest>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token.');
    }

    let payload: unknown;
    try {
      payload = await this.jwtService.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Invalid bearer token.');
    }

    if (!isAdminJwtPayload(payload)) {
      throw new UnauthorizedException('Invalid administrator token.');
    }

    request.admin = {
      account: payload.account,
      displayName: payload.displayName,
      id: payload.sub,
    };

    return true;
  }

  private extractToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];

    return type === 'Bearer' ? token : undefined;
  }
}
