import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '@database/prisma.service';
import { createPublicId } from '@database/id.util';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

const addressSelection = {
  id: true,
  userId: true,
  label: true,
  recipientName: true,
  phoneNumber: true,
  street1: true,
  street2: true,
  city: true,
  lga: true,
  state: true,
  country: true,
  postalCode: true,
  notes: true,
  isDefault: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AddressSelect;

type AddressRow = Prisma.AddressGetPayload<{ select: typeof addressSelection }>;
type AddressResponse = Omit<AddressRow, 'id'> & { _id: string };

function toAddressResponse(address: AddressRow): AddressResponse {
  const { id, ...fields } = address;
  return { ...fields, _id: id };
}

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<AddressResponse[]> {
    const addresses = await this.prisma.address.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
      select: addressSelection,
    });
    return addresses.map(toAddressResponse);
  }

  async create(userId: string, dto: CreateAddressDto): Promise<AddressResponse> {
    const address = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.address.count({ where: { userId, deletedAt: null } });
      const shouldBeDefault = existing === 0 || dto.isDefault === true;

      if (shouldBeDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true, deletedAt: null },
          data: { isDefault: false },
        });
      }

      return tx.address.create({
        data: {
          ...dto,
          id: createPublicId(),
          userId,
          isDefault: shouldBeDefault,
        },
        select: addressSelection,
      });
    });

    return toAddressResponse(address);
  }

  async update(userId: string, addressId: string, dto: UpdateAddressDto): Promise<AddressResponse> {
    await this.findOwnedAddress(userId, addressId);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true) {
        await tx.address.updateMany({
          where: { userId, isDefault: true, deletedAt: null },
          data: { isDefault: false },
        });
      }

      return tx.address.update({
        where: { id: addressId },
        data: dto,
        select: addressSelection,
      });
    });
    return toAddressResponse(updated);
  }

  async remove(userId: string, addressId: string): Promise<void> {
    await this.findOwnedAddress(userId, addressId);
    await this.prisma.address.update({
      where: { id: addressId },
      data: { deletedAt: new Date(), isDefault: false },
    });
  }

  async setDefault(userId: string, addressId: string): Promise<AddressResponse> {
    await this.findOwnedAddress(userId, addressId);
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.address.updateMany({
        where: { userId, isDefault: true, deletedAt: null },
        data: { isDefault: false },
      });
      return tx.address.update({
        where: { id: addressId },
        data: { isDefault: true },
        select: addressSelection,
      });
    });
    return toAddressResponse(updated);
  }

  private async findOwnedAddress(userId: string, addressId: string): Promise<AddressRow> {
    const address = await this.prisma.address.findFirst({
      where: { id: addressId, deletedAt: null },
      select: addressSelection,
    });
    if (!address) throw new NotFoundException('Address not found');
    if (address.userId !== userId) {
      throw new ForbiddenException('You do not own this address');
    }
    return address;
  }
}
