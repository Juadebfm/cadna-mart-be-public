import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OrdersService } from './orders.service';

@Injectable()
export class OrderExpiryProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderExpiryProcessor.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly ordersService: OrdersService) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.expire(), 60_000);
    this.timer.unref();
    void this.expire();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async expire(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.ordersService.expireUnpaidOrders();
    } catch (error) {
      this.logger.error(`Could not expire unpaid orders: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
