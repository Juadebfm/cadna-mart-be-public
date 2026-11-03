import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { LoggerService } from '@logger/logger.service';
import { BusinessException } from '../exceptions/business-exception';
import { APP_CONSTANTS } from '../constants/app.constants';
import { ERROR_MESSAGES } from '../constants/error-messages.constants';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const correlationId = request.headers[APP_CONSTANTS.CORRELATION_ID_HEADER] as string;

    const { status, message, error, details, errorCode } = this.extractError(exception);

    this.logger.logWithCorrelationId(
      'error',
      `${request.method} ${request.url} ${status} - ${message}`,
      correlationId,
      'ExceptionFilter',
    );

    response.status(status).json({
      success: false,
      statusCode: status,
      error,
      message,
      ...(errorCode && { errorCode }),
      ...(details && { details }),
      meta: {
        timestamp: new Date().toISOString(),
        correlationId,
        path: request.url,
      },
    });
  }

  private extractError(exception: unknown): {
    status: number;
    message: string;
    error: string;
    details?: unknown[];
    errorCode?: string;
  } {
    if (exception instanceof BusinessException) {
      return {
        status: exception.getStatus(),
        message: exception.message,
        error: HttpStatus[exception.getStatus()] || 'Error',
        errorCode: exception.errorCode,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        return {
          status,
          message: (resp.message as string) || exception.message,
          error: (resp.error as string) || HttpStatus[status] || 'Error',
          details: Array.isArray(resp.message) ? (resp.message as unknown[]) : undefined,
        };
      }

      return {
        status,
        message: exception.message,
        error: HttpStatus[status] || 'Error',
      };
    }

    if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack, 'UnhandledException');
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
    };
  }
}
