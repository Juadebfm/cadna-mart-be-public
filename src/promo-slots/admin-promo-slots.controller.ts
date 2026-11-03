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
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccountTypes } from '@auth/decorators/account-types.decorator';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { AccountType } from '@users/enums/account-type.enum';
import { PromoSlotsService } from './promo-slots.service';
import { CreateSlotTypeDto, UpdateSlotTypeDto } from './dto/slot-type.dto';
import { CreateDurationTierDto, UpdateDurationTierDto } from './dto/duration-tier.dto';
import { GenerateSlotsDto, SuspendBookingDto } from './dto/booking.dto';
import { BookingStatus } from './schemas/slot-booking.schema';

@ApiTags('Admin - Promo Slots')
@ApiBearerAuth()
@AccountTypes(AccountType.ADMIN)
@Controller('admin/promo-slots')
export class AdminPromoSlotsController {
  constructor(private readonly promoSlotsService: PromoSlotsService) {}

  @Get('/types')
  async listTypes(): Promise<object> {
    return this.promoSlotsService.findAllSlotTypes();
  }

  @Post('/types')
  async createType(@Body() dto: CreateSlotTypeDto): Promise<object> {
    return this.promoSlotsService.createSlotType(dto);
  }

  @Patch('/types/:id')
  async updateType(@Param('id') id: string, @Body() dto: UpdateSlotTypeDto): Promise<object> {
    return this.promoSlotsService.updateSlotType(id, dto);
  }

  @Delete('/types/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteType(@Param('id') id: string): Promise<void> {
    await this.promoSlotsService.deleteSlotType(id);
  }

  @Get('/duration-tiers')
  async listTiers(): Promise<object> {
    return this.promoSlotsService.findAllTiers();
  }

  @Post('/duration-tiers')
  async createTier(@Body() dto: CreateDurationTierDto): Promise<object> {
    return this.promoSlotsService.createTier(dto);
  }

  @Patch('/duration-tiers/:id')
  async updateTier(@Param('id') id: string, @Body() dto: UpdateDurationTierDto): Promise<object> {
    return this.promoSlotsService.updateTier(id, dto);
  }

  @Delete('/duration-tiers/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTier(@Param('id') id: string): Promise<void> {
    await this.promoSlotsService.deleteTier(id);
  }

  @Get('/capacity')
  getCapacity(): object {
    return this.promoSlotsService.getCapacity();
  }

  @Patch('/capacity')
  updateCapacity(@Body() body: unknown): object {
    return this.promoSlotsService.updateCapacity(body);
  }

  @Post('/generate')
  async generateSlots(@Body() dto: GenerateSlotsDto): Promise<object> {
    return this.promoSlotsService.generateSlots(dto);
  }

  @Get('/bookings')
  async listBookings(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: string,
  ): Promise<object> {
    return this.promoSlotsService.findAllBookings(
      Number(page),
      Number(limit),
      status as BookingStatus | undefined,
    );
  }

  @Post('/bookings/:id/suspend')
  @HttpCode(HttpStatus.OK)
  async suspendBooking(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: SuspendBookingDto,
  ): Promise<object> {
    return this.promoSlotsService.suspendBooking(id, dto, adminId);
  }

  @Post('/bookings/:id/refund')
  @HttpCode(HttpStatus.OK)
  async refundBooking(@Param('id') id: string): Promise<object> {
    return this.promoSlotsService.adminRefundBooking(id);
  }

  @Get('/reports/revenue')
  getRevenueReport(): object {
    return this.promoSlotsService.getRevenueReport();
  }

  @Get('/reports/utilization')
  getUtilizationReport(): object {
    return this.promoSlotsService.getUtilizationReport();
  }
}
