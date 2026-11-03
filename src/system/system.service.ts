import { Injectable } from '@nestjs/common';
import { ConfigService } from '@config/config.service';

@Injectable()
export class SystemService {
  constructor(private readonly configService: ConfigService) {}

  getVersion() {
    return {
      name: this.configService.app.name,
      version: process.env.APP_VERSION ?? '0.0.1',
      environment: this.configService.app.nodeEnv,
    };
  }

  getSupportedCities() {
    return {
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
    };
  }
}
