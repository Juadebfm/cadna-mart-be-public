import { Module } from '@nestjs/common';
import { PrismaModule } from '@database/prisma.module';
import { AuthEventsService } from './auth-events.service';

@Module({
  imports: [PrismaModule],
  providers: [AuthEventsService],
  exports: [AuthEventsService],
})
export class AuthEventsModule {}
