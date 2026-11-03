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
import { Public } from '@auth/decorators/public.decorator';
import { AccountTypes } from '@auth/decorators/account-types.decorator';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { AccountType } from '@users/enums/account-type.enum';
import { RewardsRepository } from './rewards.repository';
import { RewardsAccount } from './schemas/rewards.schema';

@ApiTags('Rewards')
@ApiBearerAuth()
@Controller('rewards')
export class RewardsController {
  constructor(private readonly repo: RewardsRepository) {}

  @Public()
  @Get('/program')
  async getPublicProgram(): Promise<object> {
    const program = await this.repo.getProgram();
    return { program: program ?? { name: 'Odogwu Rewards', tagline: null } };
  }

  @Get('/me')
  async getMyRewards(@CurrentUser('id') userId: string): Promise<object> {
    const account = await this.repo.findOrCreateAccount(userId);
    return { account };
  }

  @Get('/me/cashback')
  async getCashback(@CurrentUser('id') userId: string): Promise<object> {
    const account = await this.repo.findOrCreateAccount(userId);
    return {
      cashback: {
        amount: account.cashbackKobo,
        currency: 'NGN',
        formatted: '₦' + (account.cashbackKobo / 100).toLocaleString('en-NG'),
      },
    };
  }

  @Get('/me/transactions')
  async getTransactions(
    @CurrentUser('id') userId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ): Promise<object> {
    const account = await this.repo.findOrCreateAccount(userId);
    const accountId = (account as unknown as { _id: { toString(): string } })._id.toString();
    const { items, totalItems } = await this.repo.findTransactions(
      accountId,
      Number(page),
      Number(limit),
    );
    return {
      items,
      meta: {
        page: Number(page),
        limit: Number(limit),
        totalItems,
        totalPages: Math.ceil(totalItems / Number(limit)),
      },
    };
  }

  @Post('/cashback/redeem')
  @HttpCode(HttpStatus.OK)
  async redeemCashback(
    @CurrentUser('id') userId: string,
    @Body('amountKobo') amountKobo: number,
  ): Promise<object> {
    const account = await this.repo.findOrCreateAccount(userId);
    if (account.cashbackKobo < amountKobo) {
      return { redeemed: false, message: 'Insufficient cashback balance' };
    }
    return {
      redeemed: true,
      amountKobo,
      note: 'Cashback-to-wallet credit will be wired when WalletModule integration is enabled.',
    };
  }

  @Public()
  @Get('/tiers')
  async getTiers(): Promise<object> {
    const tiers = await this.repo.findTiers();
    return {
      tiers: tiers.length
        ? tiers
        : [
            { name: 'Bronze', minPoints: 0, maxPoints: 999, cashbackRate: 0.01 },
            { name: 'Silver', minPoints: 1000, maxPoints: 4999, cashbackRate: 0.02 },
            { name: 'Gold', minPoints: 5000, maxPoints: null, cashbackRate: 0.03 },
          ],
    };
  }

  @Public()
  @Get('/campaigns')
  async getActiveCampaigns(): Promise<object> {
    const campaigns = await this.repo.findActiveCampaigns();
    return { campaigns };
  }

  @Post('/affiliates/enroll')
  @HttpCode(HttpStatus.OK)
  async enrollAffiliate(@CurrentUser('id') userId: string): Promise<object> {
    const code = `AFF-${userId.slice(-6).toUpperCase()}`;
    await this.repo.updateAccount(userId, {
      isAffiliate: true,
      affiliateCode: code,
    } as Partial<RewardsAccount>);
    return { enrolled: true, affiliateCode: code };
  }

  @Get('/affiliates/me')
  async getAffiliateProfile(@CurrentUser('id') userId: string): Promise<object> {
    const account = await this.repo.findOrCreateAccount(userId);
    return {
      isAffiliate: account.isAffiliate,
      affiliateCode: account.affiliateCode,
      note: 'Affiliate dashboard (clicks, conversions) is deferred pending analytics pipeline.',
    };
  }

  @Get('/affiliates/me/earnings')
  async getAffiliateEarnings(): Promise<object> {
    return {
      totalEarningsKobo: 0,
      pendingKobo: 0,
      paidOutKobo: 0,
      note: 'Affiliate earnings aggregation is deferred.',
    };
  }

  @Post('/affiliates/me/payout')
  @HttpCode(HttpStatus.OK)
  async requestPayout(): Promise<object> {
    return {
      requested: false,
      note: 'Affiliate payout requests are deferred pending Paystack Connect integration.',
    };
  }

  @Get('/affiliates/me/referrals')
  async getReferrals(@CurrentUser('id') userId: string): Promise<object> {
    const account = await this.repo.findOrCreateAccount(userId);
    return {
      affiliateCode: account.affiliateCode,
      referrals: [],
      note: 'Referral tracking requires a click-attribution pipeline. Deferred.',
    };
  }

  @AccountTypes(AccountType.SELLER)
  @Get('/sellers/me/rewards')
  async getSellerRewards(@CurrentUser('id') userId: string): Promise<object> {
    const account = await this.repo.findOrCreateAccount(userId);
    return { account, note: 'Seller-specific reward multipliers are deferred.' };
  }

