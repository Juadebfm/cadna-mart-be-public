import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // Use Neon's pooler for the long-running API process when configured.
    // Keep DATABASE_URL as the direct connection used by Prisma CLI migrations.
    const connectionString = process.env.DATABASE_URL_POOLED ?? process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL_POOLED or DATABASE_URL is required to initialize PostgreSQL');
    }

    super({ adapter: new PrismaPg({ connectionString }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
