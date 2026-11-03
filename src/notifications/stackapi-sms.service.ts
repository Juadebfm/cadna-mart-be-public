import { Injectable } from '@nestjs/common';
import { ConfigService } from '@config/config.service';
import { LoggerService } from '@logger/logger.service';

@Injectable()
export class StackApiSmsService {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async send(to: string, message: string): Promise<boolean> {
    const { apiKey, publicKey } = this.configService.stackApi;
    if (!apiKey || !publicKey) return false;

    try {
      const response = await fetch('https://api.stackapi.app/v1/notifications/sms', {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'X-Public-Key': publicKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ to, message }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        this.logger.warn(
          `StackAPI SMS request failed with HTTP ${response.status}.`,
          'StackApiSmsService',
        );
        return false;
      }
      return true;
    } catch {
      this.logger.warn('StackAPI SMS request failed before acceptance.', 'StackApiSmsService');
      return false;
    }
  }
}
