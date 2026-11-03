import { Controller, HttpCode, HttpStatus, Post, RawBody, Req, Res } from '@nestjs/common';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { Public } from '@auth/decorators/public.decorator';
import { ConfigService } from '@config/config.service';
import { LoggerService } from '@logger/logger.service';
import { DealsService } from '../deals/deals.service';
import { PaymentsService } from '../payments/payments.service';
import { ReturnsService } from '../returns/returns.service';

@ApiTags('Webhooks')
@Controller('webhooks')
export class PaystackWebhookController {
  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
    private readonly dealsService: DealsService,
    private readonly paymentsService: PaymentsService,
    private readonly returnsService: ReturnsService,
  ) {}

  @Public()
  @Post('paystack')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint()
  @ApiOperation({ summary: 'Paystack webhook endpoint' })
  async handlePaystackWebhook(
    @Req() req: Request,
    @Res() res: Response,
    @RawBody() rawBody?: Buffer,
  ) {
    const secret = this.configService.paystack.webhookSecret;
    if (!secret) {
      this.logger.error('PAYSTACK_WEBHOOK_SECRET is not configured', undefined, 'PaystackWebhook');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    const signatureHeader = req.headers['x-paystack-signature'];
    const signature = typeof signatureHeader === 'string' ? signatureHeader : '';
    if (!signature) {
      return res.status(400).json({ error: 'Missing x-paystack-signature header' });
    }

    const payloadBytes = rawBody ?? Buffer.from(JSON.stringify(req.body));
    const expectedHex = createHmac('sha512', secret).update(payloadBytes).digest('hex');

    const signatureBuffer = Buffer.from(signature.trim().toLowerCase());
    const expectedBuffer = Buffer.from(expectedHex);
    const isValid =
      signatureBuffer.length === expectedBuffer.length &&
      timingSafeEqual(signatureBuffer, expectedBuffer);

    if (!isValid) {
      this.logger.warn('Paystack webhook signature verification failed', 'PaystackWebhook');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    try {
      await this.dealsService.handlePaystackEvent(req.body);
      await this.paymentsService.handleOrderPaystackEvent(req.body);
      await this.returnsService.handlePaystackRefundEvent(req.body);
      return res.status(200).json({ received: true });
    } catch (error) {
      this.logger.error(
        `Paystack webhook handler error: ${(error as Error).message}`,
        (error as Error).stack,
        'PaystackWebhook',
      );
      return res.status(500).json({ error: 'Webhook handler failed' });
    }
  }
}
