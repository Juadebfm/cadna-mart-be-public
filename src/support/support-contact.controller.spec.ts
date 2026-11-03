import { ServiceUnavailableException } from '@nestjs/common';
import { SupportContactController } from './support-contact.controller';

describe('SupportContactController', () => {
  let controller: SupportContactController;
  const emailService = { sendContactMessage: jest.fn() };
  const siteConfigService = { getPublicConfig: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    siteConfigService.getPublicConfig.mockResolvedValue({
      contact: { email: 'configured-support@example.com' },
    });
    emailService.sendContactMessage.mockResolvedValue(true);
    controller = new SupportContactController(emailService as any, siteConfigService as any);
  });

  it('emails the configured support address and uses the sender as reply-to', async () => {
    const result = await controller.sendContactMessage({
      name: 'Ada Buyer',
      email: 'ada@example.com',
      subject: 'Question',
      message: 'Please contact me.',
    });

    expect(result).toEqual({ accepted: true });
    expect(emailService.sendContactMessage).toHaveBeenCalledWith({
      to: 'configured-support@example.com',
      replyTo: 'ada@example.com',
      name: 'Ada Buyer',
      subject: 'Question',
      message: 'Please contact me.',
    });
  });

  it('does not create a support ticket when a guest contacts support', async () => {
    await controller.sendContactMessage({
      name: 'Ada Buyer',
      email: 'ada@example.com',
      subject: 'Question',
      message: 'Please contact me.',
    });

    expect(emailService.sendContactMessage).toHaveBeenCalledTimes(1);
  });

  it('returns a retryable service error if email delivery fails', async () => {
    emailService.sendContactMessage.mockResolvedValue(false);
    await expect(
      controller.sendContactMessage({
        name: 'Ada Buyer',
        email: 'ada@example.com',
        subject: 'Question',
        message: 'Please contact me.',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
