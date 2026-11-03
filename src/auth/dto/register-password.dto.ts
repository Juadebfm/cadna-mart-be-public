import { IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterPasswordDto {
  @ApiProperty({ example: 'session-uuid-here' })
  @IsNotEmpty()
  @IsString()
  sessionId!: string;

  @ApiProperty({ example: 'StrongP@ssw0rd1', minLength: 8 })
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ example: 'StrongP@ssw0rd1' })
  @IsNotEmpty()
  @IsString()
  confirmPassword!: string;
}
