import { BadRequestException } from '@nestjs/common';
import { OtpRepository } from './otp.repository';
import { OtpService } from './otp.service';
import { OtpType } from './enums/otp-type.enum';

describe('OtpService', () => {
  const otpRepository = {
    findLatestValid: jest.fn(),
    markAsUsed: jest.fn(),
    incrementAttempts: jest.fn(),
  };
  let otpService: OtpService;
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    originalNodeEnv = process.env.NODE_ENV;
    otpRepository.findLatestValid.mockResolvedValue(null);
    otpService = new OtpService(otpRepository as unknown as OtpRepository);
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it('rejects 000000 in development when it was not issued as a real OTP', async () => {
    process.env.NODE_ENV = 'dev';

    await expect(
      otpService.verify('buyer@example.com', '000000', OtpType.PASSWORD_RESET),
    ).rejects.toThrow(BadRequestException);
    expect(otpRepository.findLatestValid).toHaveBeenCalledWith(
      'buyer@example.com',
      OtpType.PASSWORD_RESET,
    );
    expect(otpRepository.markAsUsed).not.toHaveBeenCalled();
  });
});
