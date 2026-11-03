import { IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { RefundMethod } from '../schemas/return-request.schema';

export class ProcessRefundDto {
  @IsEnum(RefundMethod)
  refundMethod!: RefundMethod;

  @IsNumber()
  @IsInt()
  @Min(0)
  refundAmount!: number;

  @IsOptional()
  @IsString()
  note?: string;
}
