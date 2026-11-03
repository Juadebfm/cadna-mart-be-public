import { Module } from '@nestjs/common';
import { PrismaModule } from '@database/prisma.module';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { UsersRepository } from './users.repository';
import { AddressesModule } from '@addresses/addresses.module';
import { DataRequestsModule } from '@data-requests/data-requests.module';
import { UploadModule } from '@upload/upload.module';

@Module({
  imports: [PrismaModule, AddressesModule, DataRequestsModule, UploadModule],
  controllers: [UsersController],
  providers: [UsersService, UsersRepository],
  exports: [UsersService],
})
export class UsersModule {}