  @Get('/financiers/me/rewards')
  async getFinancierRewards(@CurrentUser('id') userId: string): Promise<object> {
    const account = await this.repo.findOrCreateAccount(userId);
    return { account, note: 'Financier tier rewards are deferred pending partner credit scoring.' };
  }
}

@ApiTags('Admin - Rewards')
@ApiBearerAuth()
@AccountTypes(AccountType.ADMIN)
@Controller('admin/rewards')
export class AdminRewardsController {
  constructor(private readonly repo: RewardsRepository) {}

  @Get('/program')
  async getProgram(): Promise<object> {
    const program = await this.repo.getProgram();
    return { program };
  }

  @Post('/program')
  @HttpCode(HttpStatus.OK)
  async createProgram(
    @Body('name') name: string,
    @Body('tagline') tagline?: string,
    @Body('logoUrl') logoUrl?: string,
  ): Promise<object> {
    const program = await this.repo.upsertProgram({
      name,
      tagline: tagline ?? null,
      logoUrl: logoUrl ?? null,
    } as Partial<import('./schemas/rewards.schema').RewardsProgram>);
    return { program };
  }

  @Patch('/program')
  @HttpCode(HttpStatus.OK)
  async updateProgram(
    @Body('name') name?: string,
    @Body('tagline') tagline?: string,
    @Body('logoUrl') logoUrl?: string,
  ): Promise<object> {
    const program = await this.repo.upsertProgram({ name, tagline, logoUrl } as Partial<
      import('./schemas/rewards.schema').RewardsProgram
    >);
    return { program };
  }

  @Get('/config')
  getConfig(): object {
    return {
      marginGuardrailPercent: 5,
      maxCashbackRatePercent: 3,
      minRedemptionKobo: 50000,
      note: 'Config management UI is deferred. Values are applied statically in V1.',
    };
  }

  @Patch('/config')
  updateConfig(@Body() _body: unknown): object {
    return { message: 'Dynamic config updates are deferred. Modify static defaults in V1.' };
  }

  @Get('/tiers')
  async listTiers(): Promise<object> {
    const tiers = await this.repo.findTiers();
    return { tiers };
  }

  @Post('/tiers')
  @HttpCode(HttpStatus.CREATED)
  async createTier(
    @Body('name') name: string,
    @Body('minPoints') minPoints: number,
    @Body('maxPoints') maxPoints: number | null,
    @Body('cashbackRate') cashbackRate: number,
  ): Promise<object> {
    const tier = await this.repo.createTier({
      name,
      minPoints,
      maxPoints: maxPoints ?? null,
      cashbackRate,
    } as Partial<import('./schemas/rewards.schema').RewardsTier>);
    return { tier };
  }

  @Patch('/tiers/:id')
  async updateTier(
    @Param('id') id: string,
    @Body()
    body: Partial<{ name: string; minPoints: number; maxPoints: number; cashbackRate: number }>,
  ): Promise<object> {
    const tier = await this.repo.updateTier(
      id,
      body as Partial<import('./schemas/rewards.schema').RewardsTier>,
    );
    return { tier };
  }

  @Delete('/tiers/:id')
  @HttpCode(HttpStatus.OK)
  async deleteTier(@Param('id') id: string): Promise<object> {
    await this.repo.deleteTier(id);
    return { deleted: true, id };
  }

  @Get('/campaigns')
  async listCampaigns(): Promise<object> {
    const campaigns = await this.repo.findAllCampaigns();
    return { campaigns };
  }

  @Post('/campaigns')
  @HttpCode(HttpStatus.CREATED)
  async createCampaign(
    @Body('name') name: string,
    @Body('startsAt') startsAt: string,
    @Body('endsAt') endsAt: string,
    @Body('pointsMultiplier') pointsMultiplier = 1.0,
  ): Promise<object> {
    const campaign = await this.repo.createCampaign({
      name,
      startsAt: new Date(startsAt),
      endsAt: new Date(endsAt),
      pointsMultiplier,
    } as Partial<import('./schemas/rewards.schema').RewardsCampaign>);
    return { campaign };
  }

  @Patch('/campaigns/:id')
  async updateCampaign(
    @Param('id') id: string,
    @Body()
    body: Partial<{
      name: string;
      startsAt: string;
      endsAt: string;
      pointsMultiplier: number;
      isActive: boolean;
    }>,
  ): Promise<object> {
    const update: Partial<import('./schemas/rewards.schema').RewardsCampaign> = {};
    if (body.name) update.name = body.name;
    if (body.isActive !== undefined) update.isActive = body.isActive;
    if (body.pointsMultiplier !== undefined) update.pointsMultiplier = body.pointsMultiplier;
    if (body.startsAt) update.startsAt = new Date(body.startsAt);
    if (body.endsAt) update.endsAt = new Date(body.endsAt);
    const campaign = await this.repo.updateCampaign(id, update);
    return { campaign };
  }

  @Delete('/campaigns/:id')
  @HttpCode(HttpStatus.OK)
  async deleteCampaign(@Param('id') id: string): Promise<object> {
    await this.repo.deleteCampaign(id);
    return { deleted: true, id };
  }

  @Get('/fraud-alerts')
  getFraudAlerts(): object {
    return {
      alerts: [],
      note: 'Rewards fraud detection (velocity checks, multi-account abuse) is deferred pending ML pipeline.',
    };
  }
}
