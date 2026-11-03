import { Module } from '@nestjs/common';
import { PrismaModule } from '@database/prisma.module';
import { OtpRepository } from './otp.repository';
import { OtpService } from './otp.service';

@Module({
  imports: [PrismaModule],
  providers: [OtpRepository, OtpService],
  exports: [OtpService],
})
export class OtpModule {}
