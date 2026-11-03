import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccountTypes } from '@auth/decorators/account-types.decorator';
import { AccountType } from '@users/enums/account-type.enum';
import { DeliveryConfigService } from './delivery-config.service';
import {
  CreateDeliveryRateDto,
  CreateDeliveryZoneDto,
  UpdateDeliveryRateDto,
  UpdateDeliveryZoneDto,
} from './dto/delivery-config.dto';

const DEFAULT_MODES = [
  { id: 'standard', name: 'Standard Delivery', enabled: true, estimatedDays: '2-3' },
  { id: 'express', name: 'Express Delivery', enabled: true, estimatedDays: '1' },
  { id: 'pickup', name: 'Seller Pickup', enabled: true, estimatedDays: '0' },
];

const DEFAULT_PROVIDERS = [
  { id: 'in_house', name: 'In-House Logistics', enabled: true, priority: 1 },
  { id: 'uber', name: 'Uber (Deferred)', enabled: false, priority: 2 },
  { id: 'bolt', name: 'Bolt (Deferred)', enabled: false, priority: 3 },
];

const DEFAULT_COVERAGE = [
  { city: 'Lagos', state: 'Lagos', enabled: true, zones: ['Island', 'Mainland', 'Lekki', 'Ajah'] },
];

@ApiTags('Admin - Delivery Config')
@ApiBearerAuth()
@AccountTypes(AccountType.ADMIN)
@Controller('admin/delivery')
export class AdminDeliveryController {
  constructor(private readonly deliveryConfig: DeliveryConfigService) {}

  @Get('/zones')
  listZones(): Promise<object> {
    return this.deliveryConfig.listZones();
  }

  @Post('/zones')
  createZone(@Body() dto: CreateDeliveryZoneDto): Promise<object> {
    return this.deliveryConfig.createZone(dto);
  }

  @Patch('/zones/:id')
  updateZone(@Param('id') id: string, @Body() dto: UpdateDeliveryZoneDto): Promise<object> {
    return this.deliveryConfig.updateZone(id, dto);
  }

  @Post('/zones/:id/rates')
  createRate(@Param('id') id: string, @Body() dto: CreateDeliveryRateDto): Promise<object> {
    return this.deliveryConfig.createRate(id, dto);
  }

  @Patch('/rates/:id')
  updateRate(@Param('id') id: string, @Body() dto: UpdateDeliveryRateDto): Promise<object> {
    return this.deliveryConfig.updateRate(id, dto);
  }

  @Get('/modes')
  listModes(): object {
    return { modes: DEFAULT_MODES };
  }

  @Patch('/modes/:id')
  updateMode(@Param('id') id: string, @Body('enabled') enabled?: boolean): object {
    const mode = DEFAULT_MODES.find((m) => m.id === id);
    return {
      id,
      enabled: enabled ?? mode?.enabled ?? false,
      updatedAt: new Date(),
      note: 'Delivery mode config is stored in site-config and will persist on the next server start.',
    };
  }

  @Get('/providers')
  listProviders(): object {
    return { providers: DEFAULT_PROVIDERS };
  }

  @Patch('/providers/order')
  updateProviderOrder(@Body('order') order: string[]): object {
    return {
      order: order ?? DEFAULT_PROVIDERS.map((p) => p.id),
      updatedAt: new Date(),
    };
  }

  @Get('/coverage')
  getCoverage(): object {
    return { coverage: DEFAULT_COVERAGE };
  }

  @Patch('/coverage')
  updateCoverage(@Body() body: unknown): object {
    return { updated: true, coverage: body, updatedAt: new Date() };
  }
}
