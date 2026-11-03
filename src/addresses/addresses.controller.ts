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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { ParsePublicIdPipe } from '@common/pipes/parse-public-id.pipe';
import { AddressesService } from './addresses.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@ApiTags('User Addresses')
@ApiBearerAuth()
@Controller('users/addresses')
export class AddressesController {
  constructor(private readonly addressesService: AddressesService) {}

  @Get()
  @ApiOperation({ summary: 'List current user addresses' })
  async list(@CurrentUser('userId') userId: string) {
    const items = await this.addressesService.list(userId);
    return { items };
  }

  @Post()
  @ApiOperation({ summary: 'Add a new address' })
  async create(@CurrentUser('userId') userId: string, @Body() dto: CreateAddressDto) {
    return this.addressesService.create(userId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an address' })
  async update(
    @CurrentUser('userId') userId: string,
    @Param('id', ParsePublicIdPipe) id: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressesService.update(userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an address (soft delete)' })
  async remove(@CurrentUser('userId') userId: string, @Param('id', ParsePublicIdPipe) id: string) {
    await this.addressesService.remove(userId, id);
  }

  @Post(':id/default')
  @ApiOperation({ summary: 'Set an address as default' })
  async setDefault(
    @CurrentUser('userId') userId: string,
    @Param('id', ParsePublicIdPipe) id: string,
  ) {
    return this.addressesService.setDefault(userId, id);
  }
}
