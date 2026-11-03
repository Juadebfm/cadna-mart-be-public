import { Module } from '@nestjs/common';
import { DealsController } from './deals.controller';
import { AdminDealsController } from './admin-deals.controller';
import { DealsService } from './deals.service';
import { DealsRepository } from './deals.repository';

@Module({
  imports: [],
  controllers: [DealsController, AdminDealsController],
  providers: [DealsRepository, DealsService],
  exports: [DealsService, DealsRepository],
})
export class DealsModule {}
