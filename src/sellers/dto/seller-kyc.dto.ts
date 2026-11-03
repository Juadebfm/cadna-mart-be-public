import { IsString, IsOptional, IsArray } from 'class-validator';

export class SellerKycDto {
  @IsString()
  idType!: string;

  @IsString()
  idNumber!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  documentUrls?: string[];
}
