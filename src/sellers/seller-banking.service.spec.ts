import { ServiceUnavailableException } from '@nestjs/common';
import { SellerBankingService } from './seller-banking.service';

describe('SellerBankingService', () => {
  const configValue = {
    provider: 'paystack' as 'paystack' | 'nomba' | undefined,
    paystackSecretKey: 'test-key',
    nombaAccountId: '',
    nombaClientId: '',
    nombaClientSecret: '',
  };
  const config = {
    get sellerBankVerification() {
      return configValue;
    },
  };
  let service: SellerBankingService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    configValue.provider = 'paystack';
    configValue.paystackSecretKey = 'test-key';
    configValue.nombaAccountId = '';
    configValue.nombaClientId = '';
    configValue.nombaClientSecret = '';
    service = new SellerBankingService(config as any);
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => fetchSpy.mockRestore());

  it('returns active Paystack banks and caches the list', async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          status: true,
          data: [
            { code: '058', name: 'GTBank', active: true },
            { code: '000', name: 'Disabled bank', active: false },
          ],
        }),
        { status: 200 },
      ),
    );

    await expect(service.listBanks()).resolves.toEqual([{ code: '058', name: 'GTBank' }]);
    await service.listBanks();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('resolves the bank account name server-side and maps the provider bank name', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: true, data: { account_name: 'Jane Doe' } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: true, data: [{ code: '058', name: 'GTBank' }] }), {
          status: 200,
        }),
      );

    await expect(service.resolveAccount('058', '0123456789')).resolves.toEqual({
      accountName: 'Jane Doe',
      bankCode: '058',
      bankName: 'GTBank',
    });
    expect(fetchSpy.mock.calls[0][0]).toContain('/bank/resolve?');
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({
      headers: { Authorization: 'Bearer test-key' },
    });
  });

  it('does not make a provider request when no lookup provider is selected', async () => {
    configValue.provider = undefined;
    await expect(service.listBanks()).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
