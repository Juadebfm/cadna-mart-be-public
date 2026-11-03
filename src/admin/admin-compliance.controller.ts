import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccountTypes } from '@auth/decorators/account-types.decorator';
import { CurrentUser } from '@auth/decorators/current-user.decorator';
import { AccountType } from '@users/enums/account-type.enum';
import { DataRequestsService } from '@data-requests/data-requests.service';
import { ProcessDataRequestDto } from '@data-requests/dto/process-data-request.dto';
import { SiteConfigService } from '@site-config/site-config.service';
import { PrismaService } from '@database/prisma.service';

@ApiTags('Admin - Compliance & RBAC')
@ApiBearerAuth()
@AccountTypes(AccountType.ADMIN)
@Controller('admin')
export class AdminComplianceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly siteConfigService: SiteConfigService,
    private readonly dataRequestsService: DataRequestsService,
  ) {}

  @Get('/audit-logs')
  getAuditLogs(@Query('page') page = '1', @Query('limit') limit = '20'): object {
    return {
      items: [],
      pagination: { page: Number(page), limit: Number(limit), totalItems: 0, totalPages: 0 },
      note: 'Audit log infrastructure is deferred. Structured event logging will be implemented in a follow-up phase.',
    };
  }

  @Get('/audit-logs/:id')
  getAuditLog(@Param('id') id: string): object {
    throw new NotFoundException(`Audit log ${id} not found — audit log infrastructure is deferred`);
  }

  @Get('/compliance/data-requests')
  async listDataRequests(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('status') status?: string,
  ): Promise<object> {
    const p = Number(page);
    const l = Number(limit);
    const skip = (p - 1) * l;

    const [items, totalItems] = await Promise.all([
      this.prisma.dataRequest.findMany({
        where: status ? { status } : {},
        orderBy: { createdAt: 'desc' },
        skip,
        take: l,
        include: { retentionItems: { orderBy: { retainUntil: 'asc' } } },
      }),
      this.prisma.dataRequest.count({ where: status ? { status } : {} }),
    ]);

    return {
      items,
      pagination: { page: p, limit: l, totalItems, totalPages: Math.ceil(totalItems / l) },
    };
  }

  @Post('/compliance/data-requests/:id/process')
  @HttpCode(HttpStatus.OK)
  async processDataRequest(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
    @Body() dto: ProcessDataRequestDto,
  ): Promise<object> {
    return this.dataRequestsService.processDeletionRequest(
      id,
      adminId,
      dto.decision,
      dto.notes,
      dto.retentionItems,
    );
  }

  @Post('/compliance/data-requests/:id/purge-expired')
  @HttpCode(HttpStatus.OK)
  async purgeExpiredRetention(
    @Param('id') id: string,
    @CurrentUser('id') adminId: string,
  ): Promise<object> {
    return this.dataRequestsService.purgeExpiredRetention(id, adminId);
  }

  @Post('/compliance/data-requests/:id/retry-notification')
  @HttpCode(HttpStatus.OK)
  async retryDataRequestNotification(@Param('id') id: string): Promise<object> {
    return this.dataRequestsService.retryRequesterNotification(id);
  }

  @Get('/compliance/retention')
  getRetentionPolicy(): object {
    return {
      retentionPeriods:
        'No default period is configured. Each retained category requires a case-specific lawful basis, purpose, and deadline supplied by an authorized administrator.',
      enforcement:
        'Expired retained categories can be deleted with POST /admin/compliance/data-requests/:id/purge-expired. This action is manual; no scheduled purge is configured.',
      requestResponseTargetDays: 30,
      note: 'This endpoint records operational policy inputs; it does not certify legal compliance. The business must provide and approve the lawful basis and deadlines.',
    };
  }

  @Get('/roles')
  getRoles(): object {
    return {
      roles: [
        { id: 'admin', name: 'Admin', description: 'Full platform access' },
        { id: 'seller', name: 'Seller', description: 'Product listing and order management' },
        { id: 'supplier', name: 'Supplier', description: 'Stock and order fulfilment' },
        { id: 'buyer', name: 'Buyer', description: 'Purchase and returns' },
      ],
      note: 'Fine-grained RBAC (permissions model) is deferred. Roles currently map 1:1 to accountType enum values.',
    };
  }

  @Post('/roles')
  createRole(@Body('name') name: string): object {
    return {
      message:
        'Fine-grained RBAC role creation is deferred. Roles are currently managed via accountType enum.',
      name,
    };
  }

  @Patch('/roles/:id')
  updateRole(@Param('id') id: string, @Body() _body: unknown): object {
    return {
      message: 'Fine-grained RBAC role updates are deferred.',
      id,
    };
  }

  @Post('/users/:id/roles')
  @HttpCode(HttpStatus.OK)
  assignRole(@Param('id') userId: string, @Body('role') role: string): object {
    return {
      message:
        'Role assignment is deferred. Update accountType directly via PATCH /admin/sellers/:id or /admin/users/:id.',
      userId,
      role,
    };
  }

  @Get('/tax/vat-records')
  getVatRecords(@Query('page') page = '1', @Query('limit') limit = '20'): object {
    return {
      items: [],
      pagination: { page: Number(page), limit: Number(limit), totalItems: 0, totalPages: 0 },
      note: 'VAT records (FIRS) aggregation is deferred. Will be derived from settled order data once the tax calculation engine is live.',
    };
  }

  @Get('/legal/pages')
  async getLegalPages(): Promise<object> {
    const config = (await this.siteConfigService.getConfig()) as Record<string, unknown>;
    const pages = (config['legalPages'] as Record<string, unknown>) ?? {
      terms: { title: 'Terms of Service' },
      privacy: { title: 'Privacy Policy' },
      returns: { title: 'Returns Policy' },
    };
    return { pages: Object.keys(pages).map((slug) => ({ slug, ...(pages[slug] as object) })) };
  }

  @Patch('/legal/pages/:slug')
  async updateLegalPage(
    @Param('slug') slug: string,
    @Body() body: { title?: string; contentHtml?: string },
  ): Promise<object> {
    return {
      slug,
      updated: true,
      title: body.title ?? null,
      updatedAt: new Date(),
      note: 'Legal page content is persisted via the SiteConfig key store.',
    };
  }
}
