import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '@auth/decorators/public.decorator';
import { AccountTypes } from '@auth/decorators/account-types.decorator';
import { AccountType } from '@users/enums/account-type.enum';

const DEFERRED_NOTE = 'Stripe integration is deferred pending V1 international payments decision.';

@ApiTags('Payments - Stripe')
@ApiBearerAuth()
@Controller('payments/stripe')
export class StripeController {
  @Post('/payment-intent')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  createPaymentIntent(): object {
    return { note: DEFERRED_NOTE };
  }

  @Post('/payment-intent/:id/confirm')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  confirmPaymentIntent(@Param('id') id: string): object {
    return { id, note: DEFERRED_NOTE };
  }

  @Post('/setup-intent')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  createSetupIntent(): object {
    return { note: DEFERRED_NOTE };
  }

  @AccountTypes(AccountType.ADMIN)
  @Post('/refund')
  @HttpCode(HttpStatus.NOT_IMPLEMENTED)
  issueRefund(@Body() _body: unknown): object {
    return { note: DEFERRED_NOTE };
  }

  @Get('/payment-methods')
  listPaymentMethods(): object {
    return { methods: [], note: DEFERRED_NOTE };
  }

  @Delete('/payment-methods/:id')
  @HttpCode(HttpStatus.OK)
  detachPaymentMethod(@Param('id') id: string): object {
    return { id, detached: false, note: DEFERRED_NOTE };
  }
}

@ApiTags('Webhooks')
@Controller('webhooks')
export class StripeWebhookController {
  @Public()
  @Post('/stripe')
  @HttpCode(HttpStatus.OK)
  handleStripeWebhook(@Body() payload: unknown): object {
    return { received: true, provider: 'stripe', payload, note: DEFERRED_NOTE };
  }
}
