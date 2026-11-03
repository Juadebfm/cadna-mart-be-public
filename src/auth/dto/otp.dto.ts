import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export enum OtpPurpose {
  LOGIN = 'login',
  EMAIL_VERIFICATION = 'email_verification',
  PASSWORD_RESET = 'password_reset',
}

export class OtpRequestDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiPropertyOptional({ enum: OtpPurpose, example: OtpPurpose.LOGIN, default: OtpPurpose.LOGIN })
  @IsOptional()
  @IsEnum(OtpPurpose)
  purpose?: OtpPurpose;
}

export class OtpVerifyDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(4, 8)
  code!: string;

  @ApiPropertyOptional({ enum: OtpPurpose, example: OtpPurpose.LOGIN, default: OtpPurpose.LOGIN })
  @IsOptional()
  @IsEnum(OtpPurpose)
  purpose?: OtpPurpose;
}

export class OtpResendDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiPropertyOptional({ enum: OtpPurpose, example: OtpPurpose.LOGIN, default: OtpPurpose.LOGIN })
  @IsOptional()
  @IsEnum(OtpPurpose)
  purpose?: OtpPurpose;
}
