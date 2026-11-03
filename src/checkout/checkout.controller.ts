import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '@auth/decorators/public.decorator';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { CheckoutService } from './checkout.service';
import { CreateCheckoutSessionDto } from './dto/checkout-session.dto';
import { SetCheckoutAddressDto } from './dto/set-address.dto';
import { SelectDeliveryDto } from './dto/select-delivery.dto';
import { PickupDetailsDto } from './dto/pickup-details.dto';

@ApiTags('Checkout')
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Public()
  @ApiBearerAuth()
  @Post('session')
  @HttpCode(HttpStatus.CREATED)
  async createSession(
    @Body() dto: CreateCheckoutSessionDto,
    @CurrentUser() user: { userId?: string } | null | undefined,
  ) {
    const userId = user?.userId ?? null;
    return this.checkoutService.createSession(dto, userId);
  }

  @Public()
  @Get(':sessionId')
  async getSession(@Param('sessionId') sessionId: string) {
    return this.checkoutService.getSession(sessionId);
  }

  @Public()
  @Post(':sessionId/address')
  async setAddress(@Param('sessionId') sessionId: string, @Body() dto: SetCheckoutAddressDto) {
    return this.checkoutService.setAddress(sessionId, dto);
  }

  @Public()
  @Post(':sessionId/address/validate')
  async validateAddress(@Param('sessionId') sessionId: string) {
    return this.checkoutService.validateAddress(sessionId);
  }

  @Public()
  @Get(':sessionId/delivery-options')
  async getDeliveryOptions(@Param('sessionId') sessionId: string) {
    return this.checkoutService.getDeliveryOptions(sessionId);
  }

  @Public()
  @Post(':sessionId/delivery')
  async selectDelivery(@Param('sessionId') sessionId: string, @Body() dto: SelectDeliveryDto) {
    return this.checkoutService.selectDelivery(sessionId, dto);
  }

  @Public()
  @Post(':sessionId/pickup-details')
  async setPickupDetails(@Param('sessionId') sessionId: string, @Body() dto: PickupDetailsDto) {
    return this.checkoutService.setPickupDetails(sessionId, dto);
  }

  @Public()
  @Get(':sessionId/summary')
  async getSummary(@Param('sessionId') sessionId: string) {
    return this.checkoutService.getSummary(sessionId);
  }

  @Public()
  @ApiBearerAuth()
  @Post(':sessionId/confirm')
  @HttpCode(HttpStatus.CREATED)
  async confirmSession(
    @Param('sessionId') sessionId: string,
    @CurrentUser() user: { userId?: string } | null | undefined,
  ) {
    const userId = user?.userId ?? null;
    return this.checkoutService.confirmSession(sessionId, userId);
  }
}
