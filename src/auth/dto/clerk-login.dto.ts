import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ClerkLoginDto {
  @ApiProperty({ description: 'Clerk session token from the frontend SDK' })
  @IsString()
  @IsNotEmpty()
  token!: string;
}
