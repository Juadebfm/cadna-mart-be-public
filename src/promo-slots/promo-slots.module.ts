import { Module } from '@nestjs/common';
import { PromoSlotsController } from './promo-slots.controller';
import { AdminPromoSlotsController } from './admin-promo-slots.controller';
import { PromoSlotsService } from './promo-slots.service';
import { PromoSlotsRepository } from './promo-slots.repository';
import { SellersModule } from '@sellers/sellers.module';

@Module({
  imports: [SellersModule],
  controllers: [PromoSlotsController, AdminPromoSlotsController],
  providers: [PromoSlotsService, PromoSlotsRepository],
  exports: [PromoSlotsService],
})
export class PromoSlotsModule {}
