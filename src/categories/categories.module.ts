import { Module } from '@nestjs/common';
import { PrismaModule } from '@database/prisma.module';
import { CategoriesRepository } from './categories.repository';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';

@Module({
  imports: [PrismaModule],
  controllers: [CategoriesController],
  providers: [CategoriesRepository, CategoriesService],
  exports: [CategoriesService, CategoriesRepository],
})
export class CategoriesModule {}
