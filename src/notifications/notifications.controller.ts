import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { NotificationPreferencesDto } from './dto/notification.dto';
import { NotificationDeviceDto } from './dto/notification.dto';
import { FirebasePushService } from './firebase-push.service';
import { AccountTypes } from '@auth/decorators/account-types.decorator';
import { AccountType } from '@users/enums/account-type.enum';

@ApiTags('Notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,
    private readonly firebasePushService: FirebasePushService,
  ) {}

  @Post('/devices')
  @AccountTypes(AccountType.BUYER)
  @HttpCode(HttpStatus.OK)
  async registerDevice(
    @CurrentUser('userId') userId: string,
    @Body() dto: NotificationDeviceDto,
  ): Promise<{ registered: true }> {
    await this.firebasePushService.registerDevice(userId, dto.fid);
    return { registered: true };
  }

  @Delete('/devices')
  @AccountTypes(AccountType.BUYER)
  @HttpCode(HttpStatus.OK)
  async removeDevice(
    @CurrentUser('userId') userId: string,
    @Body() dto: NotificationDeviceDto,
  ): Promise<{ removed: true }> {
    await this.firebasePushService.removeDevice(userId, dto.fid);
    return { removed: true };
  }

  @Get('/')
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, maximum: 50 })
  async list(
    @CurrentUser('userId') userId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ): Promise<object> {
    return this.notificationsService.findByUser(
      userId,
      Math.max(1, Number(page) || 1),
      Math.min(50, Math.max(1, Number(limit) || 20)),
    );
  }

  @Patch('/:id/read')
  @HttpCode(HttpStatus.OK)
  async markRead(@Param('id') id: string, @CurrentUser('userId') userId: string): Promise<object> {
    return this.notificationsService.markRead(id, userId);
  }

  @Get('/preferences')
  async getPreferences(@CurrentUser('userId') userId: string): Promise<object> {
    return this.notificationsService.getPreferences(userId);
  }

  @Post('/preferences')
  @HttpCode(HttpStatus.OK)
  async updatePreferences(
    @CurrentUser('userId') userId: string,
    @Body() dto: NotificationPreferencesDto,
  ): Promise<object> {
    return this.notificationsService.updatePreferences(userId, dto);
  }
}
