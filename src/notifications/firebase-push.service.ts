import { Injectable } from '@nestjs/common';
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, FidMulticastMessage } from 'firebase-admin/messaging';
import { ConfigService } from '@config/config.service';
import { LoggerService } from '@logger/logger.service';
import { NotificationsRepository } from './notifications.repository';

@Injectable()
export class FirebasePushService {
  constructor(
    private readonly configService: ConfigService,
    private readonly repo: NotificationsRepository,
    private readonly logger: LoggerService,
  ) {}

  async registerDevice(userId: string, fid: string): Promise<void> {
    await this.repo.registerDevice(userId, fid);
  }

  async removeDevice(userId: string, fid: string): Promise<void> {
    await this.repo.removeDevice(userId, fid);
  }

  async sendToUser(
    userId: string,
    title: string,
    body: string,
    actionUrl?: string,
  ): Promise<boolean> {
    const { projectId, credentialsConfigured } = this.configService.firebase;
    if (!credentialsConfigured) return false;

    try {
      const devices = await this.repo.findDeviceFids(userId);
      if (devices.length === 0) return false;
      const app =
        getApps()[0] ??
        initializeApp({
          credential: applicationDefault(),
          projectId,
        });
      const messaging = getMessaging(app);
      let accepted = false;

      for (let offset = 0; offset < devices.length; offset += 500) {
        const batch = devices.slice(offset, offset + 500);
        const message: FidMulticastMessage = {
          fids: batch.map((device) => device.fid),
          notification: { title, body },
          ...(actionUrl ? { data: { actionUrl } } : {}),
        };
        const result = await messaging.sendEachForMulticast(message);
        accepted ||= result.successCount > 0;
        const invalidIds = result.responses.flatMap((response, index) =>
          response.error?.code === 'messaging/registration-token-not-registered'
            ? [batch[index]._id]
            : [],
        );
        await this.repo.removeDevicesByIds(invalidIds);
      }
      return accepted;
    } catch {
      this.logger.warn('Firebase push delivery failed.', 'FirebasePushService');
      return false;
    }
  }
}
