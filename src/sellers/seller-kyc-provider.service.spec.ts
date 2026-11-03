import { ConfigService } from '@config/config.service';
import { SellerKycProviderService } from './seller-kyc-provider.service';

describe('SellerKycProviderService', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('uses the test key and never treats a sandbox response as an approval', async () => {
    const fetchMock = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'verified', mode: 'test', match: { all: true } }), {
        status: 200,
      }),
    );
    global.fetch = fetchMock;
    const service = new SellerKycProviderService({
      stackApiKyc: {
        mode: 'test',
        liveEnabled: false,
        testApiKey: 'test-key',
        liveApiKey: 'live-key',
        testPublicKey: 'test-public',
        livePublicKey: '',
        consentVersion: 'v1',
      },
    } as ConfigService);

    const result = await service.verifyIdentity({
      idType: 'nin',
      idNumber: '12345678901',
      firstName: 'Ada',
      lastName: 'Okafor',
    });

    expect(result.status).toBe('sandbox');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.stackapi.app/v1/identity/verify-nin',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-API-Key': 'test-key' }),
      }),
    );
  });

  it('does not make a provider request when live checks are disabled', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;
    const service = new SellerKycProviderService({
      stackApiKyc: {
        mode: 'live',
        liveEnabled: false,
        testApiKey: 'test-key',
        liveApiKey: 'live-key',
        testPublicKey: 'test-public',
        livePublicKey: 'live-public',
        consentVersion: 'v1',
      },
    } as ConfigService);

    const result = await service.verifyIdentity({
      idType: 'passport',
      idNumber: 'P12345',
      firstName: 'Ada',
      lastName: 'Okafor',
    });

    expect(result.status).toBe('unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a live identity check only when all submitted name fields match', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'verified', mode: 'live', match: { all: true } }), {
        status: 200,
      }),
    );
    const service = new SellerKycProviderService({
      stackApiKyc: {
        mode: 'live',
        liveEnabled: true,
        testApiKey: '',
        liveApiKey: 'live-key',
        testPublicKey: '',
        livePublicKey: 'live-public',
        consentVersion: 'v1',
      },
    } as ConfigService);

    const result = await service.verifyIdentity({
      idType: 'nin',
      idNumber: '12345678901',
      firstName: 'Ada',
      lastName: 'Okafor',
    });

    expect(result.status).toBe('verified');
    expect(result.nameMatch).toBe(true);
  });
});
