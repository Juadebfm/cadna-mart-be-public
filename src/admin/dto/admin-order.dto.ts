import { IsEnum, IsOptional, IsString } from 'class-validator';
import { OrderStatus } from '@orders/schemas/order.schema';

export class AdminOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;

  @IsOptional()
  @IsString()
  note?: string;
}

export class AdminOrderInterveneDto {
  @IsString()
  action!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class AdminOrderReassignDto {
  @IsOptional()
  @IsString()
  sellerId?: string;

  @IsOptional()
  @IsString()
  supplierId?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
