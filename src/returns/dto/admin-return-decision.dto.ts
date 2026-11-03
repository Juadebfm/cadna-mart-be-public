import { IsIn, IsOptional, IsString } from 'class-validator';

export class AdminReturnDecisionDto {
  @IsIn(['approve', 'reject'])
  decision!: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  note?: string;
}
