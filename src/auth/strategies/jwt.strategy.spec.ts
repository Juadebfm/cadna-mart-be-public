import { AccountType } from '@users/enums/account-type.enum';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  it('loads current account types from the user record instead of trusting token roles', async () => {
    const usersService = {
      findById: jest.fn().mockResolvedValue({
        email: 'buyer@example.com',
        accountType: AccountType.BUYER,
        accountTypes: [AccountType.BUYER, AccountType.SELLER],
        isActive: true,
      }),
    };
    const configService = {
      jwt: { accessSecret: 'test-secret' },
    };
    const strategy = new JwtStrategy(configService as never, usersService as never);

    await expect(
      strategy.validate({
        sub: 'user-1',
        accountType: AccountType.BUYER,
        accountTypes: [AccountType.BUYER],
      }),
    ).resolves.toEqual({
      userId: 'user-1',
      email: 'buyer@example.com',
      accountType: AccountType.BUYER,
      accountTypes: [AccountType.BUYER, AccountType.SELLER],
    });
  });

  it('rejects inactive users before providing any account roles', async () => {
    const usersService = {
      findById: jest.fn().mockResolvedValue({ isActive: false }),
    };
    const configService = {
      jwt: { accessSecret: 'test-secret' },
    };
    const strategy = new JwtStrategy(configService as never, usersService as never);

    await expect(
      strategy.validate({ sub: 'user-1', accountType: AccountType.BUYER }),
    ).rejects.toThrow();
  });
});
