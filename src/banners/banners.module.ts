import { Module } from '@nestjs/common';
import { PrismaModule } from '@database/prisma.module';
import { BannersRepository } from './banners.repository';

@Module({
  imports: [PrismaModule],
  providers: [BannersRepository],
  exports: [BannersRepository],
})
export class BannersModule {}
