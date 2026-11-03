import { Reflector } from '@nestjs/core';
import { AccountType } from '@users/enums/account-type.enum';
import { AccountTypesGuard } from './account-types.guard';

describe('AccountTypesGuard', () => {
  const reflector = {
    getAllAndOverride: jest.fn(),
  };
  let guard: AccountTypesGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    reflector.getAllAndOverride.mockReturnValue([AccountType.SELLER]);
    guard = new AccountTypesGuard(reflector as unknown as Reflector);
  });

  const contextFor = (user: Record<string, unknown>) =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as any;

  it('grants seller access from the role list while preserving the buyer primary type', () => {
    expect(
      guard.canActivate(
        contextFor({
          accountType: AccountType.BUYER,
          accountTypes: [AccountType.BUYER, AccountType.SELLER],
        }),
      ),
    ).toBe(true);
  });

  it('falls back to the legacy primary accountType when the role list is absent', () => {
    expect(guard.canActivate(contextFor({ accountType: AccountType.SELLER }))).toBe(true);
  });

  it('denies access when the requested role is not granted', () => {
    expect(
      guard.canActivate(
        contextFor({ accountType: AccountType.BUYER, accountTypes: [AccountType.BUYER] }),
      ),
    ).toBe(false);
  });
});
