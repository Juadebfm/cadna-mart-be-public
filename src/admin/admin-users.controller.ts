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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AccountTypes } from '@auth/decorators/account-types.decorator';
import { AccountType } from '@users/enums/account-type.enum';
import { UsersService } from '@users/users.service';
import { UserQueryDto } from '@users/dto/user-query.dto';
import { UpdateUserDto } from '@users/dto/update-user.dto';
import { ParsePublicIdPipe } from '@common/pipes/parse-public-id.pipe';
import { DataRequestsService } from '@data-requests/data-requests.service';
import { DataRequestKind, DataRequestSource } from '@data-requests/schemas/data-request.schema';

@ApiTags('Admin — Users')
@ApiBearerAuth()
@AccountTypes(AccountType.ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly dataRequestsService: DataRequestsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List users (admin-scoped, supports search + accountType filter)' })
  async findAll(@Query() query: UserQueryDto) {
    return this.usersService.findAll(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user by id (admin)' })
  async findOne(@Param('id', ParsePublicIdPipe) id: string) {
    return this.usersService.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user by id (admin)' })
  async update(@Param('id', ParsePublicIdPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Request buyer erasure or soft-delete a non-buyer account (admin)' })
  async remove(@Param('id', ParsePublicIdPipe) id: string) {
    const user = await this.usersService.findById(id);
    if (user.accountType === AccountType.BUYER) {
      const request = await this.dataRequestsService.create(
        id,
        DataRequestKind.DELETE,
        'Deletion requested by an administrator; pending compliance review',
        user.email,
        user.isPhoneVerified ? user.phoneNumber : null,
        DataRequestSource.ADMIN,
      );
      return { id: request.id, status: request.status, submittedAt: request.createdAt };
    }
    await this.dataRequestsService.deleteSellerApplicationDocuments(id);
    await this.usersService.remove(id);
    return { id, status: 'soft_deleted' };
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Suspend (deactivate) a user account. Reactivate by sending {"active": true} - the body is optional and defaults to suspending.',
  })
  async suspend(
    @Param('id', ParsePublicIdPipe) id: string,
    @Body() body: { active?: boolean } = {},
  ) {
    const isActive = body?.active === true;
    const user = await this.usersService.setActive(id, isActive);
    return {
      id: (user as unknown as { _id: { toString(): string } })._id.toString(),
      isActive: user.isActive,
      message: user.isActive ? 'User reactivated' : 'User suspended',
    };
  }
}
