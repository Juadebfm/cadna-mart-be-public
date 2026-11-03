import { ExceptionFilter, Catch, ArgumentsHost, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '../../generated/prisma/client';
import { APP_CONSTANTS } from '../constants/app.constants';
import { ERROR_MESSAGES } from '../constants/error-messages.constants';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PostgresExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const correlationId = request.headers[APP_CONSTANTS.CORRELATION_ID_HEADER] as string;

    const isDuplicate = exception.code === 'P2002';
    const status = isDuplicate ? HttpStatus.CONFLICT : HttpStatus.INTERNAL_SERVER_ERROR;
    const message = isDuplicate
      ? ERROR_MESSAGES.DUPLICATE_ENTRY
      : ERROR_MESSAGES.INTERNAL_SERVER_ERROR;

    response.status(status).json({
      success: false,
      statusCode: status,
      error: HttpStatus[status],
      message,
      meta: {
        timestamp: new Date().toISOString(),
        correlationId,
        path: request.url,
      },
    });
  }
}
