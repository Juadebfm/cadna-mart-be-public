import { Injectable, BadRequestException } from '@nestjs/common';
import { randomInt } from 'crypto';
import { OtpRepository } from './otp.repository';
import { OtpType } from './enums/otp-type.enum';
import { hashPassword, comparePassword } from '@common/utils/hash.util';
import { ERROR_MESSAGES } from '@common/constants/error-messages.constants';

const OTP_EXPIRY_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_COOLDOWN_SECONDS = 60;

@Injectable()
export class OtpService {
  constructor(private readonly otpRepository: OtpRepository) {}

  async generateAndStore(email: string, type: OtpType, userId?: string): Promise<string> {
    await this.checkCooldown(email, type);

    // Invalidate previous OTPs of same type
    await this.otpRepository.invalidateAll(email, type);

    const code = this.generateCode();
    const hashedCode = await hashPassword(code);

    await this.otpRepository.create({
      userId: userId ?? null,
      email: email.toLowerCase(),
      code: hashedCode,
      type,
      expiresAt: new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000),
    });

    return code;
  }

  async verify(email: string, code: string, type: OtpType): Promise<boolean> {
    const otp = await this.otpRepository.findLatestValid(email, type);

    if (!otp) {
      throw new BadRequestException(ERROR_MESSAGES.OTP_EXPIRED);
    }

    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      await this.otpRepository.markAsUsed(otp.id);
      throw new BadRequestException(ERROR_MESSAGES.OTP_MAX_ATTEMPTS);
    }

    const isValid = await comparePassword(code, otp.code);

    if (!isValid) {
      await this.otpRepository.incrementAttempts(otp.id);
      throw new BadRequestException(ERROR_MESSAGES.OTP_INVALID);
    }

    await this.otpRepository.markAsUsed(otp.id);
    return true;
  }

  private async checkCooldown(email: string, type: OtpType): Promise<void> {
    const latest = await this.otpRepository.findLatestByEmail(email, type);
    if (latest) {
      const elapsed = (Date.now() - latest.createdAt.getTime()) / 1000;
      if (elapsed < OTP_COOLDOWN_SECONDS) {
        throw new BadRequestException(ERROR_MESSAGES.OTP_COOLDOWN);
      }
    }
  }

  private generateCode(): string {
    return randomInt(100000, 1000000).toString();
  }
}
