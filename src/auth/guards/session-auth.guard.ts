import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { ERROR_MESSAGES } from '@common/constants/error-messages.constants';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (!request.isAuthenticated || !request.isAuthenticated()) {
      throw new UnauthorizedException(ERROR_MESSAGES.SESSION_EXPIRED);
    }

    return true;
  }
}
