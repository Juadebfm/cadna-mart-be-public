import { Injectable } from '@nestjs/common';
import { ConfigService } from '@config/config.service';

@Injectable()
export class AppService {
  constructor(private readonly configService: ConfigService) {}

  private readonly version = process.env.APP_VERSION ?? '0.0.1';

  getWelcome() {
    return {
      name: this.configService.app.name,
      version: this.version,
      environment: this.configService.app.nodeEnv,
      docs: `/${this.configService.app.apiPrefix}/docs`,
    };
  }
}
