import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LocalStrategy } from './strategies/local.strategy';
import { SessionSerializer } from './serializers/session.serializer';
import { UsersModule } from '@users/users.module';
import { OtpModule } from '@otp/otp.module';
import { EmailModule } from '@email/email.module';
import { RegistrationSessionModule } from '@registration-session/registration-session.module';
import { ConfigService } from '@config/config.service';
import { AuthEventsModule } from '@auth-events/auth-events.module';
import { NotificationsModule } from '@notifications/notifications.module';

@Module({
  imports: [
    UsersModule,
    OtpModule,
    EmailModule,
    RegistrationSessionModule,
    AuthEventsModule,
    NotificationsModule,
    PassportModule.register({ session: true }),
    JwtModule.registerAsync({
      useFactory: (configService: ConfigService) => ({
        secret: configService.jwt.accessSecret,
        signOptions: { expiresIn: configService.jwt.accessExpiration as any },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, LocalStrategy, SessionSerializer],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
