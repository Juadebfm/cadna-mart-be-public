import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request } from 'express';
import { LoggerService } from '@logger/logger.service';
import { APP_CONSTANTS } from '../constants/app.constants';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: LoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url } = request;
    const correlationId = request.headers[APP_CONSTANTS.CORRELATION_ID_HEADER] as string;
    const now = Date.now();

    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse();
        const duration = Date.now() - now;
        this.logger.logWithCorrelationId(
          'info',
          `${method} ${url} ${response.statusCode} - ${duration}ms`,
          correlationId,
          'HTTP',
        );
      }),
    );
  }
}
