import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '@database/prisma.service';
import { createPublicId } from '@database/id.util';
import { Notification } from './schemas/notification.schema';

@Injectable()
export class NotificationsRepository {
  constructor(private readonly prisma: PrismaService) {}
  private legacy(row: any): Notification | null {
    return row ? ({ ...row, _id: row.id } as unknown as Notification) : null;
  }

  async findByUser(userId: string, page: number, limit: number) {
    const where = { userId };
    const [rows, totalItems] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
    ]);
    return { items: rows.map((row) => this.legacy(row)!), totalItems };
  }

  async markRead(id: string, userId: string): Promise<Notification | null> {
    const result = await this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true, readAt: new Date() },
    });
    if (!result.count) return null;
    return this.legacy(await this.prisma.notification.findUnique({ where: { id } }));
  }

  async create(data: Partial<Notification>): Promise<Notification> {
    const value = data as any;
    return this.legacy(
      await this.prisma.notification.create({
        data: {
          id: createPublicId(),
          userId: String(value.userId),
          title: value.title,
          body: value.body,
          actionUrl: value.actionUrl ?? null,
          isRead: value.isRead ?? false,
          readAt: value.readAt ?? null,
          type: value.type ?? 'general',
          sourceEventId: value.sourceEventId ?? null,
        },
      }),
    )!;
  }

  async findBySourceEventId(sourceEventId: string): Promise<Notification | null> {
    return this.legacy(await this.prisma.notification.findUnique({ where: { sourceEventId } }));
  }

  async registerDevice(userId: string, fid: string): Promise<void> {
    try {
      const existing = await this.prisma.notificationDevice.findUnique({ where: { fid } });
      if (existing && existing.userId !== userId)
        throw new ConflictException('This device is registered to another account.');
      if (existing) return;
      await this.prisma.notificationDevice.create({ data: { id: createPublicId(), userId, fid } });
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      if ((error as { code?: string }).code === 'P2002')
        throw new ConflictException('This device is registered to another account.');
      throw error;
    }
  }

  async removeDevice(userId: string, fid: string): Promise<void> {
    await this.prisma.notificationDevice.deleteMany({ where: { userId, fid } });
  }

  async findDeviceFids(userId: string): Promise<Array<{ _id: string; fid: string }>> {
    const rows = await this.prisma.notificationDevice.findMany({
      where: { userId },
      select: { id: true, fid: true },
    });
    return rows.map(({ id, fid }) => ({ _id: id, fid }));
  }

  async removeDevicesByIds(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await this.prisma.notificationDevice.deleteMany({ where: { id: { in: ids } } });
  }
}
