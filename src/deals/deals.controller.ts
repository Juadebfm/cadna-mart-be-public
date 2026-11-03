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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AccountTypes } from '@auth/decorators/account-types.decorator';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { AccountType } from '@users/enums/account-type.enum';
import { ParsePublicIdPipe } from '@common/pipes/parse-public-id.pipe';
import { DealsService } from './deals.service';
import { CreateDealCampaignDto } from './dto/create-deal-campaign.dto';
import { UpdateDealCampaignDto } from './dto/update-deal-campaign.dto';
import { DealCampaignQueryDto } from './dto/deal-campaign-query.dto';

@ApiTags('Deals')
@ApiBearerAuth()
@AccountTypes(AccountType.SELLER)
@Controller('deals/campaigns')
export class DealsController {
  constructor(private readonly dealsService: DealsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a deal campaign' })
  async create(
    @Body() dto: CreateDealCampaignDto,
    @CurrentUser() actor: { userId: string; accountType: string },
  ) {
    return this.dealsService.createMyCampaign(dto, actor);
  }

  @Get('my')
  @ApiOperation({ summary: 'List my deal campaigns' })
  async listMy(
    @CurrentUser() actor: { userId: string; accountType: string },
    @Query() query: DealCampaignQueryDto,
  ) {
    return this.dealsService.listMyCampaigns(actor, query);
  }

  @Get('my/:id')
  @ApiOperation({ summary: 'Get one of my deal campaigns' })
  async getMy(
    @Param('id', ParsePublicIdPipe) id: string,
    @CurrentUser() actor: { userId: string; accountType: string },
  ) {
    return this.dealsService.getMyCampaign(id, actor);
  }

  @Patch('my/:id')
  @ApiOperation({ summary: 'Update one of my deal campaigns' })
  async updateMy(
    @Param('id', ParsePublicIdPipe) id: string,
    @Body() dto: UpdateDealCampaignDto,
    @CurrentUser() actor: { userId: string; accountType: string },
  ) {
    return this.dealsService.updateMyCampaign(id, dto, actor);
  }

  @Delete('my/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete one of my deal campaigns' })
  async deleteMy(
    @Param('id', ParsePublicIdPipe) id: string,
    @CurrentUser() actor: { userId: string; accountType: string },
  ) {
    await this.dealsService.removeMyCampaign(id, actor);
  }

  @Post('my/:id/initialize-payment')
  @ApiOperation({ summary: 'Initialize Paystack payment for my deal campaign' })
  async initializePayment(
    @Param('id', ParsePublicIdPipe) id: string,
    @CurrentUser() actor: { userId: string; accountType: string },
  ) {
    return this.dealsService.initializePayment(id, actor);
  }
}
