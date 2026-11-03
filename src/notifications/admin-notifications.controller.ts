import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '@auth/decorators/public.decorator';
import { AccountTypes } from '@auth/decorators/account-types.decorator';
import { AccountType } from '@users/enums/account-type.enum';
import { NotificationsService } from './notifications.service';
import { BroadcastDto } from './dto/notification.dto';

@ApiTags('Admin - Notifications')
@ApiBearerAuth()
@Controller('admin/notifications')
export class AdminNotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @AccountTypes(AccountType.ADMIN)
  @Post('/broadcast')
  @HttpCode(HttpStatus.OK)
  async broadcast(@Body() dto: BroadcastDto): Promise<object> {
    return this.notificationsService.broadcast(dto);
  }
}

@ApiTags('Webhooks')
@Controller('webhooks')
export class NotificationWebhooksController {
  @Public()
  @Post('/sms/delivery')
  @HttpCode(HttpStatus.OK)
  handleSmsDelivery(@Body() payload: unknown): object {
    void payload;
    return { received: true, provider: 'sms' };
  }

  @Public()
  @Post('/whatsapp/delivery')
  @HttpCode(HttpStatus.OK)
  handleWhatsappDelivery(@Body() payload: unknown): object {
    void payload;
    return { received: true, provider: 'whatsapp' };
  }
}
