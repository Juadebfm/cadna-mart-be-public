import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Equals, IsIn, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { SellerKycIdType } from '../seller-kyc-provider.service';

export class SubmitSellerKycDto {
  @ApiProperty({ enum: ['nin', 'drivers_license', 'passport', 'voter_id'] })
  @IsIn(['nin', 'drivers_license', 'passport', 'voter_id'])
  idType!: SellerKycIdType;

  @ApiProperty({ example: '12345678901' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(32)
  @Matches(/^[A-Za-z0-9/-]+$/)
  idNumber!: string;

  @ApiProperty({ description: 'Must be true to authorize the identity check' })
  @Equals(true)
  consentGiven!: true;
}
