import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccountTypes } from '@auth/decorators/account-types.decorator';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { AccountType } from '@users/enums/account-type.enum';
import { SellersService } from './sellers.service';
import { OrdersService } from '@orders/orders.service';
import { OrdersRepository } from '@orders/orders.repository';
import { ReturnsService } from '@returns/returns.service';
import { OrderQueryDto } from '@orders/dto/order-query.dto';
import { OrderStatus } from '@orders/schemas/order.schema';
import { SellerAgreementDto } from './dto/seller-agreement.dto';
import { SubmitSellerKycDto } from './dto/submit-seller-kyc.dto';
import { Throttle } from '@nestjs/throttler';
import { SellerOrderActionDto, SellerReturnDecisionDto } from './dto/seller-order-action.dto';

@ApiTags('Sellers - Post-Order')
@ApiBearerAuth()
@AccountTypes(AccountType.SELLER)
@Controller('sellers/me')
export class SellerPostOrderController {
  constructor(
    private readonly sellersService: SellersService,
    private readonly ordersService: OrdersService,
    private readonly ordersRepository: OrdersRepository,
    private readonly returnsService: ReturnsService,
  ) {}

  @Post('/agreement')
  @HttpCode(HttpStatus.OK)
  async acceptAgreement(
    @CurrentUser('userId') userId: string,
    @Body() dto: SellerAgreementDto,
  ): Promise<object> {
    if (!dto.accepted) {
      throw new BadRequestException('Agreement must be accepted to proceed');
    }
    const seller = await this.sellersService.getMySeller(userId);
    return {
      message: 'Stocking and dispatch agreement accepted',
      sellerId: (seller as { id?: string }).id ?? null,
      acceptedAt: new Date(),
    };
  }

  @Post('/kyc')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  async submitKyc(
    @CurrentUser('userId') userId: string,
    @Body() dto: SubmitSellerKycDto,
  ): Promise<object> {
    return this.sellersService.verifyMyApplicationKyc(userId, dto);
  }

  @Get('/orders')
  async getMyOrders(
    @CurrentUser('userId') userId: string,
    @Query() query: OrderQueryDto,
  ): Promise<object> {
    const seller = await this.sellersService.getMySeller(userId);
    const sellerId = (seller as { id?: string }).id;
    if (!sellerId) throw new NotFoundException('Seller profile not found');
    return this.ordersService.findBySeller(sellerId, query);
  }

  @Post('/orders/:id/acknowledge')
  @HttpCode(HttpStatus.OK)
  async acknowledgeOrder(
    @CurrentUser('userId') userId: string,
    @Param('id') orderId: string,
    @Body() dto: SellerOrderActionDto,
  ): Promise<object> {
    const seller = await this.sellersService.getMySeller(userId);
    const sellerId = (seller as { id?: string }).id;
    if (!sellerId) throw new NotFoundException('Seller profile not found');

    const order = await this.ordersRepository.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (
      order.status === OrderStatus.REFUND_REQUESTED ||
      order.status === OrderStatus.CANCELLED ||
      order.status === OrderStatus.REFUNDED
    ) {
      throw new BadRequestException(
        'This order cannot be acknowledged while cancellation or refund is pending',
      );
    }

    const hasSellersItems = order.items.some((item) => item.sellerId === sellerId);
    if (!hasSellersItems) throw new NotFoundException('Order does not contain your products');

    const transitioned = await this.ordersRepository.transitionStatusIfCurrent(
      orderId,
      [OrderStatus.CONFIRMED, OrderStatus.PROCESSING],
      OrderStatus.PROCESSING,
      dto.note ?? 'Acknowledged by seller',
    );
    if (!transitioned)
      throw new BadRequestException('Order status changed; refresh before acknowledging');

    return { orderId, acknowledged: true, note: dto.note ?? null };
  }

  @Post('/orders/:id/dispatch')
  @HttpCode(HttpStatus.OK)
  async dispatchOrder(
    @CurrentUser('userId') userId: string,
    @Param('id') orderId: string,
    @Body() dto: SellerOrderActionDto,
  ): Promise<object> {
    const seller = await this.sellersService.getMySeller(userId);
    const sellerId = (seller as { id?: string }).id;
    if (!sellerId) throw new NotFoundException('Seller profile not found');

    const order = await this.ordersRepository.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (
      order.status === OrderStatus.REFUND_REQUESTED ||
      order.status === OrderStatus.CANCELLED ||
      order.status === OrderStatus.REFUNDED
    ) {
      throw new BadRequestException(
        'This order cannot be dispatched while cancellation or refund is pending',
      );
    }

    const hasSellersItems = order.items.some((item) => item.sellerId === sellerId);
    if (!hasSellersItems) throw new NotFoundException('Order does not contain your products');

    const transitioned = await this.ordersRepository.transitionStatusIfCurrent(
      orderId,
      [OrderStatus.CONFIRMED, OrderStatus.PROCESSING],
      OrderStatus.SHIPPED,
      dto.note ?? 'Dispatched by seller',
    );
    if (!transitioned)
      throw new BadRequestException('Order status changed; refresh before dispatching');

    return {
      orderId,
      dispatched: true,
      trackingNumber: dto.trackingNumber ?? null,
      note: dto.note ?? null,
    };
  }

  @Get('/returns')
  async getMyReturns(
    @CurrentUser('userId') userId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ): Promise<object> {
    const seller = await this.sellersService.getMySeller(userId);
    const sellerId = (seller as { id?: string }).id;
    if (!sellerId) throw new NotFoundException('Seller profile not found');
    return this.returnsService.findBySeller([sellerId], Number(page), Number(limit));
  }

  @Post('/returns/:id/decision')
  @HttpCode(HttpStatus.OK)
  async returnDecision(
    @CurrentUser('userId') userId: string,
    @Param('id') returnId: string,
    @Body() dto: SellerReturnDecisionDto,
  ): Promise<object> {
    const seller = await this.sellersService.getMySeller(userId);
    const sellerId = (seller as { id?: string }).id;
    if (!sellerId) throw new NotFoundException('Seller profile not found');

    return this.returnsService.sellerDecision(returnId, dto.decision, dto.note, [sellerId]);
  }

  @Get('/payouts')
  async getPayouts(
    @CurrentUser('userId') userId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ): Promise<object> {
    await this.sellersService.getMySeller(userId);
    return {
      message:
        'Payout disbursement via Paystack Connect is deferred. Contact support for manual settlements.',
      items: [],
      pagination: { page: Number(page), limit: Number(limit), totalItems: 0, totalPages: 0 },
    };
  }

  @Get('/fees')
  async getFees(@CurrentUser('userId') userId: string): Promise<object> {
    await this.sellersService.getMySeller(userId);
    return {
      maintenanceFeePercent: 3,
      currency: 'NGN',
      note: 'A 3% maintenance fee applies to each settled order.',
      periodSummary: {
        totalOrdersValue: { amount: 0, currency: 'NGN', formatted: '₦0' },
        totalFees: { amount: 0, currency: 'NGN', formatted: '₦0' },
        totalNet: { amount: 0, currency: 'NGN', formatted: '₦0' },
      },
    };
  }
}
