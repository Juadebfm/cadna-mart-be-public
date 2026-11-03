import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma.module';

@Module({
  imports: [PrismaModule],
})
export class DatabaseModule {}
