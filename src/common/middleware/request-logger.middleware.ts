import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { LoggerService } from '@logger/logger.service';
import { APP_CONSTANTS } from '../constants/app.constants';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  constructor(private readonly logger: LoggerService) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const correlationId = req.headers[APP_CONSTANTS.CORRELATION_ID_HEADER] as string;
    this.logger.logWithCorrelationId(
      'debug',
      `Incoming ${req.method} ${req.originalUrl} from ${req.ip}`,
      correlationId,
      'Request',
    );
    next();
  }
}
