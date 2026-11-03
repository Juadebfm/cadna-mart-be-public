import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@config/config.service';
import { LoggerService } from '@logger/logger.service';
import { OrdersService } from '../orders/orders.service';
import { OrdersRepository } from '../orders/orders.repository';
import { OrderPaymentStatus } from '../orders/schemas/order.schema';

interface PaystackInitResponse {
  status: boolean;
  message: string;
  data?: {
    authorization_url?: string;
    access_code?: string;
    reference?: string;
  };
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly ordersRepository: OrdersRepository,
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  async initializeOrderPayment(
    orderId: string,
    actorUserId: string,
    email?: string,
  ): Promise<object> {
    const order = await this.ordersService.findById(orderId, actorUserId);

    const orderAny = order as any;

    if (orderAny.paymentStatus === OrderPaymentStatus.PAID) {
      throw new BadRequestException('Order is already paid');
    }
    if (orderAny.status === 'cancelled') {
      throw new BadRequestException('Cannot pay for a cancelled order');
    }
    if (orderAny.expiresAt && new Date(orderAny.expiresAt).getTime() <= Date.now()) {
      throw new BadRequestException('This order has expired. Place a new order to continue.');
    }

    const resolvedEmail: string = email ?? orderAny.guestEmail ?? null;
    if (!resolvedEmail) {
      throw new BadRequestException('Provide an email for payment');
    }

    const paystackSecretKey = this.configService.paystack.secretKey;
    if (!paystackSecretKey) {
      throw new InternalServerErrorException('PAYSTACK_SECRET_KEY is not configured');
    }

    const reference = `order_${orderId}_${Date.now().toString(36)}`;
    const amount = Math.round(orderAny.pricing.total.amount * 100);

    const payload = {
      email: resolvedEmail,
      amount,
      reference,
      metadata: {
        source: 'order',
        orderId,
      },
    };

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    const result = (await response.json()) as PaystackInitResponse;

    if (
      !response.ok ||
      !result.status ||
      !result.data?.authorization_url ||
      !result.data.reference
    ) {
      this.logger.error(
        `Paystack initialize failed for order ${orderId}: ${JSON.stringify(result)}`,
        undefined,
        'PaymentsService',
      );
      throw new BadGatewayException('Failed to initialize Paystack payment');
    }

    const id: string = orderAny.id;

    await this.ordersRepository.update(id, {
      paymentStatus: OrderPaymentStatus.AWAITING_VERIFICATION,
      paystackReference: result.data.reference,
    } as any);

    return {
      orderId,
      orderRef: orderAny.orderRef,
      authorizationUrl: result.data.authorization_url,
      reference: result.data.reference,
    };
  }

  async verifyOrderPayment(reference: string): Promise<object> {
    const paystackSecretKey = this.configService.paystack.secretKey;
    if (!paystackSecretKey) {
      throw new InternalServerErrorException('PAYSTACK_SECRET_KEY is not configured');
    }

    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${paystackSecretKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(15000),
      },
    );
    const result = (await response.json()) as {
      status: boolean;
      data?: { status?: string; reference?: string };
    };

    if (!response.ok || !result.status) {
      this.logger.error(
        `Paystack verify failed for reference ${reference}: ${JSON.stringify(result)}`,
        undefined,
        'PaymentsService',
      );
      throw new BadGatewayException('Failed to verify Paystack payment');
    }

    const data = result.data ?? {};
    let order = await this.ordersRepository.findByPaystackReference(reference);

    if (order && data.status === 'success') {
      const id = (order as unknown as { _id: { toString(): string } })._id.toString();
      await this.ordersService.updatePaymentStatus(id, OrderPaymentStatus.PAID, reference);
      order = await this.ordersRepository.findByPaystackReference(reference);
    }

    const orderDto = order
      ? {
          orderRef: order.orderRef,
          status: order.status,
          paymentStatus: order.paymentStatus,
        }
      : null;

    return {
      reference,
      verified: true,
      status: data.status,
      order: orderDto,
    };
  }

  async initializeRefund(orderId: string, amount: number, returnId: string): Promise<object> {
    const order = await this.ordersRepository.findById(orderId);
    if (!order || order.paymentStatus !== OrderPaymentStatus.PAID) {
      throw new BadRequestException('Order is not eligible for refund');
    }

    const paystackSecretKey = this.configService.paystack.secretKey;
    if (!paystackSecretKey) {
      throw new InternalServerErrorException('PAYSTACK_SECRET_KEY is not configured');
    }

    const refundPayload: Record<string, unknown> = {
      transaction: order.paystackReference,
    };
    if (
      !returnId ||
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      amount > order.pricing.total.amount
    ) {
      throw new BadRequestException(
        'Refund amount must be a positive whole-currency amount within the order total',
      );
    }
    refundPayload['amount'] = amount * 100;
    refundPayload['merchant_note'] = `Buyer money-back request ${returnId}`;

    const response = await fetch('https://api.paystack.co/refund', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystackSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(refundPayload),
      signal: AbortSignal.timeout(15000),
    });
    const result = (await response.json()) as {
      status: boolean;
      message: string;
      data?: { id?: string | number; status?: string; refund_reference?: string | null };
    };

    if (!response.ok || !result.status) {
      this.logger.error(
        `Paystack refund failed for order ${orderId}: ${JSON.stringify(result)}`,
        undefined,
        'PaymentsService',
      );
      throw new BadGatewayException('Failed to initialize refund');
    }

    return {
      orderId,
      queued: true,
      refundReference: result.data?.refund_reference ?? null,
      refundId: result.data?.id?.toString() ?? null,
      status: result.data?.status ?? 'pending',
    };
  }

  async fetchRefund(refundId: string): Promise<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    transactionReference: string;
    refundReference: string | null;
  }> {
    const paystackSecretKey = this.configService.paystack.secretKey;
    if (!paystackSecretKey) {
      throw new InternalServerErrorException('PAYSTACK_SECRET_KEY is not configured');
    }
    const response = await fetch(`https://api.paystack.co/refund/${encodeURIComponent(refundId)}`, {
      headers: { Authorization: `Bearer ${paystackSecretKey}` },
      signal: AbortSignal.timeout(15000),
    });
    const result = (await response.json()) as {
      status?: boolean;
      data?: {
        id?: string | number;
        amount?: number;
        currency?: string;
        status?: string;
        refund_reference?: string | null;
        transaction?: { reference?: string };
      };
    };
    const data = result.data;
    const transactionReference = data?.transaction?.reference;
    if (
      !response.ok ||
      !result.status ||
      data?.id === undefined ||
      !Number.isSafeInteger(data.amount) ||
      !data.currency ||
      !data.status ||
      !transactionReference
    ) {
      throw new BadGatewayException('Could not verify refund status with Paystack');
    }
    return {
      id: data.id.toString(),
      amount: data.amount!,
      currency: data.currency,
      status: data.status,
      transactionReference,
      refundReference: data.refund_reference ?? null,
    };
  }

  async handleOrderPaystackEvent(payload: unknown): Promise<void> {
    const event = payload as { event?: string; data?: { reference?: string; status?: string } };

    if (event.event !== 'charge.success') {
      return;
    }

    const reference = event.data?.reference;
    if (!reference) {
      return;
    }

    const order = await this.ordersRepository.findByPaystackReference(reference);
    if (!order || order.paymentStatus === OrderPaymentStatus.PAID) {
      return;
    }

    const id = (order as unknown as { _id: { toString(): string } })._id.toString();
    await this.ordersService.updatePaymentStatus(id, OrderPaymentStatus.PAID, reference);
  }
}
