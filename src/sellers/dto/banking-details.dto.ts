import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class BankingDetailsDto {
  @ApiProperty({
    example: '058',
    description: 'Bank code returned by GET /sellers/applications/me/banks',
  })
  @IsString()
  @IsNotEmpty()
  bankCode!: string;

  @ApiProperty({ example: '0123456789', description: 'Nigerian NUBAN: 10 digits' })
  @IsString()
  @Length(10, 10, { message: 'bankAccountNumber must be exactly 10 digits' })
  @Matches(/^\d{10}$/, { message: 'bankAccountNumber must contain only digits' })
  bankAccountNumber!: string;
}
