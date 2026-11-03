import { Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';
import { createPublicId } from '@database/id.util';

@Injectable()
export class NewsletterService {
  constructor(private readonly prisma: PrismaService) {}

  async subscribe(email: string) {
    const normalizedEmail = email.toLowerCase();
    await this.prisma.newsletterSubscription.upsert({
      where: { email: normalizedEmail },
      create: { id: createPublicId(), email: normalizedEmail },
      update: { isActive: true },
    });
    return { message: 'Subscription successful' };
  }
}
