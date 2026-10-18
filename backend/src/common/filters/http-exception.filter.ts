import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiError } from '@app/shared';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'node:http';
import { Prisma } from '../../generated/prisma/client.js';
import { uniqueViolationFields } from '../prisma-errors.js';
import { REQUEST_ID_HEADER } from '../middleware/request-id.middleware.js';

/** Renders every error as the shared ApiError shape. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();
    const { statusCode, message } = this.resolve(exception);

    if (statusCode >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }

    const body: ApiError = {
      statusCode,
      error: STATUS_CODES[statusCode] ?? 'Error',
      message,
      requestId: req.header(REQUEST_ID_HEADER),
    };
    res.status(statusCode).json(body);
  }

  private resolve(exception: unknown): { statusCode: number; message: string | string[] } {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const message =
        typeof response === 'object' && response !== null && 'message' in response
          ? (response.message as string | string[])
          : exception.message;
      return { statusCode: exception.getStatus(), message };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        const fields = uniqueViolationFields(exception.meta);
        return {
          statusCode: HttpStatus.CONFLICT,
          message: fields.length ? `${fields.join(', ')} already in use` : 'Already exists',
        };
      }
      if (exception.code === 'P2025') {
        return { statusCode: HttpStatus.NOT_FOUND, message: 'Not found' };
      }
    }
    return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' };
  }
}
