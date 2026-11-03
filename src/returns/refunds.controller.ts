import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccountTypes } from '@auth/decorators/account-types.decorator';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { AccountType } from '@users/enums/account-type.enum';
import { ReturnsService } from './returns.service';
import { ProcessRefundDto } from './dto/process-refund.dto';

@ApiTags('Refunds')
@ApiBearerAuth()
@Controller('refunds')
export class RefundsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @AccountTypes(AccountType.ADMIN)
  @Post('/:returnId/process')
  async processRefund(
    @Param('returnId') returnId: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: ProcessRefundDto,
  ): Promise<object> {
    return this.returnsService.processRefund(returnId, dto, adminId);
  }

  @AccountTypes(AccountType.ADMIN)
  @Post('/:id/reconcile')
  async reconcileRefund(@Param('id') id: string): Promise<object> {
    return this.returnsService.reconcileRefund(id);
  }

  @AccountTypes(AccountType.BUYER, AccountType.ADMIN)
  @Get('/:id')
  async getRefundStatus(
    @Param('id') id: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('accountType') accountType: AccountType,
  ): Promise<object> {
    return this.returnsService.getRefundStatus(id, userId, accountType === AccountType.ADMIN);
  }
}
