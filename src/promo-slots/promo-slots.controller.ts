import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '@auth/decorators/public.decorator';
import { AccountTypes } from '@auth/decorators/account-types.decorator';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { AccountType } from '@users/enums/account-type.enum';
import { PromoSlotsService } from './promo-slots.service';
import { CreateBookingDto } from './dto/booking.dto';
import { SellersService } from '@sellers/sellers.service';

@ApiTags('Promo Slots')
@ApiBearerAuth()
@Controller('promo-slots')
export class PromoSlotsController {
  constructor(
    private readonly promoSlotsService: PromoSlotsService,
    private readonly sellersService: SellersService,
  ) {}

  @AccountTypes(AccountType.SELLER)
  @Get('/available')
  async getAvailable(@Query('slotTypeId') slotTypeId?: string): Promise<object> {
    return this.promoSlotsService.findAvailableSlots(slotTypeId);
  }

  @Public()
  @Get('/types')
  async getTypes(): Promise<object> {
    return this.promoSlotsService.findAllSlotTypes();
  }

  @AccountTypes(AccountType.SELLER)
  @Get('/bookings')
  async getMyBookings(
    @CurrentUser('userId') userId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ): Promise<object> {
    const seller = await this.sellersService.getMySeller(userId);
    const sellerId = (seller as { id?: string }).id!;
    return this.promoSlotsService.findBookingsBySeller(sellerId, Number(page), Number(limit));
  }

  @AccountTypes(AccountType.SELLER)
  @Post('/bookings')
  async createBooking(
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateBookingDto,
  ): Promise<object> {
    const seller = await this.sellersService.getMySeller(userId);
    const sellerId = (seller as { id?: string }).id!;
    return this.promoSlotsService.createBooking(dto, sellerId);
  }

  @AccountTypes(AccountType.SELLER)
  @Get('/bookings/:id')
  async getBooking(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ): Promise<object> {
    const seller = await this.sellersService.getMySeller(userId);
    const sellerId = (seller as { id?: string }).id!;
    return this.promoSlotsService.findBookingById(id, sellerId);
  }

  @AccountTypes(AccountType.SELLER)
  @Post('/bookings/:id/pay')
  @HttpCode(HttpStatus.OK)
  async payForBooking(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ): Promise<object> {
    const seller = await this.sellersService.getMySeller(userId);
    const sellerId = (seller as { id?: string }).id!;
    return this.promoSlotsService.payForBooking(id, sellerId);
  }

  @AccountTypes(AccountType.SELLER)
  @Post('/bookings/:id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelBooking(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ): Promise<object> {
    const seller = await this.sellersService.getMySeller(userId);
    const sellerId = (seller as { id?: string }).id!;
    return this.promoSlotsService.cancelBooking(id, sellerId);
  }

  @AccountTypes(AccountType.SELLER)
  @Get('/bookings/:id/performance')
  async getPerformance(
    @CurrentUser('userId') userId: string,
    @Param('id') id: string,
  ): Promise<object> {
    const seller = await this.sellersService.getMySeller(userId);
    const sellerId = (seller as { id?: string }).id!;
    return this.promoSlotsService.getPerformance(id, sellerId);
  }

  @AccountTypes(AccountType.SELLER)
  @Post('/:slotId/reserve')
  @HttpCode(HttpStatus.OK)
  async reserveSlot(@Param('slotId') slotId: string): Promise<object> {
    return this.promoSlotsService.reserveSlot(slotId);
  }

  @AccountTypes(AccountType.SELLER)
  @Get('/:slotId')
  async getSlot(@Param('slotId') slotId: string): Promise<object> {
    return this.promoSlotsService.findSlotById(slotId);
  }
}
