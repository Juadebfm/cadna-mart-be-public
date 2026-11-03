import { ServiceUnavailableException } from '@nestjs/common';
import { SellerPiiService } from './seller-pii.service';

describe('SellerPiiService', () => {
  const settings = { sellerPiiEncryptionKey: 'a'.repeat(64) };
  const service = new SellerPiiService(settings as any);

  it('encrypts payout account numbers and decrypts them only with the configured key', () => {
    const encrypted = service.encryptBankAccountNumber('0123456789');
    expect(encrypted).toMatch(/^v1:/);
    expect(encrypted).not.toContain('0123456789');
    expect(service.decryptBankAccountNumber(encrypted)).toBe('0123456789');
  });

  it('creates a keyed fingerprint that changes when applicant identity fields change', () => {
    const birthDate = new Date('1992-04-18T00:00:00.000Z');
    const fingerprint = service.fingerprintSellerIdentity('Ada', 'Okafor', birthDate);
    expect(service.fingerprintSellerIdentity(' Ada ', 'OKAFOR', birthDate)).toBe(fingerprint);
    expect(service.fingerprintSellerIdentity('Ada', 'Obi', birthDate)).not.toBe(fingerprint);
  });

  it('fails closed if the encryption key is not a 32-byte hexadecimal key', () => {
    settings.sellerPiiEncryptionKey = 'not-a-key';
    expect(() => service.encryptBankAccountNumber('0123456789')).toThrow(
      ServiceUnavailableException,
    );
  });
});
