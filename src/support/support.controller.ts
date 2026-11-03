import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiQuery, ApiTags } from '@nestjs/swagger';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AccountTypes } from '@auth/decorators/account-types.decorator';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { AccountType } from '@users/enums/account-type.enum';
import { SupportService } from './support.service';
import { CreateTicketDto, AddMessageDto } from './dto/ticket.dto';

@ApiTags('Support')
@ApiBearerAuth()
@Controller('support/tickets')
export class SupportController {
  constructor(private readonly supportService: SupportService) {}

  @AccountTypes(AccountType.BUYER)
  @Post('/mine')
  @UseInterceptors(FilesInterceptor('attachments', 5, { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['subject', 'body'],
      properties: {
        subject: { type: 'string', maxLength: 200 },
        body: { type: 'string', maxLength: 5000 },
        category: { type: 'string' },
        orderId: { type: 'string' },
        attachments: { type: 'array', maxItems: 5, items: { type: 'string', format: 'binary' } },
      },
    },
  })
  async createBuyerTicket(
    @Body() dto: CreateTicketDto,
    @CurrentUser('userId') userId: string,
    @UploadedFiles() attachments: Express.Multer.File[] = [],
  ): Promise<object> {
    return this.supportService.create(dto, userId, AccountType.BUYER, attachments);
  }

  @AccountTypes(AccountType.SELLER)
  @Post('/mine/seller')
  @UseInterceptors(FilesInterceptor('attachments', 5, { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  async createSellerTicket(
    @Body() dto: CreateTicketDto,
    @CurrentUser('userId') userId: string,
    @UploadedFiles() attachments: Express.Multer.File[] = [],
  ): Promise<object> {
    return this.supportService.create(dto, userId, AccountType.SELLER, attachments);
  }

  @AccountTypes(AccountType.BUYER, AccountType.SELLER)
  @Get('/')
  @ApiQuery({ name: 'accountType', required: true, enum: [AccountType.BUYER, AccountType.SELLER] })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20, maximum: 50 })
  async listTickets(
    @CurrentUser('userId') userId: string,
    @CurrentUser('accountTypes') accountTypes: string[],
    @Query('accountType') accountType: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ): Promise<object> {
    this.assertAccountContext(accountTypes, accountType);
    return this.supportService.findByUser(
      userId,
      accountType,
      Math.max(1, Number(page) || 1),
      Math.min(50, Math.max(1, Number(limit) || 20)),
    );
  }

  @AccountTypes(AccountType.BUYER, AccountType.SELLER)
  @Get('/:id')
  @ApiQuery({ name: 'accountType', required: true, enum: [AccountType.BUYER, AccountType.SELLER] })
  async getTicket(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('accountTypes') accountTypes: string[],
    @Query('accountType') accountType: string,
  ): Promise<object> {
    this.assertAccountContext(accountTypes, accountType);
    return this.supportService.findByIdForUser(id, userId, accountType);
  }

  @AccountTypes(AccountType.BUYER, AccountType.SELLER)
  @Get('/:id/messages')
  @ApiQuery({ name: 'accountType', required: true, enum: [AccountType.BUYER, AccountType.SELLER] })
  @ApiQuery({ name: 'afterSequence', required: false, type: Number, minimum: 0 })
  @ApiQuery({ name: 'limit', required: false, type: Number, maximum: 200 })
  async getMessages(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('accountTypes') accountTypes: string[],
    @Query('accountType') accountType: string,
    @Query('afterSequence') afterSequence = '0',
    @Query('limit') limit = '100',
  ): Promise<object> {
    this.assertAccountContext(accountTypes, accountType);
    return this.supportService.findMessagesForUser(
      id,
      userId,
      accountType,
      Math.max(0, Number(afterSequence) || 0),
      Math.min(200, Math.max(1, Number(limit) || 100)),
    );
  }

  @AccountTypes(AccountType.BUYER, AccountType.SELLER)
  @Get('/:id/attachments/:attachmentId')
  @ApiQuery({ name: 'accountType', required: true, enum: [AccountType.BUYER, AccountType.SELLER] })
  async getAttachmentDownloadUrl(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('accountTypes') accountTypes: string[],
    @Query('accountType') accountType: string,
  ): Promise<object> {
    this.assertAccountContext(accountTypes, accountType);
    return this.supportService.getAttachmentDownloadUrlForUser(
      id,
      attachmentId,
      userId,
      accountType,
    );
  }

  @AccountTypes(AccountType.BUYER, AccountType.SELLER)
  @Post('/:id/messages')
  async addMessage(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('accountTypes') accountTypes: string[],
    @Query('accountType') accountType: string,
    @Body() dto: AddMessageDto,
  ): Promise<object> {
    this.assertAccountContext(accountTypes, accountType);
    return this.supportService.addMessageForUser(id, dto, userId, accountType);
  }

  @AccountTypes(AccountType.BUYER, AccountType.SELLER)
  @Post('/:id/close')
  @ApiQuery({ name: 'accountType', required: true, enum: [AccountType.BUYER, AccountType.SELLER] })
  async closeTicket(
    @Param('id') id: string,
    @CurrentUser('userId') userId: string,
    @CurrentUser('accountTypes') accountTypes: string[],
    @Query('accountType') accountType: string,
  ): Promise<object> {
    this.assertAccountContext(accountTypes, accountType);
    if (accountType !== AccountType.BUYER) {
      throw new BadRequestException('Only buyers can close a ticket from their dashboard');
    }
    return this.supportService.withdrawForUser(id, userId, accountType);
  }

  private assertAccountContext(accountTypes: string[] | undefined, accountType: string): void {
    if (![AccountType.BUYER, AccountType.SELLER].includes(accountType as AccountType)) {
      throw new BadRequestException('accountType must be buyer or seller');
    }
    if (!accountTypes?.includes(accountType)) {
      throw new BadRequestException('This account does not have the requested support context');
    }
  }
}
