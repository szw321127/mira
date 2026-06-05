import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';
import { isJsonRecord } from './json';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    response.status(status).json({
      code: status,
      data: null,
      msg: this.getMessage(exception),
    });
  }

  private getMessage(exception: unknown): string {
    if (!(exception instanceof HttpException)) {
      return 'Internal server error.';
    }

    const exceptionResponse: unknown = exception.getResponse();

    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }

    if (isJsonRecord(exceptionResponse)) {
      const message = exceptionResponse.message;

      if (Array.isArray(message)) {
        return message
          .filter((item): item is string => typeof item === 'string')
          .join('; ');
      }

      if (typeof message === 'string') {
        return message;
      }

      if (typeof exceptionResponse.error === 'string') {
        return exceptionResponse.error;
      }
    }

    return exception.message;
  }
}
