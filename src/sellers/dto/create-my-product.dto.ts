import { OmitType } from '@nestjs/swagger';
import { CreateProductDto } from '@products/dto/create-product.dto';

export class CreateMyProductDto extends OmitType(CreateProductDto, ['sellerId'] as const) {}
