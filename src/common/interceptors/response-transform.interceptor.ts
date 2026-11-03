import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Request } from 'express';
import { APP_CONSTANTS } from '../constants/app.constants';

@Injectable()
export class ResponseTransformInterceptor<T> implements NestInterceptor<T> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse();
    const correlationId = request.headers[APP_CONSTANTS.CORRELATION_ID_HEADER] as string;

    return next.handle().pipe(
      map((data) => ({
        success: true,
        statusCode: response.statusCode,
        data: data ?? null,
        meta: {
          timestamp: new Date().toISOString(),
          correlationId,
        },
      })),
    );
  }
}
