import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '@auth/decorators/public.decorator';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { PaymentsService } from './payments.service';
import { InitializePaymentDto } from './dto/initialize-payment.dto';

@ApiTags('Payments')
@ApiBearerAuth()
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('paystack/initialize')
  async initializePayment(
    @Body() dto: InitializePaymentDto,
    @CurrentUser('id') userId: string,
  ): Promise<object> {
    return this.paymentsService.initializeOrderPayment(dto.orderId, userId, dto.email);
  }

  @Public()
  @Get('paystack/verify/:reference')
  async verifyPayment(@Param('reference') reference: string): Promise<object> {
    return this.paymentsService.verifyOrderPayment(reference);
  }

  @Public()
  @Post('paystack/charge/authorize')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  authorizeCharge(): object {
    return { message: 'Saved card authorization not yet implemented' };
  }

  @Public()
  @Post('paystack/transfer/initialize')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  initializeTransfer(): object {
    return { message: 'Bank transfer initialization not yet implemented' };
  }

  @Public()
  @Get('paystack/transfer/status/:ref')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  getTransferStatus(): object {
    return { message: 'Bank transfer status not yet implemented' };
  }
}
