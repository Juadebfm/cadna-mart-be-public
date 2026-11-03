import { AppService } from './app.service';
import { ConfigService } from '@config/config.service';

describe('AppService', () => {
  it('returns the API welcome payload', () => {
    const configService = {
      app: {
        name: 'cadna-mart-backend',
        nodeEnv: 'dev',
        apiPrefix: 'api',
      },
    } as ConfigService;

    const service = new AppService(configService);

    expect(service.getWelcome()).toEqual({
      name: 'cadna-mart-backend',
      version: '0.0.1',
      environment: 'dev',
      docs: '/api/docs',
    });
  });
});
