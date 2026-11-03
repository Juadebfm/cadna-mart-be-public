import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccountTypes } from '@auth/decorators/account-types.decorator';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { AccountType } from '@users/enums/account-type.enum';
import { ProductsService } from '@products/products.service';
import { ProductQueryDto } from '@products/dto/product-query.dto';
import { OrdersService } from '@orders/orders.service';
import { OrdersRepository } from '@orders/orders.repository';
import { OrderQueryDto } from '@orders/dto/order-query.dto';
import { OrderStatus } from '@orders/schemas/order.schema';
import { StockUpdateDto, SupplierOrderActionDto } from './dto/stock-update.dto';

@ApiTags('Suppliers')
@ApiBearerAuth()
@AccountTypes(AccountType.SUPPLIER)
@Controller('suppliers/me')
export class SuppliersController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly ordersService: OrdersService,
    private readonly ordersRepository: OrdersRepository,
  ) {}

  @Get('/products')
  async getMyProducts(
    @CurrentUser('id') userId: string,
    @Query() query: ProductQueryDto,
  ): Promise<object> {
    return this.productsService.findMyProducts(userId, query);
  }

  @Patch('/products/:id/stock')
  async updateStock(
    @CurrentUser('id') userId: string,
    @Param('id') id: string,
    @Body() dto: StockUpdateDto,
  ): Promise<object> {
    return this.productsService.updateProduct(
      id,
      { inventoryCount: dto.stock } as Parameters<typeof this.productsService.updateProduct>[1],
      { userId, accountType: AccountType.SUPPLIER },
    );
  }

  @Get('/orders')
  async getMyOrders(
    @CurrentUser('id') userId: string,
    @Query() query: OrderQueryDto,
  ): Promise<object> {
    return this.ordersService.findBySeller(userId, query);
  }

  @Post('/orders/:id/ready')
  @HttpCode(HttpStatus.OK)
  async markReady(
    @CurrentUser('id') userId: string,
    @Param('id') orderId: string,
    @Body() dto: SupplierOrderActionDto,
  ): Promise<object> {
    const order = await this.ordersRepository.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');

    await this.ordersRepository.updateStatus(
      orderId,
      OrderStatus.PROCESSING,
      dto.note ?? 'Ready for pickup/dispatch — marked by supplier',
    );

    return { orderId, status: OrderStatus.PROCESSING, note: dto.note ?? null };
  }

  @Post('/orders/:id/dispatch')
  @HttpCode(HttpStatus.OK)
  async markDispatched(
    @CurrentUser('id') userId: string,
    @Param('id') orderId: string,
    @Body() dto: SupplierOrderActionDto,
  ): Promise<object> {
    const order = await this.ordersRepository.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');

    await this.ordersRepository.updateStatus(
      orderId,
      OrderStatus.SHIPPED,
      dto.note ?? 'Dispatched — marked by supplier',
    );

    return {
      orderId,
      status: OrderStatus.SHIPPED,
      trackingNumber: dto.trackingNumber ?? null,
      note: dto.note ?? null,
    };
  }

  @Get('/policies')
  getPolicies(): object {
    return {
      returnWindowDays: 7,
      dispatchSlaHours: 24,
      stockReportingFrequency: 'daily',
      note: 'Supplier-specific policy overrides are configured by admin per supplier account. These are the platform defaults.',
      policies: [
        { key: 'return_window', value: '7 days', scope: 'platform_default' },
        { key: 'dispatch_sla', value: '24 hours', scope: 'platform_default' },
        { key: 'stock_sync', value: 'manual', scope: 'platform_default' },
      ],
    };
  }
}
