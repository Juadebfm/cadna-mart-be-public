import { Module } from '@nestjs/common';
import { PrismaModule } from '@database/prisma.module';
import { RegistrationSessionRepository } from './registration-session.repository';
import { RegistrationSessionService } from './registration-session.service';
import { PendingBuyerSignupRepository } from './pending-buyer-signup.repository';
import { PendingBuyerSignupService } from './pending-buyer-signup.service';

@Module({
  imports: [PrismaModule],
  providers: [
    RegistrationSessionRepository,
    RegistrationSessionService,
    PendingBuyerSignupRepository,
    PendingBuyerSignupService,
  ],
  exports: [RegistrationSessionService, PendingBuyerSignupService],
})
export class RegistrationSessionModule {}
