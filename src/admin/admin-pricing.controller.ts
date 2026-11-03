import { Controller, Get, Post, Patch, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AccountTypes } from '@auth/decorators/account-types.decorator';
import { AccountType } from '@users/enums/account-type.enum';
import { ParsePublicIdPipe } from '@common/pipes/parse-public-id.pipe';
import { AdminPricingService } from './pricing/admin-pricing.service';
import {
  CreatePricingRuleDto,
  UpdatePricingRuleDto,
  UpdateFeesDto,
  SimulateDto,
} from './pricing/dto/pricing-rule.dto';

@ApiTags('Admin — Pricing')
@ApiBearerAuth()
@AccountTypes(AccountType.ADMIN)
@Controller('admin/pricing')
export class AdminPricingController {
  constructor(private readonly adminPricingService: AdminPricingService) {}

  @Get('rules')
  @ApiOperation({ summary: 'List all pricing rules' })
  async listRules() {
    return this.adminPricingService.listRules();
  }

  @Post('rules')
  @ApiOperation({ summary: 'Create a pricing rule' })
  async createRule(@Body() dto: CreatePricingRuleDto) {
    return this.adminPricingService.createRule(dto);
  }

  @Patch('rules/:id')
  @ApiOperation({ summary: 'Update a pricing rule' })
  async updateRule(@Param('id', ParsePublicIdPipe) id: string, @Body() dto: UpdatePricingRuleDto) {
    return this.adminPricingService.updateRule(id, dto);
  }

  @Get('fees')
  @ApiOperation({ summary: 'Get platform fee configuration' })
  async getFees() {
    return this.adminPricingService.getFees();
  }

  @Patch('fees')
  @ApiOperation({ summary: 'Update platform fee configuration' })
  async updateFees(@Body() dto: UpdateFeesDto) {
    return this.adminPricingService.updateFees(dto);
  }

  @Post('simulate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Simulate order cost breakdown' })
  async simulate(@Body() dto: SimulateDto) {
    return this.adminPricingService.simulate(dto);
  }
}
