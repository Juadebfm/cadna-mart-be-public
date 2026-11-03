import { SystemService } from './system.service';

describe('SystemService', () => {
  const originalAppVersion = process.env.APP_VERSION;

  afterEach(() => {
    process.env.APP_VERSION = originalAppVersion;
  });

  it('returns version metadata from config and environment', () => {
    process.env.APP_VERSION = '9.9.9';
    const service = new SystemService({
      app: {
        name: 'Cadna Mart API',
        nodeEnv: 'dev',
      },
    } as any);

    expect(service.getVersion()).toEqual({
      name: 'Cadna Mart API',
      version: '9.9.9',
      environment: 'dev',
    });
  });

  it('returns the Lagos-only supported cities payload', () => {
    const service = new SystemService({
      app: {
        name: 'Cadna Mart API',
        nodeEnv: 'dev',
      },
    } as any);

    expect(service.getSupportedCities()).toEqual({
      items: [
        {
          slug: 'lagos',
          name: 'Lagos',
          state: 'Lagos',
          country: 'Nigeria',
          supportsDelivery: true,
          isActive: true,
        },
      ],
    });
  });
});
