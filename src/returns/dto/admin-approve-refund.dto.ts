import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class AdminApproveRefundDto {
  @IsInt()
  @Min(1)
  amount!: number;

  @IsOptional()
  @IsString()
  note?: string;
}
