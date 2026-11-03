import { IsBoolean } from 'class-validator';

export class SellerAgreementDto {
  @IsBoolean()
  accepted!: boolean;
}
