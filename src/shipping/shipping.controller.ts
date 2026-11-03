import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '@auth/decorators/public.decorator';
import { ShippingService } from './shipping.service';

@ApiTags('Shipping')
@Controller('shipping')
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @Public()
  @Get('estimate')
  @ApiOperation({ summary: 'Get shipping estimate' })
  async getEstimate(
    @Query('productId') productId: string,
    @Query('city') city: string,
    @Query('variantId') variantId?: string,
  ) {
    return this.shippingService.getEstimate(productId, city, variantId);
  }
}
