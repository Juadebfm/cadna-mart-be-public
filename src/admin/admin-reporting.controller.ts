import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccountTypes } from '@auth/decorators/account-types.decorator';
import { AccountType } from '@users/enums/account-type.enum';
import { PrismaService } from '@database/prisma.service';

@ApiTags('Admin - Reporting')
@ApiBearerAuth()
@AccountTypes(AccountType.ADMIN)
@Controller('admin/reports')
export class AdminReportingController {
  constructor(private readonly prisma: PrismaService) {}

  private async orders(from?: string, to?: string, extra: Record<string, unknown> = {}) {
    return this.prisma.order.findMany({
      where: {
        deletedAt: null,
        ...extra,
        ...(from || to
          ? {
              createdAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        deliveryMode: true,
        items: true,
        pricing: true,
      },
    });
  }

  private amount(value: unknown, key: string): number {
    if (!value || typeof value !== 'object') return 0;
    const result = (value as Record<string, unknown>)[key];
    if (typeof result === 'number') return result;
    if (result && typeof result === 'object') {
      const amount = (result as Record<string, unknown>).amount;
      return typeof amount === 'number' ? amount : 0;
    }
    return 0;
  }

  private money(amount: number) {
    return { amount, currency: 'NGN', formatted: '₦' + Math.round(amount).toLocaleString('en-NG') };
  }

  @Get('/sales')
  async salesReport(@Query('from') from?: string, @Query('to') to?: string): Promise<object> {
    const orders = await this.orders(from, to);
    const totalRevenue = orders.reduce(
      (sum, order) => sum + this.amount(order.pricing, 'total'),
      0,
    );
    return {
      period: { from: from ?? null, to: to ?? null },
      totalOrders: orders.length,
      totalRevenue: this.money(totalRevenue),
    };
  }

  @Get('/gmv')
  async gmvReport(@Query('from') from?: string, @Query('to') to?: string): Promise<object> {
    const orders = await this.orders(from, to);
    const gmv = orders.reduce((sum, order) => sum + this.amount(order.pricing, 'subtotal'), 0);
    return { period: { from: from ?? null, to: to ?? null }, gmv: this.money(gmv) };
  }

  @Get('/orders')
  async ordersReport(@Query('from') from?: string, @Query('to') to?: string): Promise<object> {
    const orders = await this.orders(from, to);
    const counts = new Map<string, number>();
    for (const order of orders) counts.set(order.status, (counts.get(order.status) ?? 0) + 1);
    return {
      period: { from: from ?? null, to: to ?? null },
      byStatus: [...counts]
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count),
    };
  }

  @Get('/refunds')
  async refundsReport(@Query('from') from?: string, @Query('to') to?: string): Promise<object> {
    const orders = await this.orders(from, to, { paymentStatus: 'refunded' });
    const total = orders.reduce((sum, order) => sum + this.amount(order.pricing, 'total'), 0);
    return {
      period: { from: from ?? null, to: to ?? null },
      refundCount: orders.length,
      totalRefunded: this.money(total),
    };
  }

  @Get('/sellers')
  async sellersReport(): Promise<object> {
    const orders = await this.orders();
    const rows = new Map<string, { count: number; revenue: number }>();
    for (const order of orders)
      for (const item of Array.isArray(order.items) ? (order.items as any[]) : []) {
        if (!item.sellerId) continue;
        const row = rows.get(item.sellerId) ?? { count: 0, revenue: 0 };
        row.count += 1;
        row.revenue += this.amount(item.lineTotal, 'amount');
        rows.set(item.sellerId, row);
      }
    const topSellers = [...rows]
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 50)
      .map(([sellerId, value]) => ({
        sellerId,
        orderCount: value.count,
        revenue: this.money(value.revenue),
      }));
    return { topSellers };
  }

  @Get('/products')
  async productsReport(): Promise<object> {
    const orders = await this.orders();
    const rows = new Map<string, { name: string; unitsSold: number; revenue: number }>();
    for (const order of orders)
      for (const item of Array.isArray(order.items) ? (order.items as any[]) : []) {
        if (!item.productId) continue;
        const row = rows.get(item.productId) ?? { name: item.name ?? '', unitsSold: 0, revenue: 0 };
        row.unitsSold += Number(item.quantity) || 0;
        row.revenue += this.amount(item.lineTotal, 'amount');
        rows.set(item.productId, row);
      }
    const topProducts = [...rows]
      .sort((a, b) => b[1].unitsSold - a[1].unitsSold)
      .slice(0, 50)
      .map(([productId, value]) => ({ productId, ...value, revenue: this.money(value.revenue) }));
    return { topProducts };
  }

  @Get('/delivery')
  async deliveryReport(): Promise<object> {
    const orders = await this.orders();
    const counts = new Map<string, number>();
    for (const order of orders)
      counts.set(order.deliveryMode, (counts.get(order.deliveryMode) ?? 0) + 1);
    return {
      byMode: [...counts].map(([mode, count]) => ({ mode, count })),
      note: 'Logistics provider performance metrics will populate once provider integrations are live.',
    };
  }

  @Get('/export')
  exportReport(@Query('type') type = 'sales', @Query('format') format = 'csv'): object {
    return {
      message: `Export of ${type} report in ${format.toUpperCase()} format is queued.`,
      downloadUrl: null,
      note: 'Async CSV/XLSX export will be implemented with a job queue. For now, use the individual report endpoints.',
    };
  }
}
