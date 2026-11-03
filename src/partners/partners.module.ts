import { Module } from '@nestjs/common';
import { PartnersController, AdminPartnersController } from './partners.controller';
import { PartnersRepository } from './partners.repository';

@Module({
  imports: [],
  controllers: [PartnersController, AdminPartnersController],
  providers: [PartnersRepository],
  exports: [PartnersRepository],
})
export class PartnersModule {}
