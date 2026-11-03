import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccountTypes } from '@auth/decorators/account-types.decorator';
import { AccountType } from '@users/enums/account-type.enum';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { WalletService } from './wallet.service';

@ApiTags('Wallet')
@ApiBearerAuth()
@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('/')
  async getWallet(@CurrentUser('id') userId: string): Promise<object> {
    return this.walletService.getWallet(userId);
  }

  @Get('/transactions')
  async getTransactions(
    @CurrentUser('id') userId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ): Promise<object> {
    return this.walletService.getTransactions(userId, Number(page), Number(limit));
  }

  @Post('/topup/initialize')
  @HttpCode(HttpStatus.OK)
  async topupInitialize(
    @CurrentUser('id') userId: string,
    @Body('amountKobo') amountKobo: number,
  ): Promise<object> {
    return this.walletService.topupInitialize(userId, amountKobo);
  }

  @Post('/debit')
  @HttpCode(HttpStatus.OK)
  async debit(
    @CurrentUser('id') userId: string,
    @Body('amountKobo') amountKobo: number,
    @Body('description') description: string,
    @Body('orderId') orderId?: string,
  ): Promise<object> {
    return this.walletService.debit(userId, amountKobo, description, orderId);
  }

  @AccountTypes(AccountType.ADMIN)
  @Post('/credit')
  @HttpCode(HttpStatus.OK)
  async credit(
    @Body('userId') userId: string,
    @Body('amountKobo') amountKobo: number,
    @Body('description') description: string,
    @Body('reference') reference?: string,
    @Body('orderId') orderId?: string,
  ): Promise<object> {
    return this.walletService.credit(userId, amountKobo, description, reference, orderId);
  }

  @Post('/transfer')
  @HttpCode(HttpStatus.OK)
  async transfer(
    @CurrentUser('id') userId: string,
    @Body('toUserId') toUserId: string,
    @Body('amountKobo') amountKobo: number,
    @Body('note') note?: string,
  ): Promise<object> {
    return this.walletService.transfer(userId, toUserId, amountKobo, note);
  }

  @Get('/holds')
  async getHolds(@CurrentUser('id') userId: string): Promise<object> {
    return this.walletService.getHolds(userId);
  }
}
