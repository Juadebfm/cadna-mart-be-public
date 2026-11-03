import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Public } from '@auth/decorators/public.decorator';
import { AccountTypes } from '@auth/decorators/account-types.decorator';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { AccountType } from '@users/enums/account-type.enum';
import { PartnersRepository } from './partners.repository';

@ApiTags('Partners')
@ApiBearerAuth()
@Controller('partners')
export class PartnersController {
  constructor(private readonly repo: PartnersRepository) {}

  @Public()
  @Post('/onboard')
  @HttpCode(HttpStatus.CREATED)
  async onboard(
    @Body('email') email: string,
    @Body('businessName') businessName: string,
  ): Promise<object> {
    return {
      message: 'Partner application received. Our team will contact you within 48 hours.',
      email,
      businessName,
      note: 'Full partner onboarding flow (KYC partner, credit bureau checks) is deferred. Manual review in V1.',
    };
  }

  @Post('/me/kyc')
  @HttpCode(HttpStatus.OK)
  async submitKyc(@CurrentUser('id') userId: string, @Body() _body: unknown): Promise<object> {
    await this.repo.updateProfile(userId, { kycSubmitted: true });
    return {
      kycSubmitted: true,
      note: 'KYC document review is manual in V1. Integration with a verification partner is deferred.',
    };
  }

  @Post('/me/agreement')
  @HttpCode(HttpStatus.OK)
  async acceptAgreement(@CurrentUser('id') userId: string): Promise<object> {
    await this.repo.updateProfile(userId, {
      agreementAccepted: true,
      agreementAcceptedAt: new Date(),
    } as Partial<import('./schemas/partner-profile.schema').PartnerProfile>);
    return { agreementAccepted: true, acceptedAt: new Date() };
  }

  @Get('/me/dashboard')
  async getDashboard(@CurrentUser('id') userId: string): Promise<object> {
    const profile = await this.repo.findOrCreateProfile(userId);
    const { items: commitments } = await this.repo.findCommitmentsByPartner(
      (profile as unknown as { _id: { toString(): string } })._id.toString(),
      1,
      100,
    );
    const totalCommitted = commitments.reduce((s, c) => s + c.amountNGN, 0);
    return {
      status: profile.status,
      fundingCapNGN: profile.fundingCapNGN,
      totalCommittedNGN: totalCommitted,
      availableCapNGN: Math.max(0, profile.fundingCapNGN - totalCommitted),
      activeCommitments: commitments.filter((c) => c.status === 'active').length,
    };
  }

  @Get('/me/eligible-items')
  async getEligibleItems(): Promise<object> {
    return {
      items: [],
      note: 'Eligible item discovery (inventory scoring, margin analysis) is deferred. Manual selection in V1.',
    };
  }

  @Get('/me/eligible-items/:id')
  async getEligibleItem(@Param('id') id: string): Promise<object> {
    return {
      id,
      note: 'Item performance detail is deferred pending sales-velocity data pipeline.',
    };
  }

  @Post('/me/commitments')
  @HttpCode(HttpStatus.CREATED)
  async createCommitment(
    @CurrentUser('id') userId: string,
    @Body('productId') productId: string,
    @Body('amountNGN') amountNGN: number,
  ): Promise<object> {
    const profile = await this.repo.findOrCreateProfile(userId);
    const profileId = (profile as unknown as { _id: { toString(): string } })._id.toString();
    const commitment = await this.repo.createCommitment(profileId, productId, amountNGN);
    return { commitment };
  }

  @Get('/me/commitments')
  async listCommitments(
    @CurrentUser('id') userId: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ): Promise<object> {
    const profile = await this.repo.findOrCreateProfile(userId);
    const profileId = (profile as unknown as { _id: { toString(): string } })._id.toString();
    const { items, totalItems } = await this.repo.findCommitmentsByPartner(
      profileId,
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

  @Get('/me/commitments/:id')
  async getCommitment(@Param('id') id: string): Promise<object> {
    const commitment = await this.repo.findCommitmentById(id);
    return { commitment };
  }

  @Get('/me/commitments/:id/status')
  async getCommitmentStatus(@Param('id') id: string): Promise<object> {
    const commitment = await this.repo.findCommitmentById(id);
    return { id, status: commitment?.status ?? null };
  }

  @Get('/me/settlements')
  async getSettlements(): Promise<object> {
    return {
      items: [],
      note: 'Settlement history is deferred pending partner reconciliation engine build-out.',
    };
  }

  @Post('/me/disputes')
  @HttpCode(HttpStatus.CREATED)
  async raiseDispute(
    @CurrentUser('id') userId: string,
    @Body('commitmentId') commitmentId: string,
    @Body('reason') reason: string,
  ): Promise<object> {
    const profile = await this.repo.findOrCreateProfile(userId);
    const profileId = (profile as unknown as { _id: { toString(): string } })._id.toString();
    const dispute = await this.repo.createDispute(profileId, commitmentId, reason);
    return { dispute };
  }
}

@ApiTags('Admin - Partners')
@ApiBearerAuth()
@AccountTypes(AccountType.ADMIN)
@Controller('admin/partners')
export class AdminPartnersController {
  constructor(private readonly repo: PartnersRepository) {}

  @Get('/')
  async listPartners(@Query('page') page = '1', @Query('limit') limit = '20'): Promise<object> {
    const { items, totalItems } = await this.repo.findAllProfiles(Number(page), Number(limit));
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

  @Post('/:id/approve')
  @HttpCode(HttpStatus.OK)
  async approvePartner(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ): Promise<object> {
    const profile = await this.repo.approveProfile(id, adminId);
    return { profile };
  }

  @Get('/eligibility-rules')
  getEligibilityRules(): object {
    return {
      minOrderHistoryMonths: 3,
      minSuccessfulOrders: 10,
      maxDefaultRate: 0.02,
      note: 'Rules are static in V1. Dynamic rule engine is deferred.',
    };
  }

  @Post('/eligibility-rules')
  updateEligibilityRules(@Body() _body: unknown): object {
    return { message: 'Dynamic eligibility rule updates are deferred. Edit static config in V1.' };
  }

  @Get('/commitments')
  async listAllCommitments(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ): Promise<object> {
    const { items, totalItems } = await this.repo.findAllCommitments(Number(page), Number(limit));
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

  @Post('/commitments/:id/approve')
  @HttpCode(HttpStatus.OK)
  async approveCommitment(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ): Promise<object> {
    const commitment = await this.repo.approveCommitment(id, adminId);
    return { commitment };
  }

  @Post('/disputes/:id/resolve')
  @HttpCode(HttpStatus.OK)
  async resolveDispute(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body('resolution') resolution: string,
  ): Promise<object> {
    const dispute = await this.repo.resolveDispute(id, adminId, resolution);
    return { dispute };
  }

  @Get('/funding-caps')
  getFundingCaps(): object {
    return {
      globalCapNGN: 5000000,
      perPartnerDefaultCapNGN: 500000,
      note: 'Caps are set per partner at approval. Global cap management UI is deferred.',
    };
  }

  @Post('/funding-caps')
  updateFundingCaps(@Body() _body: unknown): object {
    return {
      message: 'Global funding-cap management is deferred. Set per-partner caps at approval time.',
    };
  }
}
