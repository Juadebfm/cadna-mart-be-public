import { Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from '@database/prisma.service';

@Injectable()
export class PostgresHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return this.getStatus(key, true, { state: 'connected' });
    } catch {
      const result = this.getStatus(key, false, { state: 'disconnected' });
      throw new HealthCheckError('PostgreSQL check failed', result);
    }
  }
}
