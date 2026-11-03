import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@auth/decorators/current-user.decorator';

@ApiTags('Payments - Pay on Delivery')
@ApiBearerAuth()
@Controller('payments/pod')
export class PodController {
  @Get('/eligibility')
  checkEligibility(@CurrentUser('id') _userId: string, @Query('orderId') orderId?: string): object {
    // V1 rules: PoD available for orders ≤ ₦50,000 within Lagos (inner LGAs only)
    return {
      eligible: true,
      orderId: orderId ?? null,
      maxOrderAmountNGN: 50000,
      coveredAreas: ['Lagos Island', 'Lagos Mainland', 'Ikeja', 'Surulere', 'Yaba'],
      note: 'Full risk-engine integration (order history, address scoring) is deferred. V1 applies static rules.',
    };
  }

  @Post('/confirm')
  @HttpCode(HttpStatus.OK)
  confirmPod(@CurrentUser('id') _userId: string, @Body('orderId') orderId: string): object {
    return {
      orderId,
      paymentMethod: 'pay_on_delivery',
      status: 'confirmed',
      message: 'Order confirmed for pay-on-delivery. Payment collected by courier on receipt.',
    };
  }
}
