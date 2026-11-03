import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '@auth/decorators/public.decorator';
import { AccountTypes } from '@auth/decorators/account-types.decorator';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { AccountType } from '@users/enums/account-type.enum';
import { SupportService } from './support.service';
import { TicketStatus } from './schemas/support-ticket.schema';
import { AddMessageDto } from './dto/ticket.dto';

@ApiTags('Admin - Support')
@ApiBearerAuth()
@Controller('admin/support/tickets')
export class AdminSupportController {
  constructor(private readonly supportService: SupportService) {}

  @AccountTypes(AccountType.ADMIN)
  @Get('/')
  async listAll(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: string,
    @Query('assignedTo') assignedTo?: string,
  ): Promise<object> {
    return this.supportService.findAll(
      Number(page),
      Number(limit),
      status as TicketStatus | undefined,
      assignedTo,
    );
  }

  @AccountTypes(AccountType.ADMIN)
  @Post('/:id/assign')
  @HttpCode(HttpStatus.OK)
  async assign(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body('agentId') agentId?: string,
  ): Promise<object> {
    return this.supportService.assign(id, agentId ?? adminId);
  }

  @AccountTypes(AccountType.ADMIN)
  @Post('/:id/escalate')
  @HttpCode(HttpStatus.OK)
  async escalate(@Param('id') id: string, @Body('note') note?: string): Promise<object> {
    return this.supportService.escalate(id, note);
  }

  @AccountTypes(AccountType.ADMIN)
  @Post('/:id/close')
  @HttpCode(HttpStatus.OK)
  async close(@Param('id') id: string): Promise<object> {
    return this.supportService.close(id);
  }

  @AccountTypes(AccountType.ADMIN)
  @Post('/:id/messages')
  async reply(
    @Param('id') id: string,
    @CurrentUser('userId') adminId: string,
    @Body() dto: AddMessageDto,
  ): Promise<object> {
    return this.supportService.addMessage(id, dto, adminId, 'admin');
  }

  @AccountTypes(AccountType.ADMIN)
  @Get('/:id/attachments/:attachmentId')
  async getAttachmentDownloadUrl(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
  ): Promise<object> {
    return this.supportService.getAttachmentDownloadUrlForAdmin(id, attachmentId);
  }
}

@ApiTags('Webhooks')
@Controller('webhooks/support')
export class SupportWebhooksController {
  @Public()
  @Post('/whatsapp/inbound')
  @HttpCode(HttpStatus.OK)
  handleWhatsappInbound(@Body() payload: unknown): object {
    return { received: true, provider: 'whatsapp', payload };
  }
}
