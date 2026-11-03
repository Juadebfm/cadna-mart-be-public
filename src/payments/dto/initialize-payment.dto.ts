import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class InitializePaymentDto {
  @IsString()
  @IsNotEmpty()
  orderId!: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}
