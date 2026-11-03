import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CartRepository } from './cart.repository';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';
import { ConfigService } from '@config/config.service';
import { PrismaModule } from '@database/prisma.module';

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        secret: configService.jwt.accessSecret,
        signOptions: { expiresIn: configService.jwt.accessExpiration as any },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [CartController],
  providers: [CartRepository, CartService],
  exports: [CartService, CartRepository],
})
export class CartModule {}
