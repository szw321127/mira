import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type {
  AdminAuthenticatedRequest,
  AuthenticatedAdmin,
} from './admin-auth.types';

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedAdmin => {
    const request = context
      .switchToHttp()
      .getRequest<AdminAuthenticatedRequest>();

    return request.admin as AuthenticatedAdmin;
  },
);
