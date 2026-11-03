import { AccountType } from '@users/enums/account-type.enum';

export interface AccountTypePrincipal {
  accountType?: string;
  accountTypes?: string[];
}

export function hasAccountType(
  principal: AccountTypePrincipal | null | undefined,
  required: AccountType,
): boolean {
  if (Array.isArray(principal?.accountTypes)) {
    return principal.accountTypes.includes(required);
  }
  return principal?.accountType === required;
}
