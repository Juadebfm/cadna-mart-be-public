import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';

@Injectable()
export class PoliciesService {
  constructor(private readonly prisma: PrismaService) {}

  async getProductPolicy(productId: string) {
    const policy = await this.prisma.productPolicy.findUnique({ where: { productId } });

    if (!policy) {
      return {
        returnPolicy: {
          title: 'Return Policy',
          summary: 'Free return within 7 days for eligible items',
          detailsUrl: '/policies/returns',
        },
        warrantyPolicy: {
          title: 'Warranty',
          summary: 'Warranty information unavailable for this product',
          detailsUrl: null,
        },
      };
    }

    return {
      returnPolicy: policy.returnPolicy,
      warrantyPolicy: policy.warrantyPolicy,
    };
  }
}
