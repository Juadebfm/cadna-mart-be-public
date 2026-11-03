import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { ConfigService } from '@config/config.service';
import { Readable } from 'stream';
import { AccountType } from '@users/enums/account-type.enum';
import { randomUUID } from 'node:crypto';

export type UploadFolder =
  'products' | 'stores' | 'categories' | 'profiles' | 'support' | 'reviews' | 'general';

export type PrivateSellerDocumentUpload = {
  storageKey: string;
  resourceType: string;
  format: string;
  sizeBytes: number;
};
export type PrivateSupportAttachmentUpload = {
  storageKey: string;
  resourceType: string;
  format: string;
  sizeBytes: number;
};

@Injectable()
export class UploadService {
  constructor(private readonly configService: ConfigService) {
    const { cloudName, apiKey, apiSecret } = this.configService.storage;
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
  }

  async uploadFile(
    file: Express.Multer.File,
    folder: UploadFolder = 'general',
    ownerId?: string,
  ): Promise<{ url: string; publicId: string }> {
    const { cloudName } = this.configService.storage;
    if (!cloudName) {
      throw new BadRequestException('Storage is not configured');
    }

    const scopedFolder = this.buildFolder(folder, ownerId);

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: scopedFolder,
          resource_type: 'image',
          transformation: [{ quality: 'auto', fetch_format: 'auto' }],
        },
        (error, result) => {
          if (error || !result) return reject(error ?? new Error('Upload failed'));
          resolve(result);
        },
      );
      Readable.from(file.buffer).pipe(uploadStream);
    });

    return { url: result.secure_url, publicId: result.public_id };
  }

  async uploadPrivateSellerDocument(
    file: Express.Multer.File,
    userId: string,
  ): Promise<PrivateSellerDocumentUpload> {
    const { cloudName } = this.configService.storage;
    if (!cloudName) throw new BadRequestException('Storage is not configured');
    const publicId = `${this.buildFolder('support', userId)}/seller-application/${randomUUID()}`;
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          public_id: publicId,
          resource_type: 'auto',
          type: 'authenticated',
          overwrite: false,
          use_filename: false,
          unique_filename: false,
          context: { ownerId: userId, documentClass: 'seller-application' },
        },
        (error, uploaded) => {
          if (error || !uploaded) return reject(error ?? new Error('Private upload failed'));
          resolve(uploaded);
        },
      );
      Readable.from(file.buffer).pipe(uploadStream);
    });
    return {
      storageKey: result.public_id,
      resourceType: result.resource_type,
      format: result.format,
      sizeBytes: result.bytes,
    };
  }

  async uploadPrivateSupportAttachment(
    file: Express.Multer.File,
    userId: string,
  ): Promise<PrivateSupportAttachmentUpload> {
    const { cloudName } = this.configService.storage;
    if (!cloudName) throw new BadRequestException('Storage is not configured');
    const storageKey = `${this.buildFolder('support', userId)}/ticket-attachments/${randomUUID()}`;
    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          public_id: storageKey,
          resource_type: 'auto',
          type: 'authenticated',
          overwrite: false,
          use_filename: false,
          unique_filename: false,
          context: { ownerId: userId, documentClass: 'support-ticket-attachment' },
        },
        (error, uploaded) => {
          if (error || !uploaded) return reject(error ?? new Error('Private upload failed'));
          resolve(uploaded);
        },
      );
      Readable.from(file.buffer).pipe(uploadStream);
    });
    return {
      storageKey: result.public_id,
      resourceType: result.resource_type,
      format: result.format,
      sizeBytes: result.bytes,
    };
  }

  async deletePrivateSupportAttachment(storageKey: string, resourceType: string): Promise<void> {
    const { cloudName } = this.configService.storage;
    if (!cloudName) throw new BadRequestException('Storage is not configured');
    await cloudinary.uploader.destroy(storageKey, {
      resource_type: resourceType as 'image' | 'video' | 'raw',
      type: 'authenticated',
      invalidate: true,
    });
  }

  createPrivateSupportAttachmentDownloadUrl(
    storageKey: string,
    resourceType: string,
    format: string,
    expiresInSeconds = 60,
  ): string {
    const { cloudName } = this.configService.storage;
    if (!cloudName) throw new BadRequestException('Storage is not configured');
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
    return cloudinary.utils.private_download_url(storageKey, format, {
      resource_type: resourceType as 'image' | 'video' | 'raw',
      type: 'authenticated',
      expires_at: expiresAt,
    });
  }

  async deletePrivateSellerDocument(storageKey: string, resourceType: string): Promise<void> {
    const { cloudName } = this.configService.storage;
    if (!cloudName) throw new BadRequestException('Storage is not configured');
    await cloudinary.uploader.destroy(storageKey, {
      resource_type: resourceType as 'image' | 'video' | 'raw',
      type: 'authenticated',
      invalidate: true,
    });
  }

  createPrivateSellerDocumentDownloadUrl(
    storageKey: string,
    resourceType: string,
    format: string,
    expiresInSeconds = 60,
  ): string {
    const { cloudName } = this.configService.storage;
    if (!cloudName) throw new BadRequestException('Storage is not configured');
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
    return cloudinary.utils.private_download_url(storageKey, format, {
      resource_type: resourceType as 'image' | 'video' | 'raw',
      type: 'authenticated',
      expires_at: expiresAt,
    });
  }

  createPresignedUpload(folder: UploadFolder = 'general', ownerId: string) {
    const { cloudName, apiKey, apiSecret } = this.configService.storage;
    if (!cloudName || !apiKey || !apiSecret) {
      throw new BadRequestException('Storage is not configured');
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const scopedFolder = this.buildFolder(folder, ownerId);
    const signature = cloudinary.utils.api_sign_request(
      { folder: scopedFolder, timestamp },
      apiSecret,
    );

    return {
      cloudName,
      apiKey,
      timestamp,
      signature,
      folder: scopedFolder,
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    };
  }

  async deleteFile(publicId: string): Promise<void> {
    const { cloudName } = this.configService.storage;
    if (!cloudName) return;
    await cloudinary.uploader.destroy(publicId);
  }

  resolveOwnedImage(publicId: string, folder: UploadFolder, ownerId: string) {
    const expectedPrefix = `cadna-mart/${folder}/user-${ownerId}/`;
    if (!publicId.startsWith(expectedPrefix)) {
      throw new ForbiddenException('You do not own this media asset');
    }
    return {
      publicId,
      url: cloudinary.url(publicId, {
        secure: true,
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
      }),
    };
  }

  async deleteOwnedFile(
    encodedPublicId: string,
    currentUser: { userId: string; accountType: string },
  ) {
    const publicId = this.decodePublicId(encodedPublicId);

    if (currentUser.accountType !== AccountType.ADMIN) {
      const ownershipMarker = `/user-${currentUser.userId}/`;
      if (!publicId.startsWith('cadna-mart/') || !publicId.includes(ownershipMarker)) {
        throw new ForbiddenException('You do not own this media asset');
      }
    }

    await this.deleteFile(publicId);
    return { publicId };
  }

  private buildFolder(folder: UploadFolder, ownerId?: string) {
    const baseFolder = `cadna-mart/${folder}`;
    return ownerId ? `${baseFolder}/user-${ownerId}` : baseFolder;
  }

  private decodePublicId(encodedPublicId: string) {
    try {
      const decoded = Buffer.from(encodedPublicId, 'base64url').toString('utf8').trim();
      if (!decoded) {
        throw new Error('Empty public id');
      }
      return decoded;
    } catch {
      throw new BadRequestException('Invalid media identifier');
    }
  }
}
