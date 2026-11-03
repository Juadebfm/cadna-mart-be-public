import { Module } from '@nestjs/common';
import { RewardsController, AdminRewardsController } from './rewards.controller';
import { RewardsRepository } from './rewards.repository';

@Module({
  imports: [],
  controllers: [RewardsController, AdminRewardsController],
  providers: [RewardsRepository],
  exports: [RewardsRepository],
})
export class RewardsModule {}
