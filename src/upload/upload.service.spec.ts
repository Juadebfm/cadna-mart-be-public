import { ForbiddenException } from '@nestjs/common';
import { UploadService } from './upload.service';

describe('UploadService', () => {
  const createService = () =>
    new UploadService({
      storage: {
        cloudName: 'test-cloud',
        apiKey: 'test-key',
        apiSecret: 'test-secret',
      },
    } as any);

  it('creates scoped Cloudinary signed upload params', () => {
    const service = createService();
    const result = service.createPresignedUpload('products', 'abc123');

    expect(result.cloudName).toBe('test-cloud');
    expect(result.apiKey).toBe('test-key');
    expect(result.folder).toBe('cadna-mart/products/user-abc123');
    expect(result.uploadUrl).toBe('https://api.cloudinary.com/v1_1/test-cloud/image/upload');
    expect(typeof result.signature).toBe('string');
    expect(result.signature.length).toBeGreaterThan(0);
  });

  it('allows the owner to delete their own scoped asset', async () => {
    const service = createService();
    const deleteFileSpy = jest.spyOn(service, 'deleteFile').mockResolvedValue(undefined);
    const publicId = 'cadna-mart/products/user-owner123/file-1';
    const encodedPublicId = Buffer.from(publicId).toString('base64url');

    await expect(
      service.deleteOwnedFile(encodedPublicId, {
        userId: 'owner123',
        accountType: 'SELLER',
      }),
    ).resolves.toEqual({ publicId });

    expect(deleteFileSpy).toHaveBeenCalledWith(publicId);
  });

  it('blocks non-admin users from deleting someone else’s asset', async () => {
    const service = createService();
    const publicId = 'cadna-mart/products/user-owner123/file-1';
    const encodedPublicId = Buffer.from(publicId).toString('base64url');

    await expect(
      service.deleteOwnedFile(encodedPublicId, {
        userId: 'intruder456',
        accountType: 'SELLER',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
