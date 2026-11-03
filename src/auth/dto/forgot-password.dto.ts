import { IsEmail, IsNotEmpty, IsString, Length, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'john.doe@example.com' })
  @IsNotEmpty()
  @IsEmail()
  email!: string;
}

export class ForgotPasswordVerifyDto {
  @ApiProperty({ example: 'john.doe@example.com' })
  @IsNotEmpty()
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '123456' })
  @IsNotEmpty()
  @IsString()
  @Length(6, 6)
  code!: string;
}

export class ForgotPasswordResetDto {
  @ApiProperty({ example: 'jwt-reset-token-here' })
  @IsNotEmpty()
  @IsString()
  resetToken!: string;

  @ApiProperty({ example: 'NewStr0ngP@ss!', minLength: 8 })
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'NewStr0ngP@ss!' })
  @IsNotEmpty()
  @IsString()
  confirmPassword!: string;
}
