import { ExceptionFilter, Catch, ArgumentsHost, HttpException } from '@nestjs/common';
import { Request, Response } from 'express';
import { APP_CONSTANTS } from '../constants/app.constants';

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();
    const correlationId = request.headers[APP_CONSTANTS.CORRELATION_ID_HEADER] as string;

    const message =
      typeof exceptionResponse === 'object' && exceptionResponse !== null
        ? (exceptionResponse as Record<string, unknown>).message || exception.message
        : exception.message;

    const details =
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      Array.isArray((exceptionResponse as Record<string, unknown>).message)
        ? (exceptionResponse as Record<string, unknown>).message
        : undefined;

    response.status(status).json({
      success: false,
      statusCode: status,
      error: (exceptionResponse as Record<string, unknown>)?.error || exception.name,
      message,
      ...(details ? { details } : {}),
      meta: {
        timestamp: new Date().toISOString(),
        correlationId,
        path: request.url,
      },
    });
  }
}
