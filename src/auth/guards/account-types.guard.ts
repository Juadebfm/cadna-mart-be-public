import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ACCOUNT_TYPES_KEY } from '../decorators/account-types.decorator';
import { AccountType } from '@users/enums/account-type.enum';
import { hasAccountType } from '../utils/account-types.util';

@Injectable()
export class AccountTypesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredTypes = this.reflector.getAllAndOverride<AccountType[]>(ACCOUNT_TYPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredTypes) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest();
    return requiredTypes.some((type) => hasAccountType(user, type));
  }
}
