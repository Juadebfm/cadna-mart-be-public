import { ConfigService } from '@config/config.service';
import { LoggerService } from '@logger/logger.service';
import { StackApiSmsService } from './stackapi-sms.service';

describe('StackApiSmsService', () => {
  let service: StackApiSmsService;
  const logger = { warn: jest.fn() };

  beforeEach(() => {
    jest.restoreAllMocks();
    logger.warn.mockClear();
  });

  it('does not call the provider when credentials are missing', async () => {
    const config = { stackApi: { apiKey: '', publicKey: '' } } as ConfigService;
    service = new StackApiSmsService(config, logger as unknown as LoggerService);
    const fetchSpy = jest.spyOn(global, 'fetch');

    expect(await service.send('+2348012345678', 'Order update')).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('sends through the documented endpoint and headers without logging recipient data', async () => {
    const config = {
      stackApi: { apiKey: 'test-secret', publicKey: 'test-public' },
    } as ConfigService;
    service = new StackApiSmsService(config, logger as unknown as LoggerService);
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
    } as Response);

    expect(await service.send('+2348012345678', 'Order update')).toBe(true);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.stackapi.app/v1/notifications/sms',
      expect.objectContaining({
        method: 'POST',
        headers: {
          'X-API-Key': 'test-secret',
          'X-Public-Key': 'test-public',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ to: '+2348012345678', message: 'Order update' }),
      }),
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('logs only the HTTP status for rejected requests', async () => {
    const config = {
      stackApi: { apiKey: 'test-secret', publicKey: 'test-public' },
    } as ConfigService;
    service = new StackApiSmsService(config, logger as unknown as LoggerService);
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 401 } as Response);

    expect(await service.send('+2348012345678', 'Order update')).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      'StackAPI SMS request failed with HTTP 401.',
      'StackApiSmsService',
    );
    expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('+2348012345678');
  });
});
