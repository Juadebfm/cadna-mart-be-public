import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public } from '@auth/decorators/public.decorator';
import { PoliciesService } from './policies.service';

@ApiTags('Policies')
@Controller('policies')
export class PoliciesController {
  constructor(private readonly policiesService: PoliciesService) {}

  @Public()
  @Get('products/:productId')
  @ApiOperation({ summary: 'Get product return and warranty policies' })
  async getProductPolicy(@Param('productId') productId: string) {
    return this.policiesService.getProductPolicy(productId);
  }
}
