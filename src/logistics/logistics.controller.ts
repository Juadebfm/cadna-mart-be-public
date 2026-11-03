import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '@auth/decorators/public.decorator';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { AccountTypes } from '@auth/decorators/account-types.decorator';
import { AccountType } from '@users/enums/account-type.enum';
import { LogisticsService } from './logistics.service';
import {
  BookCourierDto,
  CoverageCheckDto,
  LogisticsQuoteDto,
  PodUploadDto,
  PickupActionDto,
} from './dto/quote.dto';

@ApiTags('Logistics')
@ApiBearerAuth()
@Controller('logistics')
export class LogisticsController {
  constructor(private readonly logisticsService: LogisticsService) {}

  @Public()
  @Post('/quote')
  async getQuote(@Body() dto: LogisticsQuoteDto): Promise<unknown> {
    return this.logisticsService.getQuote(dto);
  }

  @Public()
  @Get('/categories')
  async getCourierCategories(): Promise<unknown> {
    return this.logisticsService.getCourierCategories();
  }

  @Public()
  @Post('/coverage/check')
  async checkCoverage(@Body() dto: CoverageCheckDto): Promise<object> {
    return this.logisticsService.checkCoverage(dto);
  }

  @AccountTypes(AccountType.ADMIN)
  @Post('/booking')
  async bookCourier(@Body() dto: BookCourierDto): Promise<object> {
    return this.logisticsService.bookCourier(dto);
  }

  @AccountTypes(AccountType.BUYER, AccountType.SELLER, AccountType.ADMIN)
  @Get('/booking/:id')
  async getBooking(
    @Param('id') id: string,
    @CurrentUser() user: { userId: string; accountType: string },
  ): Promise<object> {
    return this.logisticsService.getBooking(id, user.userId, user.accountType);
  }

  @AccountTypes(AccountType.ADMIN)
  @Post('/booking/:id/cancel')
  async cancelBooking(@Param('id') id: string, @Body('reason') reason?: string): Promise<object> {
    return this.logisticsService.cancelBooking(id, reason);
  }

  @AccountTypes(AccountType.ADMIN)
  @Post('/booking/:id/retry')
  async retryBooking(@Param('id') id: string): Promise<object> {
    return this.logisticsService.retryBooking(id);
  }

  @AccountTypes(AccountType.BUYER, AccountType.SELLER, AccountType.ADMIN)
  @Get('/tracking/:bookingId')
  async getTracking(
    @Param('bookingId') bookingId: string,
    @CurrentUser() user: { userId: string; accountType: string },
  ): Promise<object> {
    return this.logisticsService.getTracking(bookingId, user.userId, user.accountType);
  }

  @AccountTypes(AccountType.ADMIN, AccountType.SELLER)
  @Post('/pod')
  async uploadPod(@Body() dto: PodUploadDto): Promise<object> {
    return this.logisticsService.uploadPod(dto);
  }

  @AccountTypes(AccountType.SELLER)
  @Post('/pickup/ready')
  @HttpCode(HttpStatus.OK)
  async pickupReady(@Body() dto: PickupActionDto): Promise<object> {
    return this.logisticsService.pickupReady(dto.orderId, dto.note);
  }

  @AccountTypes(AccountType.SELLER)
  @Post('/pickup/verify')
  @HttpCode(HttpStatus.OK)
  async pickupVerify(@Body() dto: PickupActionDto): Promise<object> {
    return this.logisticsService.pickupVerify(dto.orderId);
  }

  @AccountTypes(AccountType.SELLER)
  @Post('/pickup/complete')
  @HttpCode(HttpStatus.OK)
  async pickupComplete(@Body() dto: PickupActionDto): Promise<object> {
    return this.logisticsService.pickupComplete(dto.orderId);
  }

  @AccountTypes(AccountType.SELLER)
  @Post('/pickup/fail')
  @HttpCode(HttpStatus.OK)
  async pickupFail(@Body() dto: PickupActionDto): Promise<object> {
    return this.logisticsService.pickupFail(dto.orderId, dto.note);
  }
}
